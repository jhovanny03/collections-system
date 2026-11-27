// GENERATED from src/billing/callPriority.js by scripts/build-shared.js. Do not edit here.
"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/billing/callPriority.js
// "Who to call first" on the Follow-ups call queue: how likely a client on the follow-up
// list is to pay this month, and the best time to reach them. A scoring model built from
// the firm's own history (no outside service, no client data leaves the system):
//   - how they paid each installment over the last 12 months (on time / late / not paid),
//   - whether they paid the months they were on the follow-up list before,
//   - whether they kept the promises recorded in their notes,
//   - how far behind they are now, whether their plan ended, and how long since they paid.
// Every score comes with the reasons behind it. The weights were checked against past
// follow-up lists (collections-rebuild/backtest-priority.js): see BANDS for how often each
// band actually paid.
var _plans = require('./plans');
var _ledger = require('./ledger');
var _dates = require('../utils/dates');

const pad2 = (n) => String(n).padStart(2, "0");
 const ymOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; exports.ymOf = ymOf;
 const addMonths = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  return exports.ymOf.call(void 0, new Date(y, m - 1 + n, 1));
}; exports.addMonths = addMonths;
const monthEnd = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0, 23, 59, 59);
};

/** Installments due in the 12 months before asOf's month: paid on time, paid late, not paid. */
 function payRecord(client, asOf = new Date()) {
  const cur = exports.ymOf.call(void 0, asOf);
  const from = exports.addMonths.call(void 0, cur, -12);
  const months = new Map();
  for (const v of _plans.planViews.call(void 0, client)) {
    let led;
    try {
      led = _ledger.planLedger.call(void 0, v, asOf, asOf);
    } catch (e) {
      continue;
    }
    for (const m of led.months) {
      if (m.ym < from || m.ym >= cur) continue;
      const x = months.get(m.ym) || { amount: 0, paid: 0, last: null };
      x.amount += m.amount;
      x.paid += m.paid;
      for (const p of m.pieces || []) if (!x.last || p.date > x.last) x.last = p.date;
      months.set(m.ym, x);
    }
  }
  let onTime = 0, late = 0, unpaid = 0;
  for (const [ym, x] of months) {
    if (x.amount <= 0.005) continue;
    if (x.paid < x.amount - 0.5) unpaid++;
    else if (x.last && x.last <= monthEnd(ym)) onTime++;
    else late++;
  }
  return { due: onTime + late + unpaid, onTime, late, unpaid };
} exports.payRecord = payRecord;

/** Was the installment of `ym` paid in full by the end of that month? (all plans) */
 function paidMonthByEnd(client, ym) {
  const end = monthEnd(ym);
  let amount = 0, paid = 0;
  for (const v of _plans.planViews.call(void 0, client)) {
    let led;
    try {
      led = _ledger.planLedger.call(void 0, v, end, end);
    } catch (e) {
      continue;
    }
    const m = led.months.find((x) => x.ym === ym);
    if (m) {
      amount += m.amount;
      paid += m.paid;
    }
  }
  return amount > 0.005 ? paid >= amount - 0.5 : null;
} exports.paidMonthByEnd = paidMonthByEnd;

const PROMISE_RE = /promised to pay \$([\d,]+(?:\.\d+)?) on (\d{4}-\d{2}-\d{2})/i;
const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Every payment promise on a client: from the notes ("Client promised to pay $X on DATE",
 * written each time a promise is saved) plus the current promise on the record. Each
 * promise once (same date and amount). made = when it was recorded (null if unknown).
 */
 function promisesOf(client) {
  const out = new Map();
  for (const log of [...(client.communicationLogs || []), ...(client.communicationLog || [])]) {
    const m = String(log.message || "").match(PROMISE_RE);
    const due = m && _dates.parseDate.call(void 0, m[2]);
    if (!due) continue;
    const amount = Number(m[1].replace(/,/g, ""));
    const key = `${m[2]}|${amount}`;
    const made = _dates.parseDate.call(void 0, log.timestamp);
    if (!out.has(key) || (made && (!out.get(key).made || made < out.get(key).made))) out.set(key, { key, due, amount, made });
  }
  const cur = client.paymentPromise;
  const curDue = cur && _dates.parseDate.call(void 0, cur.date);
  if (curDue && Number(cur.amount) > 0) {
    const key = `${String(cur.date).slice(0, 10)}|${Number(cur.amount)}`;
    if (!out.has(key)) out.set(key, { key, due: curDue, amount: Number(cur.amount), made: _dates.parseDate.call(void 0, cur.createdAt) });
  }
  return [...out.values()].sort((a, b) => a.due - b.due);
} exports.promisesOf = promisesOf;

/** kept (paid the amount from the day it was made to 3 days after its date), broken, or open. */
 function promiseOutcome(promise, payments, asOf = new Date()) {
  const graceEnd = new Date(promise.due.getFullYear(), promise.due.getMonth(), promise.due.getDate() + 3, 23, 59, 59);
  const from = startOf(promise.made || new Date(promise.due.getTime() - 30 * 864e5));
  const paid = (payments || []).reduce((t, p) => {
    const d = _dates.parseDate.call(void 0, p.date);
    const a = Number(p.amount || 0);
    return d && a > 0 && d >= from && d <= graceEnd && d <= asOf ? t + a : t;
  }, 0);
  if (paid >= promise.amount - 0.5) return { status: "kept", paid };
  return { status: graceEnd > asOf ? "open" : "broken", paid };
} exports.promiseOutcome = promiseOutcome;

/** Promises recorded in the client's notes that are already decided by asOf: kept or not. */
 function promiseRecord(client, asOf = new Date()) {
  let kept = 0, broken = 0;
  for (const pr of promisesOf({ ...client, paymentPromise: null })) {
    if (!pr.made || pr.made > asOf) continue;
    const o = promiseOutcome(pr, client.payments, asOf);
    if (o.status === "kept") kept++;
    else if (o.status === "broken") broken++;
  }
  return { kept, broken };
} exports.promiseRecord = promiseRecord;

/**
 * Promises month by month (by the month they were due), for the reports:
 * { "YYYY-MM": { due, kept, broken, open, keptAmount, made, listMade } }
 * made = promises recorded that month; listMade = of those, by clients on that month's
 * follow-up list (listMonths: clientId -> [YYYY-MM]).
 */
 function promiseMonths(clients, asOf = new Date(), listMonths = new Map(), months = 13) {
  const from = exports.addMonths.call(void 0, exports.ymOf.call(void 0, asOf), -(months - 1));
  const out = {};
  const at = (ym) => (out[ym] = out[ym] || { due: 0, kept: 0, broken: 0, open: 0, keptAmount: 0, made: 0, listMade: 0 });
  for (const c of clients) {
    if (String(c.status || "").toLowerCase() === "closed") continue;
    const lists = new Set(listMonths.get(c.id) || []);
    for (const pr of promisesOf(c)) {
      const dueYm = exports.ymOf.call(void 0, pr.due);
      if (dueYm >= from && pr.due <= monthEnd(exports.ymOf.call(void 0, asOf))) {
        const o = promiseOutcome(pr, c.payments, asOf);
        const x = at(dueYm);
        x.due++;
        x[o.status]++;
        if (o.status === "kept") x.keptAmount += pr.amount;
      }
      if (pr.made && pr.made <= asOf) {
        const madeYm = exports.ymOf.call(void 0, pr.made);
        if (madeYm >= from) {
          at(madeYm).made++;
          if (lists.has(madeYm)) at(madeYm).listMade++;
        }
      }
    }
  }
  return out;
} exports.promiseMonths = promiseMonths;

/**
 * The score, 0–1, with the reasons behind it.
 * listMonths: months (YYYY-MM) the client was on a follow-up list before asOf's month.
 * now: { missedMonths, planEnded, lastPaymentDate } as of asOf.
 */
 function likelyToPay(client, { asOf = new Date(), listMonths = [], now = {} } = {}) {
  const pr = payRecord(client, asOf);
  const listed = listMonths.filter((ym) => ym < exports.ymOf.call(void 0, asOf)).slice(-12);
  const listPaid = listed.map((ym) => paidMonthByEnd(client, ym)).filter((x) => x != null);
  const listPaidN = listPaid.filter(Boolean).length;
  const promises = promiseRecord(client, asOf);
  const lastPay = _dates.parseDate.call(void 0, now.lastPaymentDate);
  const daysSincePay = lastPay ? Math.max(0, Math.floor((asOf - lastPay) / 864e5)) : 365;
  const missed = Math.min(8, Number(now.missedMonths || 0));

  const parts = [];
  if (pr.due >= 3) {
    parts.push({ w: 2.0 * (pr.onTime / pr.due), why: `Paid on time ${pr.onTime} of the last ${pr.due} months`, good: pr.onTime / pr.due >= 0.5 });
    if (pr.late) parts.push({ w: 0.8 * (pr.late / pr.due), why: `Paid late but paid ${pr.late} time${pr.late === 1 ? "" : "s"}`, good: true });
    if (pr.unpaid) parts.push({ w: -1.6 * (pr.unpaid / pr.due), why: `${pr.unpaid} of the last ${pr.due} months still unpaid`, good: false });
  } else {
    parts.push({ w: 0, why: "New on a plan: little payment history yet", good: null });
  }
  if (listPaid.length) {
    parts.push({ w: 1.4 * (listPaidN / listPaid.length - 0.5), why: `Paid ${listPaidN} of ${listPaid.length} months they were on the follow-up list`, good: listPaidN / listPaid.length >= 0.5 });
  }
  if (promises.kept + promises.broken) {
    const t = promises.kept + promises.broken;
    parts.push({ w: 1.0 * (promises.kept / t - 0.5), why: `Kept ${promises.kept} of ${t} promise${t === 1 ? "" : "s"}`, good: promises.kept / t >= 0.5 });
  }
  if (missed >= 2) parts.push({ w: -0.25 * missed, why: `${missed} installments behind`, good: false });
  if (now.planEnded) parts.push({ w: -1.0, why: "Plan ended and still owes", good: false });
  if (daysSincePay >= 45) parts.push({ w: -0.008 * Math.min(daysSincePay, 240), why: lastPay ? `No payment in ${daysSincePay} days` : "No payment on record", good: false });

  const z = -0.2 + parts.reduce((t, p) => t + p.w, 0);
  const p = 1 / (1 + Math.exp(-z));
  const reasons = parts.filter((x) => x.good !== null).sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, 3).map((x) => ({ text: x.why, good: x.good }));
  if (!reasons.length) reasons.push({ text: parts[0] ? parts[0].why : "Little history yet", good: null });
  return { p, band: exports.bandOf.call(void 0, p), reasons };
} exports.likelyToPay = likelyToPay;

// How often each band actually paid that month's installment, on the September and
// October 2026 follow-up lists (421 clients, scored as of the 16th with only what was known
// then: collections-rebuild/backtest-priority.js). Re-run it to re-check as months pass.
 const BANDS = [
  { key: "high", label: "Very likely", min: 0.9, paidRate: 0.77 },
  { key: "medium", label: "Maybe", min: 0.45, paidRate: 0.44 },
  { key: "low", label: "Unlikely", min: 0, paidRate: 0.03 },
]; exports.BANDS = BANDS;
 const bandOf = (p) => (exports.BANDS.find((b) => p >= b.min) || exports.BANDS[exports.BANDS.length - 1]).key; exports.bandOf = bandOf;

/* ------------------------------ best time to call ------------------------------ */

 const SLOTS = [
  { key: "9", label: "9–11 AM", from: 9, to: 11 },
  { key: "11", label: "11 AM–1 PM", from: 11, to: 13 },
  { key: "13", label: "1–3 PM", from: 13, to: 15 },
  { key: "15", label: "3–5 PM", from: 15, to: 17 },
  { key: "17", label: "5–7 PM", from: 17, to: 19 },
]; exports.SLOTS = SLOTS;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TZ = "America/New_York";
function localParts(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", hour: "numeric", hour12: false }).formatToParts(d);
  const hour = Number(f.find((x) => x.type === "hour").value) % 24;
  const day = f.find((x) => x.type === "weekday").value;
  return { hour, day };
}
const slotOf = (hour) => exports.SLOTS.find((s) => hour >= s.from && hour < s.to) || null;

/** Firm-wide: how often outbound calls are answered in each time slot. */
 function answerTable(calls) {
  const t = Object.fromEntries(exports.SLOTS.map((s) => [s.key, { tries: 0, answered: 0 }]));
  for (const c of calls) {
    if (c.direction !== "outbound") continue;
    const lp = localParts(c.at);
    const s = lp && slotOf(lp.hour);
    if (!s) continue;
    t[s.key].tries++;
    if (c.connected) t[s.key].answered++;
  }
  return t;
} exports.answerTable = answerTable;

/** Best time to reach one client: from their own answered calls, else when clients answer most. */
 function bestTime(clientCalls, table) {
  const mine = Object.fromEntries(exports.SLOTS.map((s) => [s.key, { n: 0, days: {} }]));
  let answered = 0, tries = 0;
  for (const c of clientCalls || []) {
    const lp = localParts(c.at);
    const s = lp && slotOf(lp.hour);
    if (!s) continue;
    if (c.direction === "outbound") tries++;
    if (!c.connected) continue;
    answered++;
    mine[s.key].n++;
    mine[s.key].days[lp.day] = (mine[s.key].days[lp.day] || 0) + 1;
  }
  if (answered >= 2) {
    const [key, x] = Object.entries(mine).sort((a, b) => b[1].n - a[1].n)[0];
    const day = Object.entries(x.days).sort((a, b) => b[1] - a[1])[0];
    return { slot: exports.SLOTS.find((s) => s.key === key).label, day: day && day[1] >= 2 ? day[0] : null, basis: `reached ${x.n} time${x.n === 1 ? "" : "s"} then${tries ? ` (${answered} of their calls connected)` : ""}`, own: true };
  }
  // Not enough history with this client: say so (the firm-wide best time is only a hint).
  const best = Object.entries(table || {}).filter(([, v]) => v.tries >= 8).sort((a, b) => b[1].answered / b[1].tries - a[1].answered / a[1].tries)[0];
  return {
    slot: null, day: null, own: false, answered, tries,
    firmSlot: best ? exports.SLOTS.find((s) => s.key === best[0]).label : null,
    firmRate: best ? Math.round((best[1].answered / best[1].tries) * 100) : null,
  };
} exports.bestTime = bestTime;
 const DAY_NAMES = DAYS; exports.DAY_NAMES = DAY_NAMES;
