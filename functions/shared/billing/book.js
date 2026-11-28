// GENERATED from src/billing/book.js by scripts/build-shared.js. Do not edit here.
"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }// src/billing/book.js
// The whole book of clients in one pass, for Home, Reports and Team. Every figure comes
// from the same per-client calculation as the client profile and A/R Aging, so numbers
// agree everywhere. No UI code here: the server runs this same file (scripts/build-shared.js
// copies it to functions/shared) to prepare the figures pages read (functions/portfolioSnapshot.js).
var _ledger = require('./ledger');
var _dates = require('../utils/dates');
var _contact = require('./contact');
exports.AGING_BUCKETS = _ledger.AGING_BUCKETS;

const pad2 = (n) => String(n).padStart(2, "0");
 const ymOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; exports.ymOf = ymOf;
 const ymdOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; exports.ymdOf = ymdOf;
 const monthLabel = (ym, style = "short") => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", style === "long" ? { month: "long", year: "numeric" } : { month: "short", year: "2-digit" });
}; exports.monthLabel = monthLabel;
 const money = (n, digits = 0) =>
  `${Number(n || 0) < 0 ? "-" : ""}$${Math.abs(Number(n || 0)).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`; exports.money = money;
 const pct = (n, digits = 0) => (n == null || !isFinite(n) ? "—" : `${(n * 100).toFixed(digits)}%`); exports.pct = pct;
 const clientName = (c) => `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name || "Unnamed client"; exports.clientName = clientName;

/** Aging groups by months behind (the 15th is the due day). */
 const AGING = [
  { key: "current", label: "Current", test: (m) => m === 0 },
  { key: "m1", label: "1 month", test: (m) => m === 1 },
  { key: "m2", label: "2 months", test: (m) => m === 2 },
  { key: "m3", label: "3 months", test: (m) => m === 3 },
  { key: "m4", label: "4–5 months", test: (m) => m >= 4 && m <= 5 },
  { key: "m6", label: "6+ months", test: (m) => m >= 6 },
]; exports.AGING = AGING;

const statusOf = (c) => String(c.status || "active").toLowerCase();
const isInitialPayment = (c, p, d) => {
  if (p.kind === "initial") return true;
  const init = _dates.parseDate.call(void 0, c.initialPaymentDate);
  return !!(init && d && d <= init && !p.kind);
};
// Removal defense: its own case (case type or MyCase practice area), or a removal-defense
// service added to an existing client (the invoice's service tag). Its initial payment is
// often sold outside the intake team, so Home shows it apart.
 const isRemovalDefense = (c, p) => /removal\s*defen[cs]e/i.test(String(((c && c.invoiceServices) || {})[String((p && p.invoiceId) || "")] || ""))
  || /^removal\s*defen[cs]e/i.test(String((c && c.caseType) || "")) || /^removal\s*defen[cs]e/i.test(String((c && c.mycasePracticeArea) || "")); exports.isRemovalDefense = isRemovalDefense;
const isMyCasePayment = (p) => String(p.paymentId || "").startsWith("mycase_") || p.source === "mycase" || p.recordedBy === "MyCase sync";

/** Every received payment on every client, flattened (newest first). */
 function allPayments(clients) {
  const out = [];
  for (const c of clients) {
    for (const p of c.payments || []) {
      const amount = Number(p.amount || 0);
      const d = _dates.parseDate.call(void 0, p.date);
      if (!d || !amount) continue;
      out.push({
        clientId: c.id,
        clientName: exports.clientName.call(void 0, c),
        amount,
        date: d,
        ymd: exports.ymdOf.call(void 0, d),
        ym: exports.ymOf.call(void 0, d),
        initial: isInitialPayment(c, p, d),
        removalDefense: exports.isRemovalDefense.call(void 0, c, p),
        fromMyCase: isMyCasePayment(p),
        recordedBy: p.recordedBy || (isMyCasePayment(p) ? "MyCase sync" : "—"),
        recordedAt: _dates.parseDate.call(void 0, p.recordedAt),
        invoiceId: p.invoiceId || null,
      });
    }
  }
  return out.sort((a, b) => b.date - a.date);
} exports.allPayments = allPayments;

/** Latest installment payment (after the initial payment). */
function lastInstallment(c) {
  const init = _dates.parseDate.call(void 0, c.initialPaymentDate);
  let best = null;
  for (const p of c.payments || []) {
    const d = _dates.parseDate.call(void 0, p.date);
    if (!d || Number(p.amount || 0) <= 0 || p.kind === "initial" || (init && d <= init)) continue;
    if (!best || d > best.d) best = { d, amount: Number(p.amount) };
  }
  return best ? { date: exports.ymdOf.call(void 0, best.d), amount: best.amount } : null;
}

/** Per-client billing row, from the installment ledger (src/billing/ledger.js). */
 function clientRows(clients, asOf = new Date()) {
  const month = exports.ymOf.call(void 0, asOf);
  const lastMonthStart = new Date(asOf.getFullYear(), asOf.getMonth() - 1, 1);
  const lastMonthSameDay = new Date(asOf.getFullYear(), asOf.getMonth() - 1, Math.min(asOf.getDate(), 28), 23, 59, 59);
  const dayStart = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const weekStart = new Date(dayStart);
  weekStart.setDate(dayStart.getDate() - ((dayStart.getDay() + 6) % 7)); // Monday
  return clients.map((c) => {
    const status = statusOf(c);
    let pos;
    try {
      pos = _ledger.clientPosition.call(void 0, c, asOf);
    } catch (e) {
      pos = { pastDue: 0, thisMonth: 0, owedNow: 0, monthsBehind: 0, balance: 0, planEnded: false, initialOwed: 0 };
    }
    let aging = { b0: 0, b30: 0, b60: 0, b90: 0, total: 0, oldest: null };
    let agingByInstallment = { b0: 0, b30: 0, b60: 0, b90: 0, total: 0 };
    try {
      aging = _ledger.clientAging.call(void 0, c, asOf);
      agingByInstallment = _ledger.agingOf.call(void 0, c, asOf);
    } catch (e) {
      /* no plan */
    }
    // This month's installment money (no initial payments) and where it went.
    let planMoney = { total: 0, thisMonth: 0, catchUp: 0, ahead: 0 };
    let planPaidLastMtd = 0;
    let planPaidToday = 0;
    let planPaidWeek = 0;
    try {
      planMoney = _ledger.monthMoneySplit.call(void 0, c, asOf);
      planPaidLastMtd = _ledger.installmentPaidBetween.call(void 0, c, lastMonthStart, lastMonthSameDay);
      planPaidToday = _ledger.installmentPaidBetween.call(void 0, c, dayStart, asOf);
      planPaidWeek = _ledger.installmentPaidBetween.call(void 0, c, weekStart, asOf);
    } catch (e) {
      /* no plan */
    }
    let mc = { due: 0, collected: 0 };
    try {
      mc = _ledger.monthDueCollected.call(void 0, c, month, asOf);
    } catch (e) {
      /* no plan */
    }
    const inPlan = !!(c.firstInstallmentDate || (c.installmentSchedule || []).length || (c.plans || []).length);
    const owed = status === "closed" ? 0 : pos.owedNow;
    return {
      id: c.id,
      name: exports.clientName.call(void 0, c),
      status,
      caseType: c.caseType || "—",
      caseStatus: c.caseStatus || "",
      caseTitle: c.caseTitle || "",
      // Where the payments come from: MyCase (created there, rebuilt with invoice tags, or
      // invoices still to tag on Case Setup), or typed by hand (no MyCase case link).
      source: c.source === "mycase" ? "MyCase" : c.invoiceRoles && Object.keys(c.invoiceRoles).length ? "Rebuilt from MyCase" : c.typedPayments ? "MyCase, invoices to tag" : "Typed by hand",
      inPlan,
      onHold: !!_optionalChain([c, 'access', _ => _.paymentHold, 'optionalAccess', _2 => _2.active]),
      // Every installment due by today and not paid (this month's included once the 15th passed).
      amountDue: owed,
      // This month's installment still unpaid (after the 15th).
      dueThisMonth: status === "closed" ? 0 : pos.thisMonth,
      // Installments from earlier months still unpaid.
      pastMonthsDue: status === "closed" ? 0 : pos.pastDue,
      missedMonths: owed > 0 ? Math.max(1, pos.monthsBehind) : 0,
      balance: status === "closed" ? 0 : pos.balance,
      // Initial payment not made (or refunded): intake's, kept out of owed / aging.
      initialOwed: status === "closed" ? 0 : pos.initialOwed || 0,
      // Aging by client: all they owe, in the bucket of their oldest unpaid installment.
      aging,
      // The same split installment by installment (accountant detail, CSV).
      agingByInstallment,
      planMoney,
      planPaidLastMtd,
      planPaidToday,
      planPaidWeek,
      expectedThisMonth: mc.due,
      collectedThisMonth: mc.collected,
      lastPayment: lastInstallment(c),
      promise: c.paymentPromise || null,
      myCaseLink: c.myCaseLink || "",
      createdAt: _dates.parseDate.call(void 0, c.createdAt),
      awaitingPlan: !!c.awaitingPlan,
      phones: c.mycasePhones || [],
      lastContact: _contact.lastContactOf.call(void 0, c),
      // Owes money and nobody reached them in 30+ days (calls from RingCentral or logged by hand).
      needsContact: status !== "closed" && _contact.needsContact.call(void 0, c, owed, asOf),
      paidInFull: inPlan && pos.balance <= 0 && owed <= 0,
      // Every month of the plan has passed and money is still owed.
      planEnded: owed > 0 && pos.planEnded,
    };
  });
} exports.clientRows = clientRows;

/** Totals for the book. */
 function summarize(rows, payments, asOf = new Date()) {
  const open = rows.filter((r) => r.status !== "closed");
  // Clients still paying: on a plan, not paused, with money left (paid-in-full plans excluded).
  const plan = open.filter((r) => r.inPlan && r.status !== "paused" && (r.balance > 0 || r.amountDue > 0));
  // Owed and past due count everyone who is not closed (paused clients and new clients
  // without a plan yet included), the same clients as the Aging buckets, so the numbers
  // agree: after the 15th, Outstanding = Aging total and Past due this month = 0-30.
  const owing = open.filter((r) => r.amountDue > 0);
  // Past due this month: clients who were up to date going into the month and have not
  // paid all of this month's installment (the same clients as the collection rate, so
  // due - collected = past due). Clients already behind are in Outstanding / Aging.
  // A client with any older month unpaid (on any plan) is "already behind", not here.
  const missedThisMonth = open.filter((r) => r.pastMonthsDue <= 0.005 && r.expectedThisMonth - r.collectedThisMonth > 0.005);
  // This month's installments still unpaid by clients who were already behind (in 0-30 too).
  const behindThisMonth = open.reduce((s, r) => s + r.dueThisMonth, 0) - missedThisMonth.reduce((s, r) => s + (r.expectedThisMonth - r.collectedThisMonth), 0);
  const ended = plan.filter((r) => r.planEnded);
  const month = exports.ymOf.call(void 0, asOf);
  const lastMonthDate = new Date(asOf.getFullYear(), asOf.getMonth() - 1, 1);
  const lastMonth = exports.ymOf.call(void 0, lastMonthDate);
  const todayKey = exports.ymdOf.call(void 0, asOf);
  const weekStart = new Date(asOf);
  weekStart.setDate(asOf.getDate() - ((asOf.getDay() + 6) % 7)); // Monday
  weekStart.setHours(0, 0, 0, 0);
  const year = String(asOf.getFullYear());
  // Same point in last month, for a fair month-to-date comparison.
  const lastMonthSameDay = exports.ymdOf.call(void 0, new Date(asOf.getFullYear(), asOf.getMonth() - 1, Math.min(asOf.getDate(), 28)));

  const received = payments.filter((p) => p.amount > 0);
  const sum = (list) => list.reduce((s, p) => s + p.amount, 0);
  const mtd = received.filter((p) => p.ym === month);
  const lastMtd = received.filter((p) => p.ym === lastMonth && p.ymd <= lastMonthSameDay);

  const aging = exports.AGING.map((a) => {
    const list = plan.filter((r) => a.test(r.missedMonths));
    return { ...a, clients: list.length, amount: list.reduce((s, r) => s + r.amountDue, 0) };
  });
  // Accountant buckets (0-30 / 31-60 / 61-90 / 90+), active and paused plans, not closed.
  const receivable = open.filter((r) => r.aging.total > 0.005);
  const buckets = _ledger.AGING_BUCKETS.map((b) => ({
    ...b,
    amount: receivable.reduce((s, r) => s + r.aging[b.key], 0),
    clients: receivable.filter((r) => r.aging[b.key] > 0.005).length,
  }));
  const bucketTotal = buckets.reduce((s, b) => s + b.amount, 0);

  // Everyone not closed: a client whose last installment was this month is no longer
  // "still paying" but still counts toward this month's due and collected.
  // Only clients with no older month owed (client-wide, every plan): the same clients as
  // Past due this month, so due - collected = Past due.
  const upToDate = open.filter((r) => r.pastMonthsDue <= 0.005);
  const expected = upToDate.reduce((s, r) => s + r.expectedThisMonth, 0);
  const collectedOnPlan = upToDate.reduce((s, r) => s + r.collectedThisMonth, 0);

  return {
    asOf,
    clients: { total: rows.length, open: open.length, inPlan: plan.length, paidInFull: open.filter((r) => r.inPlan && r.balance <= 0 && r.amountDue <= 0).length, paused: open.filter((r) => r.status === "paused").length, closed: rows.length - open.length, onHold: open.filter((r) => r.onHold).length, awaitingPlan: open.filter((r) => r.awaitingPlan).length },
    // Owed now: every installment due by today and not paid, all plans.
    outstanding: owing.reduce((s, r) => s + r.amountDue, 0),
    outstandingClients: owing.length,
    outstandingPaused: owing.filter((r) => r.status === "paused").reduce((s, r) => s + r.amountDue, 0),
    // Left to collect on all plans, future installments included.
    leftOnPlans: plan.reduce((s, r) => s + r.balance, 0),
    // Past due = this month's installment, missed by clients who were current (after the 15th).
    pastDue: {
      clients: missedThisMonth.length,
      amount: missedThisMonth.reduce((s, r) => s + (r.expectedThisMonth - r.collectedThisMonth), 0),
      rate: plan.length ? missedThisMonth.length / plan.length : null,
      // This month's installments of clients already behind: also in Aging 0-30.
      behindAmount: Math.max(0, behindThisMonth),
      behindClients: open.filter((r) => r.dueThisMonth > 0 && !missedThisMonth.includes(r)).length,
    },
    planEnded: { clients: ended.length, amount: ended.reduce((s, r) => s + r.amountDue, 0) },
    // Not in Outstanding / Aging: intake's (Initial payments page).
    initialUnpaid: { clients: open.filter((r) => r.initialOwed > 0.005).length, amount: open.reduce((s, r) => s + r.initialOwed, 0) },
    current: { clients: plan.length - owing.length, rate: plan.length ? (plan.length - owing.length) / plan.length : null },
    aging,
    buckets,
    receivable: { amount: bucketTotal, clients: receivable.length },
    month: { key: month, expected, collectedOnPlan, collectionRate: expected ? collectedOnPlan / expected : null },
    collected: {
      today: sum(received.filter((p) => p.ymd === todayKey)),
      week: sum(received.filter((p) => p.date >= weekStart)),
      mtd: sum(mtd),
      mtdCount: mtd.length,
      lastMonthSameTime: sum(lastMtd),
      ytd: sum(received.filter((p) => p.ymd.startsWith(year))),
      mtdFromMyCase: sum(mtd.filter((p) => p.fromMyCase)),
      // Where this month's money went: initial payments, this month's installments
      // (clients up to date going in), and the rest (catch-up on older months / paid ahead).
      mtdInitial: sum(mtd.filter((p) => p.initial)),
      mtdInitialRemoval: sum(mtd.filter((p) => p.initial && p.removalDefense)),
      mtdInitialRemovalCount: mtd.filter((p) => p.initial && p.removalDefense).length,
      mtdThisMonth: collectedOnPlan,
      mtdCatchUp: Math.max(0, sum(mtd) - sum(mtd.filter((p) => p.initial)) - collectedOnPlan),
    },
    // Payment-plan money only (initial payments are the intake team's), and where it went.
    plan: {
      mtd: rows.reduce((t, r) => t + r.planMoney.total, 0),
      thisMonth: rows.reduce((t, r) => t + r.planMoney.thisMonth, 0),
      catchUp: rows.reduce((t, r) => t + r.planMoney.catchUp, 0),
      ahead: rows.reduce((t, r) => t + r.planMoney.ahead, 0),
      lastMonthSameTime: rows.reduce((t, r) => t + r.planPaidLastMtd, 0),
      today: rows.reduce((t, r) => t + r.planPaidToday, 0),
      week: rows.reduce((t, r) => t + r.planPaidWeek, 0),
    },
  };
} exports.summarize = summarize;

/**
 * Payment-plan money (installments only, no initial payments) received each day of this
 * month up to today, and each day of last month: Home's calendar and its pace line.
 * { month: "2026-11", days: [day 1, day 2, … today], lastMonth: "2026-10", lastDays: [every day] }
 */
 function planMoneyByDay(clients, asOf = new Date()) {
  const y = asOf.getFullYear(), m = asOf.getMonth();
  const thisStart = new Date(y, m, 1), lastStart = new Date(y, m - 1, 1);
  const days = new Array(asOf.getDate()).fill(0);
  const lastDays = new Array(new Date(y, m, 0).getDate()).fill(0);
  for (const c of clients) {
    let pays = [];
    try {
      pays = _ledger.installmentPaymentsBetween.call(void 0, c, lastStart, asOf);
    } catch (e) {
      continue; // no plan
    }
    for (const p of pays) {
      if (p.date >= thisStart) days[p.date.getDate() - 1] += p.amount;
      else lastDays[p.date.getDate() - 1] += p.amount;
    }
  }
  const round = (a) => a.map((v) => Math.round(v * 100) / 100);
  return { month: exports.ymOf.call(void 0, asOf), days: round(days), lastMonth: exports.ymOf.call(void 0, lastStart), lastDays: round(lastDays) };
} exports.planMoneyByDay = planMoneyByDay;

/** Money received per month for the last `n` months (oldest first). */
 function collectionsByMonth(payments, n = 12, asOf = new Date()) {
  const keys = [];
  for (let i = n - 1; i >= 0; i--) keys.push(exports.ymOf.call(void 0, new Date(asOf.getFullYear(), asOf.getMonth() - i, 1)));
  const map = new Map(keys.map((k) => [k, { key: k, label: exports.monthLabel.call(void 0, k), installments: 0, initial: 0, initialRemoval: 0, total: 0, count: 0 }]));
  for (const p of payments) {
    const m = map.get(p.ym);
    if (!m || p.amount <= 0) continue;
    if (p.initial) m.initial += p.amount;
    else m.installments += p.amount;
    if (p.initial && p.removalDefense) m.initialRemoval += p.amount;
    m.total += p.amount;
    m.count++;
  }
  return keys.map((k) => map.get(k));
} exports.collectionsByMonth = collectionsByMonth;

/**
 * Due vs collected for each of the last `n` months (oldest first), counting only clients
 * who were up to date going into the month (see monthDueCollected in ledger.js: a client
 * who catches up during the month moves into it). Past months are read as of their last
 * day; the current month as of now.
 */
 function collectionRateByMonth(clients, n = 6, asOf = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const first = new Date(asOf.getFullYear(), asOf.getMonth() - i, 1);
    const key = exports.ymOf.call(void 0, first);
    const cutoff = i === 0 ? asOf : new Date(first.getFullYear(), first.getMonth() + 1, 0, 23, 59, 59);
    let expected = 0;
    let collected = 0;
    let count = 0;
    for (const c of clients) {
      if (statusOf(c) === "closed") continue;
      try {
        const r = _ledger.monthDueCollected.call(void 0, c, key, cutoff);
        expected += r.due;
        collected += r.collected;
        count += r.clients;
      } catch (e) {
        /* skip */
      }
    }
    out.push({ key, label: exports.monthLabel.call(void 0, key), expected, collected, clients: count, missed: Math.max(0, expected - collected), rate: expected ? collected / expected : null });
  }
  return out;
} exports.collectionRateByMonth = collectionRateByMonth;
