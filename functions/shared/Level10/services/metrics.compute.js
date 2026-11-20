// GENERATED from src/Level10/services/metrics.compute.js by scripts/build-shared.js. Do not edit here.
"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }// src/Level10/services/metrics.compute.js
var _plans = require('../../billing/plans');
var _dates = require('../../utils/dates');

// ---------- Utils ----------
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const labelFor = (d) =>
  `${d.toLocaleString("default", { month: "long" })} ${d.getFullYear()}`;

const toDate = (raw) =>
  _optionalChain([raw, 'optionalAccess', _ => _.seconds]) ? _dates.asDate.call(void 0, raw.seconds * 1000) : _dates.asDate.call(void 0, raw);
const money = (n) => Number(n || 0);

const getInstallmentAmountForDate = (schedule, date) => {
  if (!Array.isArray(schedule) || schedule.length === 0) return 500;
  for (const s of schedule) {
    const sStart = _dates.asDate.call(void 0, s.start);
    const sEnd = _dates.asDate.call(void 0, s.end);
    if (date >= sStart && date <= sEnd) return Number(s.amount || 500);
  }
  return 500;
};

// === Helpers aligned to Dashboard math (CAP-aware, FIFO, skip/pause/initial rules) ===
function computeInvoiceEffective(client) {
  const base = Number(_optionalChain([client, 'optionalAccess', _2 => _2.invoiceTotal]) || 0);
  const adjustments = Array.isArray(_optionalChain([client, 'optionalAccess', _3 => _3.invoiceAdjustments]))
    ? client.invoiceAdjustments
    : [];
  const adjToBalanceTotal = adjustments.reduce((sum, a) => {
    const applyTo = (_optionalChain([a, 'optionalAccess', _4 => _4.applyTo]) || "balance").toLowerCase();
    const amt = Number(_optionalChain([a, 'optionalAccess', _5 => _5.amount]) || 0);
    const dp = Number(_optionalChain([a, 'optionalAccess', _6 => _6.downPayment]) || 0);
    return applyTo === "balance" ? sum + (amt - dp) : sum;
  }, 0);
  return Math.max(0, base + adjToBalanceTotal);
}
function getCollectibleCap(client) {
  const invoiceEffective = computeInvoiceEffective(client);
  const initialPayment = parseFloat(_optionalChain([client, 'optionalAccess', _7 => _7.initialPaymentAmount]) || 0);
  return Math.max(0, invoiceEffective - initialPayment);
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Compute expected and collected toward a specific month’s installment,
 * with payments applied FIFO up to a cutoff date (inclusive).
 * - Excludes initial/retainer (and any payment <= initialPaymentDate)
 * - Honors skipMonths
 * - Paused before the 15th => current month not billable
 * - Enforces CAP: if cap was exhausted before this month, expected=0, collected=0
 */
 function getExpectedCollectedForMonth(client, monthStr, dueDay = 15, cutoffDate = null) {
  // Build a Date representing the *current month for Level10* (e.g. "2025-11")
  const [yy, mm] = monthStr.split("-").map(Number);
  const monthDate = new Date(yy, mm - 1, 15); // use the 15th as internal anchor
  const monthEnd = endOfMonth(monthDate);
  const cutoff = cutoffDate ? _dates.asDate.call(void 0, cutoffDate) : monthEnd;

  const status = (_optionalChain([client, 'optionalAccess', _8 => _8.status]) || "").toLowerCase();
  if (status === "closed") return { expected: 0, collected: 0 };

  const planStart = _optionalChain([client, 'optionalAccess', _9 => _9.firstInstallmentDate]) ? toDate(client.firstInstallmentDate) : null;
  if (!planStart || Number.isNaN(planStart)) return { expected: 0, collected: 0 };

  const cap = getCollectibleCap(client);
  const schedule = (_optionalChain([client, 'optionalAccess', _10 => _10.installmentSchedule]) || [])
    .slice()
    .sort((a, b) => _dates.asDate.call(void 0, a.start) - _dates.asDate.call(void 0, b.start));
  const skipSet = new Set((_optionalChain([client, 'optionalAccess', _11 => _11.skipMonths]) || []).map(String));

  // Is this month billable?
  const curKey = `${yy}-${pad2(mm)}`;
  let billableThisMonth = !skipSet.has(curKey);
  const pauseDate = _optionalChain([client, 'optionalAccess', _12 => _12.pauseStartedAt]) ? toDate(client.pauseStartedAt) : null;
  if (status === "paused" && pauseDate) {
    const sameMonth =
      pauseDate.getFullYear() === monthDate.getFullYear() &&
      pauseDate.getMonth() === monthDate.getMonth();
    if (sameMonth && pauseDate.getDate() < dueDay) billableThisMonth = false;
  }

  // Build months from first due to monthEnd, but stop at CAP
  const months = [];
  let expectedAccum = 0;
  let cursor = new Date(planStart.getFullYear(), planStart.getMonth(), dueDay);
  while (cursor <= monthEnd) {
    const key = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`;
    const amt = skipSet.has(key) ? 0 : getInstallmentAmountForDate(schedule, cursor);

    if (expectedAccum >= cap) break;
    if (expectedAccum + amt > cap) break;

    months.push({
      key,
      dueDate: new Date(cursor.getFullYear(), cursor.getMonth(), dueDay),
      expected: amt,
      collected: 0,
    });
    expectedAccum += amt;

    cursor.setMonth(cursor.getMonth() + 1);
  }

  // If the current month isn’t in the built timeline (cap exhausted), nothing is expected/collectible
  const thisKey = `${yy}-${pad2(mm)}`;
  const idx = months.findIndex((m) => m.key === thisKey);
  if (idx === -1 || !billableThisMonth) {
    return { expected: 0, collected: 0 };
  }

  // Payments FIFO up to cutoff, excluding initial/retainer (and <= initialPaymentDate)
  const initialCutoff = _optionalChain([client, 'optionalAccess', _13 => _13.initialPaymentDate]) ? toDate(client.initialPaymentDate) : null;
  const isInitialFlag = (p) => {
    const t = (_optionalChain([p, 'optionalAccess', _14 => _14.type]) || _optionalChain([p, 'optionalAccess', _15 => _15.category]) || "").toString().toLowerCase();
    return _optionalChain([p, 'optionalAccess', _16 => _16.isInitial]) === true || t === "initial" || t === "retainer" || t === "setup";
  };
  const pays = (_optionalChain([client, 'optionalAccess', _17 => _17.payments]) || [])
    .map((p) => ({ amount: Number(_optionalChain([p, 'optionalAccess', _18 => _18.amount]) || 0), date: toDate(_optionalChain([p, 'optionalAccess', _19 => _19.date])), raw: p }))
    .filter(
      (p) =>
        p.amount > 0 &&
        p.date &&
        p.date <= cutoff &&
        !isInitialFlag(p.raw) &&
        (initialCutoff ? p.date > initialCutoff : true)
    )
    .sort((a, b) => a.date - b.date);

  for (const pay of pays) {
    let remain = pay.amount;
    for (let i = 0; i < months.length && remain > 0; i++) {
      const need = Math.max(0, (months[i].expected || 0) - (months[i].collected || 0));
      if (need <= 0) continue;
      const used = Math.min(need, remain);
      months[i].collected += used;
      remain -= used;
    }
  }

  const expected = Number(months[idx].expected || 0);
  const collected = Math.min(expected, Number(months[idx].collected || 0));
  return { expected, collected };
} exports.getExpectedCollectedForMonth = getExpectedCollectedForMonth;

// ---------- Aging / Client state ----------
 function deriveClientAging(client, asOfDate, dueDay = 15) {
  const status = (_optionalChain([client, 'optionalAccess', _20 => _20.status]) || "active").toLowerCase();
  const isClosed = status === "closed";
  const isPaused = status === "paused";

  // base amounts
  const invoiceBase = Number(_optionalChain([client, 'optionalAccess', _21 => _21.invoiceTotal]) || 0);
  const adjustments = Array.isArray(_optionalChain([client, 'optionalAccess', _22 => _22.invoiceAdjustments]))
    ? client.invoiceAdjustments
    : [];
  const adjToBalanceTotal = adjustments.reduce((sum, a) => {
    const applyTo = (_optionalChain([a, 'optionalAccess', _23 => _23.applyTo]) || "balance").toLowerCase();
    const amt = Number(_optionalChain([a, 'optionalAccess', _24 => _24.amount]) || 0);
    const dp = Number(_optionalChain([a, 'optionalAccess', _25 => _25.downPayment]) || 0);
    return applyTo === "balance" ? sum + (amt - dp) : sum;
  }, 0);
  const invoiceEffective = Math.max(0, invoiceBase + adjToBalanceTotal);

  const initialPayment = parseFloat(_optionalChain([client, 'optionalAccess', _26 => _26.initialPaymentAmount]) || 0);
  const initialPaymentDate = _optionalChain([client, 'optionalAccess', _27 => _27.initialPaymentDate])
    ? _dates.asDate.call(void 0, client.initialPaymentDate)
    : null;
  const collectibleCap = Math.max(0, invoiceEffective - initialPayment);

  const rawStart = client.firstInstallmentDate;
  const planStart = rawStart ? toDate(rawStart) : null;
  if (!planStart || Number.isNaN(planStart)) {
    const remaining = Math.max(0, invoiceEffective - initialPayment);
    return {
      amountDue: 0,
      missedMonths: 0,
      pastDueLabel: "Current",
      isCurrent: remaining <= 0,
      remainingBalance: isClosed ? 0 : remaining,
      monthsList: [],
      dueMonthKeys: [],
      agingDays: 0,
    };
  }

  const firstDueDate = new Date(
    planStart.getFullYear(),
    planStart.getMonth(),
    dueDay
  );

  const allPayments = Array.isArray(_optionalChain([client, 'optionalAccess', _28 => _28.payments])) ? client.payments : [];
  const paymentsAfterInitial = initialPaymentDate
    ? allPayments.filter((p) => _dates.asDate.call(void 0, p.date) > initialPaymentDate)
    : allPayments.slice();
  const pool = paymentsAfterInitial.map((p) => ({
    amount: Number(p.amount || 0),
    date: p.date,
  }));

  const skipSet = new Set((client.skipMonths || []).map(String));
  const monthIsSkipped = (d) => skipSet.has(ymKey(d));

  const schedule = (client.installmentSchedule || [])
    .slice()
    .sort((a, b) => _dates.asDate.call(void 0, a.start) - _dates.asDate.call(void 0, b.start));

  // cutoff honored: paused? stop on pause boundary; else asOfDate
  let cutoff = asOfDate || new Date();
  if (isPaused && client.pauseStartedAt) {
    const p = toDate(client.pauseStartedAt);
    // If pause starts on/after due day, we count through that month's due; otherwise through prior
    const DUE_DAY = dueDay;
    cutoff = new Date(
      p.getFullYear(),
      p.getMonth(),
      p.getDate() >= DUE_DAY ? DUE_DAY : DUE_DAY - 1
    );
  }

  const monthsUpToCutoff = [];
  {
    const cursor = _dates.asDate.call(void 0, firstDueDate);
    let expectedAccum = 0;
    while (cursor <= cutoff) {
      if (!monthIsSkipped(cursor)) {
        const amt = getInstallmentAmountForDate(schedule, cursor);
        if (expectedAccum >= collectibleCap) break;
        if (expectedAccum + amt > collectibleCap) break;
        monthsUpToCutoff.push(_dates.asDate.call(void 0, cursor));
        expectedAccum += amt;
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  const dueMonths = [];
  let validTotalPaid = 0;
  for (const monthDate of monthsUpToCutoff) {
    const amountDue = getInstallmentAmountForDate(schedule, monthDate);
    let monthPaid = 0;
    for (const p of pool) {
      if (p.amount <= 0) continue;
      if (monthPaid >= amountDue) break;
      const used = Math.min(amountDue - monthPaid, p.amount);
      monthPaid += used;
      validTotalPaid += used;
      p.amount -= used;
    }
    if (monthPaid < amountDue) {
      dueMonths.push({
        label: labelFor(monthDate),
        key: ymKey(monthDate),
        amount: amountDue,
        date: _dates.asDate.call(void 0, monthDate),
      });
    }
  }

  // Prepayments up to cap
  const leftover = pool.reduce((s, p) => s + (p.amount || 0), 0);
  const capRoom = Math.max(0, collectibleCap - validTotalPaid);
  if (leftover > 0 && capRoom > 0) validTotalPaid += Math.min(leftover, capRoom);

  const computedRemaining = Math.max(
    0,
    invoiceEffective - initialPayment - validTotalPaid
  );
  const remainingBalance = isClosed ? 0 : computedRemaining;

  if (remainingBalance <= 0) dueMonths.length = 0;

  const amountDue = isClosed
    ? 0
    : dueMonths.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  const missedMonths = dueMonths.length;

  // aging in days: use the oldest due month 15th vs asOf
  let agingDays = 0;
  if (missedMonths > 0) {
    const oldest = dueMonths[0].date;
    const ms = (asOfDate || new Date()) - oldest;
    agingDays = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  }

  return {
    amountDue,
    missedMonths,
    remainingBalance,
    isCurrent: missedMonths === 0,
    monthsList: dueMonths.map((m) => m.label),
    dueMonthKeys: dueMonths.map((m) => m.key),
    agingDays,
  };
} exports.deriveClientAging = deriveClientAging;

function is30Plus(agingDays) {
  return agingDays >= 30;
}
function is60Plus(agingDays) {
  return agingDays >= 60;
}
function is90Plus(agingDays) {
  return agingDays >= 90;
}

// ---------- Opening 30+ ----------
 function computeOpening30AR({
  clients,
  month,
  tz = "America/New_York",
  dueDay = 15,
}) {
  const asOf = _dates.asDate.call(void 0, `${month}-01T00:00:00`);
  let total = 0;
  for (const c of clients) {
    const ag = deriveClientAging(c, asOf, dueDay);
    if (is30Plus(ag.agingDays)) total += ag.remainingBalance;
  }
  return Math.round(total);
} exports.computeOpening30AR = computeOpening30AR;

/**
 * 🔁 Helper cloned from Dashboard's computeBillingSnapshot,
 * simplified and adapted just for AR (amountDue).
 * This is what the dashboard uses for totalOwed.
 */
// Plan-aware: cases with several installment plans are computed plan by plan and
// combined (src/billing/plans.js); single-plan clients go straight through.
function computeBillingSnapshotForAR(client, ...rest) {
  if (!client) return computeBillingSnapshotForARSinglePlan(client, ...rest);
  return _plans.withPlans.call(void 0, client, (c) => computeBillingSnapshotForARSinglePlan(c, ...rest));
}

function computeBillingSnapshotForARSinglePlan(client, now = new Date(), dueDay = 15) {
  const status = (_optionalChain([client, 'optionalAccess', _29 => _29.status]) || "active").toLowerCase();
  const isClosed = status === "closed";
  const collectibleCap = getCollectibleCap(client);

  const planStart = _optionalChain([client, 'optionalAccess', _30 => _30.firstInstallmentDate]) ? toDate(client.firstInstallmentDate) : null;
  if (!planStart || isNaN(planStart)) {
    const remainingBalance = collectibleCap;
    const isPaidInFull = remainingBalance <= 0 || isClosed;
    return { amountDue: 0, missedMonths: 0, isPaidInFull };
  }

  const firstDueDate = new Date(
    planStart.getFullYear(),
    planStart.getMonth(),
    dueDay
  );

  const skipSet = new Set((_optionalChain([client, 'optionalAccess', _31 => _31.skipMonths]) || []).map(String));
  const monthIsSkipped = (d) => skipSet.has(ymKey(d));

  const schedule = (_optionalChain([client, 'optionalAccess', _32 => _32.installmentSchedule]) || [])
    .slice()
    .sort((a, b) => _dates.asDate.call(void 0, a.start) - _dates.asDate.call(void 0, b.start));

  // Build months to NOW but stop when expected sum would exceed CAP
  const months = [];
  const cursor = _dates.asDate.call(void 0, firstDueDate);
  let expectedAccum = 0;
  if (!isClosed) {
    while (cursor <= now) {
      if (!monthIsSkipped(cursor)) {
        const amt = getInstallmentAmountForDate(schedule, cursor);
        if (expectedAccum >= collectibleCap) break; // cap reached
        if (expectedAccum + amt > collectibleCap) break; // adding this month would exceed cap
        months.push(_dates.asDate.call(void 0, cursor));
        expectedAccum += amt;
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // Payments AFTER initial (strict)
  const allPayments = _optionalChain([client, 'optionalAccess', _33 => _33.payments]) || [];
  const initialPaymentDate = _optionalChain([client, 'optionalAccess', _34 => _34.initialPaymentDate]) ? toDate(client.initialPaymentDate) : null;
  const paymentsAfterInitial = initialPaymentDate
    ? allPayments.filter((p) => toDate(p.date) > initialPaymentDate)
    : allPayments.slice();

  const pool = paymentsAfterInitial
    .map((p) => ({ amount: Number(p.amount || 0), date: toDate(p.date) }))
    .filter((p) => p.amount > 0 && p.date)
    .sort((a, b) => a.date - b.date);

  let validTotalPaid = 0;
  const dueMonths = [];

  for (const monthDate of months) {
    const monthAmt = getInstallmentAmountForDate(schedule, monthDate);
    let monthPaid = 0;

    for (const p of pool) {
      if (p.amount <= 0) continue;
      if (monthPaid >= monthAmt) break;
      const used = Math.min(monthAmt - monthPaid, p.amount);
      monthPaid += used;
      p.amount -= used;
      validTotalPaid += used;
    }

    if (monthPaid < monthAmt) {
      dueMonths.push({ amount: monthAmt });
    }
  }

  // Roll any leftover forward up to CAP (prepayments)
  const leftover = pool.reduce((s, p) => s + (p.amount || 0), 0);
  const capRoom = Math.max(0, collectibleCap - validTotalPaid);
  if (leftover > 0 && capRoom > 0) validTotalPaid += Math.min(leftover, capRoom);

  const remainingBalance = Math.max(0, collectibleCap - validTotalPaid);
  const isPaidInFull = remainingBalance <= 0 || isClosed;

  if (isPaidInFull || isClosed) {
    return { amountDue: 0, missedMonths: 0, isPaidInFull: true };
  }

  const amountDue = dueMonths.reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const missedMonths = dueMonths.length;

  return { amountDue, missedMonths, isPaidInFull: false };
}

// ---------- Main aggregate ----------
 function computeAll({
  clients,
  monday,
  sunday,
  month,
  tz = "America/New_York",
  dueDay = 15,
  opening30AR = null,
}) {
  // Select clients “in plans”
  const inPlans = clients.filter(
    (c) =>
      (c.status || "active") !== "closed" &&
      (c.firstInstallmentDate || (c.installmentSchedule || []).length > 0)
  );

  const paused = inPlans.filter((c) => (c.status || "active") === "paused")
    .length;

  // Aging snapshot as of Sunday (for counts/lt60/gt60, etc.)
  let current = 0,
    pastDue = 0,
    lt60 = 0,
    gt60 = 0;

  const agingCache = new Map();
  for (const c of inPlans) {
    const ag = deriveClientAging(c, sunday, dueDay);
    agingCache.set(c.id, ag);
    if (ag.isCurrent) current++;
    else {
      pastDue++;
      if (ag.agingDays < 60) lt60++;
      else gt60++;
    }
  }

  // ---------- Payments aligned to "this month's installment" ----------
  // We compute "collected toward this month" at two cutoffs and take the delta.
  let mtdPayments = 0;
  let weekPayments = 0;

  // cutoff at Sunday 23:59:59 for MTD
  const collectedAtSunday = inPlans.reduce((sum, c) => {
    const { collected } = getExpectedCollectedForMonth(c, month, dueDay, sunday);
    return sum + collected;
  }, 0);

  // cutoff at (Monday - 1 ms) to get prior collected
  const dayBeforeMonday = new Date(monday.getTime() - 1);
  const collectedBeforeWeek = inPlans.reduce((sum, c) => {
    const { collected } = getExpectedCollectedForMonth(
      c,
      month,
      dueDay,
      dayBeforeMonday
    );
    return sum + collected;
  }, 0);

  mtdPayments = Math.round(collectedAtSunday);
  weekPayments = Math.max(0, Math.round(collectedAtSunday - collectedBeforeWeek));

  // ---------- 30+ recovery (kept simple; counts payments on dates when client was 30+) ----------
  let mtdRecovery30 = 0;
  for (const c of clients) {
    const pays = Array.isArray(c.payments) ? c.payments : [];
    for (const p of pays) {
      const payDate = _dates.asDate.call(void 0, p.date);
      // only payments inside the Level10 month
      const m = `${payDate.getFullYear()}-${String(payDate.getMonth() + 1).padStart(2, "0")}`;
      if (m !== month) continue;
      const agOnPay = deriveClientAging(c, payDate, dueDay);
      if (is30Plus(agOnPay.agingDays)) mtdRecovery30 += money(p.amount);
    }
  }

  // Clients recovered from PD → Current within this week
  let recoveredCount = 0;
  for (const c of inPlans) {
    const agMon = deriveClientAging(c, monday, dueDay);
    const agSun = agingCache.get(c.id) || deriveClientAging(c, sunday, dueDay);
    if (!agMon.isCurrent && agSun.isCurrent) recoveredCount++;
  }

  // Opening 30+ A/R
  const open30 =
    opening30AR != null
      ? opening30AR
      : computeOpening30AR({ clients, month, tz, dueDay });
  const mtdPctRecovered =
    open30 > 0 ? Math.round((mtdRecovery30 / open30) * 100) : 0;

  // ---------- Expected payments for this month (match dashboard logic) ----------
  let expectedPaymentsMonth = 0;
  for (const c of inPlans) {
    const { expected } = getExpectedCollectedForMonth(
      c,
      month,
      dueDay,
      endOfMonth(_dates.asDate.call(void 0, `${month}-15T00:00:00`))
    );
    expectedPaymentsMonth += expected;
  }
  expectedPaymentsMonth = Math.round(expectedPaymentsMonth);

  // ---------- Clients who only owe the current month ----------
  let onlyCurrentMonthCount = 0;
  for (const c of inPlans) {
    const ag = agingCache.get(c.id) || deriveClientAging(c, sunday, dueDay);
    if (ag.dueMonthKeys.length === 1 && ag.dueMonthKeys[0] === month) {
      onlyCurrentMonthCount++;
    }
  }

  // ---------- Percentages of *past-due* clients ----------
  const pdDenom = pastDue || 0;
  const percentLt60 = pdDenom > 0 ? Math.round((lt60 / pdDenom) * 100) : 0;
  const percentGt60 = pdDenom > 0 ? Math.round((gt60 / pdDenom) * 100) : 0;

  // ---------- 🔐 Total Outstanding A/R (match Dashboard) ----------
  // Use the same snapshot logic the Dashboard uses for totalOwed:
  // sum of amountDue as of *today* for all in-plan, non-closed clients.
  const today = new Date();
  let totalAR_today = 0;
  for (const c of inPlans) {
    const snap = computeBillingSnapshotForAR(c, today, dueDay);
    totalAR_today += snap.amountDue;
  }

  return {
    metrics: {
      // ---- Overall ----
      total_cases_in_plans: inPlans.length,
      number_in_manual: null, // manual
      percent_in_manual: null, // manual (left for UI/manual input)
      total_cases_current: current,
      total_cases_past_due: pastDue,
      lt60_pd: lt60,
      gt60_pd: gt60,
      percent_lt60_pd: percentLt60,
      percent_gt60_pd: percentGt60,
      paused_clients: paused,

      // ---- Payment Recovery ----
      payments_received_week: Math.round(weekPayments),
      payments_received_mtd: Math.round(mtdPayments),
      autopay_collection_rate: null, // manual
      past_due_recovery_30p: Math.round(mtdRecovery30),
      mtd_pct_past_due_recovered: mtdPctRecovered,
      clients_recovered_from_pd: recoveredCount,
      total_outstanding_ar: Math.round(totalAR_today),
      expected_payments_month: expectedPaymentsMonth,
      clients_owing_only_current_month: onlyCurrentMonthCount,

      // ---- Termination ----
      ytd_paused_clients: computeYtdPaused(clients, month),
      warning_letters_sent: null,
      terminations_finalized: null,
      refunds_issued: null,
      ytd_refunds: null,
    },
  };
} exports.computeAll = computeAll;

function computeYtdPaused(clients, month) {
  // count unique clients with pauseStartedAt in the same year as month
  const year = Number(month.slice(0, 4));
  const setIds = new Set();
  for (const c of clients) {
    if (!c.pauseStartedAt) continue;
    const d = toDate(c.pauseStartedAt);
    if (d.getFullYear() === year) setIds.add(c.id);
  }
  return setIds.size;
}