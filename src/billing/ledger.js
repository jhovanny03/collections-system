// src/billing/ledger.js
// Month-by-month installment ledger: what each installment was and how much of it has
// been paid. Every billing figure about installments (past due, owed now, due vs
// collected per month) is read from this one structure.
//
// Rules (same as the follow-up list on the server):
//  - Installments are due on the 15th, starting the month of expectedAnchor or
//    firstInstallmentDate. Skipped months are not due. A paused client accrues nothing
//    after the pause.
//  - Each month's amount comes from the installment schedule (fallback: the plan's
//    monthly amount, then $500). The plan stops at its balance (invoice + balance
//    adjustments − initial payment); the last installment is whatever is left.
//  - Payments made after the initial payment (or, with no initial date, every payment
//    not marked initial) pay the oldest unpaid installment first, cents included.
import { planViews } from "./plans";
import { parseDate } from "../utils/dates";

const pad2 = (n) => String(n).padStart(2, "0");
const ymOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

function planBalance(c) {
  const base = Number(c.invoiceTotal || 0);
  const adj = (Array.isArray(c.invoiceAdjustments) ? c.invoiceAdjustments : []).reduce((s, a) => {
    if (String(a?.applyTo || "balance").toLowerCase() !== "balance") return s;
    return s + Math.max(0, Number(a?.amount || 0) - Math.max(0, Number(a?.downPayment || 0)));
  }, 0);
  return Math.max(0, base + adj - Number(c.initialPaymentAmount || 0));
}

function amountFor(c, schedule, date) {
  for (const s of schedule) {
    const a = parseDate(s.start);
    const b = parseDate(s.end);
    if (a && b && date >= a && date <= b) return Number(s.amount || 0);
  }
  return Number(c.installmentAmount || 0) || 500;
}

/**
 * The part of each payment that goes to installments (amount > 0), oldest first, made on
 * or before `cutoff`.
 *  - Clients rebuilt from MyCase: the payment's invoice decides (installment invoice →
 *    installment; initial or other invoice → not an installment).
 *  - Otherwise: payments up to the initial-payment date pay the initial payment, but only
 *    up to its amount; anything above it (e.g. a client who paid the whole plan on day
 *    one) counts toward installments.
 */
export function installmentPayments(c, cutoff = new Date(8640000000000000)) {
  const init = parseDate(c.initialPaymentDate);
  const roles = c.invoiceRoles || {};
  let initialLeft = Math.max(0, Number(c.initialPaymentAmount || 0));
  const out = [];
  const pays = (Array.isArray(c.payments) ? c.payments : [])
    .map((p) => ({ amount: Number(p.amount || 0), date: parseDate(p.date), kind: p.kind, invoiceId: p.invoiceId != null ? String(p.invoiceId) : "" }))
    .filter((p) => p.amount > 0 && p.date)
    .sort((a, b) => a.date - b.date);
  for (const p of pays) {
    const role = roles[p.invoiceId];
    let amount = p.amount;
    if (p.kind === "initial" || role === "initial" || role === "other") {
      initialLeft = Math.max(0, initialLeft - (role === "other" ? 0 : amount));
      continue;
    }
    if (role !== "installment" && init && p.date <= init) {
      const toInitial = Math.min(initialLeft, amount);
      initialLeft -= toInitial;
      amount -= toInitial;
    }
    if (amount > 0.005 && p.date <= cutoff) out.push({ amount, date: p.date });
  }
  return out;
}

/**
 * One plan (single-plan client or one plan view): installments due up to `asOf`
 * (plus how much has been paid toward each), with payments up to `cutoff`.
 * Returns { months: [{ym, due: Date, amount, paid}], balance, paidTotal, prepaid }.
 */
export function planLedger(c, asOf = new Date(), cutoff = asOf) {
  const status = String(c.status || "active").toLowerCase();
  const cap = planBalance(c);
  const startRaw = c.expectedAnchor || c.firstInstallmentDate;
  const start = parseDate(startRaw);
  const pays = installmentPayments(c, cutoff);
  const paidTotal = pays.reduce((s, p) => s + p.amount, 0);
  if (status === "closed" || !start || cap <= 0) return { months: [], balance: status === "closed" ? 0 : Math.max(0, cap - paidTotal), paidTotal, prepaid: 0 };

  const schedule = (c.installmentSchedule || []).slice().sort((a, b) => (parseDate(a.start) || 0) - (parseDate(b.start) || 0));
  const skip = new Set((c.skipMonths || c.skippedMonths || []).map(String));
  const pausedAt = status === "paused" ? parseDate(c.pauseStartedAt) : null;
  const stop = pausedAt && pausedAt < asOf ? pausedAt : asOf;

  const months = [];
  let total = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), 15);
  for (let guard = 0; cursor <= stop && total < cap - 0.005 && guard < 400; guard++) {
    if (!skip.has(ymOf(cursor))) {
      const amount = Math.min(amountFor(c, schedule, cursor), cap - total);
      months.push({ ym: ymOf(cursor), due: new Date(cursor), amount, paid: 0 });
      total += amount;
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  let pool = paidTotal;
  for (const m of months) {
    const take = Math.min(m.amount, pool);
    m.paid = take;
    pool -= take;
  }
  return { months, balance: Math.max(0, cap - paidTotal), paidTotal, prepaid: Math.max(0, pool) };
}

/**
 * Where a client stands today, all plans combined:
 *   pastDue      unpaid installments from months BEFORE the current one
 *   thisMonth    unpaid part of the current month's installment (once the 15th has passed)
 *   owedNow      pastDue + thisMonth (everything due by today and not paid)
 *   monthsBehind installments not fully paid (due by today)
 *   balance      left to collect on the plan(s)
 */
/**
 * Initial payment not (or no longer) paid. Only knowable for clients rebuilt from MyCase,
 * whose payments are tagged by invoice: e.g. MyCase refunded the initial payment.
 */
export function unpaidInitial(c) {
  const roles = c.invoiceRoles || {};
  if (!Object.values(roles).includes("initial")) return 0;
  const paid = (c.payments || [])
    .filter((p) => p.kind === "initial" || roles[String(p.invoiceId)] === "initial")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  return Math.max(0, Number(c.initialPaymentAmount || 0) - paid);
}

export function clientPosition(client, asOf = new Date()) {
  const cur = ymOf(asOf);
  let pastDue = 0;
  let thisMonth = 0;
  let monthsBehind = 0;
  let balance = 0;
  let planEnded = false;
  // An initial payment that was never paid (or was refunded) is owed from its date.
  const initialOwed = String(client.status || "").toLowerCase() === "closed" ? 0 : unpaidInitial(client);
  if (initialOwed > 0.005) {
    const d = parseDate(client.initialPaymentDate) || asOf;
    if (d <= asOf) {
      monthsBehind++;
      if (ymOf(d) < cur) pastDue += initialOwed;
      else thisMonth += initialOwed;
    }
    balance += initialOwed;
  }
  for (const v of planViews(client)) {
    const { months, balance: b } = planLedger(v, asOf);
    balance += b;
    for (const m of months) {
      const unpaid = Math.max(0, m.amount - m.paid);
      if (unpaid <= 0.005) continue;
      monthsBehind++;
      if (m.ym < cur) pastDue += unpaid;
      else thisMonth += unpaid;
    }
    const owed = months.reduce((s, m) => s + Math.max(0, m.amount - m.paid), 0);
    if (owed > 0.005 && owed >= b - 0.5) planEnded = true;
  }
  return { pastDue, thisMonth, owedNow: pastDue + thisMonth, monthsBehind, balance, planEnded };
}

/**
 * Due vs collected for month `ym`, for clients who were up to date going into it.
 * A client counts for the month when every earlier installment is paid as of `cutoff`
 * (payments go to the oldest month first). So a client who owed September and October
 * is not expected for October; once they pay September they move up and October's
 * installment counts as due (and whatever they paid toward it as collected).
 */
export function monthDueCollected(client, ym, cutoff) {
  const [y, m] = ym.split("-").map(Number);
  const monthEnd = new Date(y, m, 0, 23, 59, 59);
  let due = 0;
  let collected = 0;
  let clients = 0;
  for (const v of planViews(client)) {
    const { months } = planLedger(v, monthEnd, cutoff);
    const i = months.findIndex((x) => x.ym === ym);
    if (i === -1) continue;
    const before = months.slice(0, i);
    if (before.some((x) => x.paid < x.amount - 0.005)) continue; // still behind: not expected this month
    due += months[i].amount;
    collected += months[i].paid;
    clients++;
  }
  return { due, collected, clients: clients ? 1 : 0 };
}

/** Accountant aging buckets, by days since the 1st of the installment's month. */
export const AGING_BUCKETS = [
  { key: "b0", label: "0–30 days", help: "This month's installment, due or not yet due" },
  { key: "b30", label: "31–60 days", help: "Last month's installment" },
  { key: "b60", label: "61–90 days", help: "Two months back" },
  { key: "b90", label: "90+ days", help: "Three months back or older" },
];

const monthsBetween = (ymA, ymB) => {
  const [ya, ma] = ymA.split("-").map(Number);
  const [yb, mb] = ymB.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
};

/**
 * What a client owes, split into aging buckets. Every installment of the current month
 * counts in 0–30 even before its due date (the 15th): the accountant ages receivables
 * from the 1st of the month. Payments up to `asOf`; oldest installments are paid first.
 * Returns { b0, b30, b60, b90, total }.
 */
export function agingOf(client, asOf = new Date()) {
  const out = { b0: 0, b30: 0, b60: 0, b90: 0, total: 0 };
  if (String(client.status || "").toLowerCase() === "closed") return out;
  const cur = ymOf(asOf);
  const monthEnd = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0, 23, 59, 59);
  const add = (ym, amount) => {
    if (amount <= 0.005) return;
    const age = Math.max(0, monthsBetween(ym, cur));
    const k = age === 0 ? "b0" : age === 1 ? "b30" : age === 2 ? "b60" : "b90";
    out[k] += amount;
    out.total += amount;
  };
  const initialOwed = unpaidInitial(client);
  if (initialOwed > 0.005) {
    const d = parseDate(client.initialPaymentDate);
    if (d && d <= monthEnd) add(ymOf(d), initialOwed);
  }
  for (const v of planViews(client)) {
    for (const m of planLedger(v, monthEnd, asOf).months) add(m.ym, m.amount - m.paid);
  }
  return out;
}

/**
 * The plan from today to its end, all plans combined: when the last installment falls,
 * and what each future month still needs (installments minus anything paid ahead).
 * Returns { endYm, monthsLeft, future: { "YYYY-MM": amount }, scheduledLeft }.
 */
export function planProjection(client, asOf = new Date()) {
  const out = { endYm: null, monthsLeft: 0, future: {}, scheduledLeft: 0 };
  const status = String(client.status || "active").toLowerCase();
  if (status === "closed" || status === "paused") return out;
  const cur = ymOf(asOf);
  const far = new Date(asOf.getFullYear() + 30, 0, 1);
  for (const v of planViews(client)) {
    const { months } = planLedger(v, far, asOf);
    if (!months.length) continue;
    const last = months[months.length - 1].ym;
    if (!out.endYm || last > out.endYm) out.endYm = last;
    for (const m of months) {
      if (m.ym <= cur) continue;
      const left = Math.max(0, m.amount - m.paid);
      if (left > 0.005) out.future[m.ym] = (out.future[m.ym] || 0) + left;
    }
  }
  const futureMonths = Object.keys(out.future);
  out.monthsLeft = futureMonths.length;
  out.scheduledLeft = futureMonths.reduce((s, k) => s + out.future[k], 0);
  return out;
}

/** Latest payment of any kind (initial included), as a Date, or null. */
export function lastPaymentDate(client) {
  let best = null;
  for (const p of client.payments || []) {
    const d = parseDate(p.date);
    if (d && Number(p.amount || 0) > 0 && (!best || d > best)) best = d;
  }
  return best;
}
