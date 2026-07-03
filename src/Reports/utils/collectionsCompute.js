// src/Reports/utils/collectionsCompute.js
//
// Computes Expected vs Collected by DUE MONTH (not payment month).
//
// ✅ UPDATED BEHAVIOR (your new rule):
// - A client only contributes to a given month’s "Expected" IF that month is the client's
//   next eligible installment month at that time.
// - Practically: for month M, we count M as "Expected" for a client only if ALL prior due months
//   are fully paid as of the END of month M. If the client is behind (prior months unpaid),
//   they do NOT appear in Expected for January/February/etc until caught up.
//
// ✅ Collected remains allocated "oldest due first" and can include late payments (paid after due month),
// because we allocate by due month.
//
// Notes:
// - Honors pause, close, skip months, installmentSchedule tiers, and collectible cap
//   (invoiceEffective - initialPaymentAmount).
// - Collection rate is capped at 100% and "excessCollected" is tracked.
//

// ----- helpers -----
const toLocalYMD = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

const monthKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);

const parseMaybeTs = (raw) =>
  raw && raw.seconds ? new Date(raw.seconds * 1000) : (raw ? new Date(raw) : null);

// Normalize to the 15th (your due day) before comparing to schedule tiers
const toDueMidMonth = (dateLike) => {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return new Date(d.getFullYear(), d.getMonth(), 15);
};

const endOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

const getInstallmentAmountForDate = (client, date) => {
  const dueMid = toDueMidMonth(date);
  const schedule = (client.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  for (const s of schedule) {
    const sStart = new Date(s.start);
    const sEnd = new Date(s.end);
    if (dueMid >= sStart && dueMid <= sEnd) return Number(s.amount || 0);
  }
  return Number(client.installmentAmount || 500);
};

// Skipped months can be stored as skipMonths and/or skippedMonths, values "YYYY-MM"
const buildSkipSet = (client) =>
  new Set([...(client.skipMonths || []), ...(client.skippedMonths || [])].map(String));

// Build all due months for a client, CAP-aware, honoring pause + skip.
// Builds up through the END of the reporting range month.
const buildClientDueMonths = (client, rangeEndMonthStart) => {
  const rawStart = client.firstInstallmentDate;
  if (!rawStart) return [];

  const status = (client.status || "active").toLowerCase();
  const isClosed = status === "closed";
  if (isClosed) return [];

  // ----- Invoice & cap (mirror BillingOverview / snapshot) -----
  const invoiceBase = Number(
    client.invoiceBaseTotal != null ? client.invoiceBaseTotal : client.invoiceTotal || 0
  );

  const adjustments = Array.isArray(client.invoiceAdjustments)
    ? client.invoiceAdjustments
    : [];

  const adjNetToBalance = adjustments.reduce((sum, a) => {
    const applyTo = String(a?.applyTo || "balance").toLowerCase();
    if (applyTo !== "balance") return sum;
    const amt = Number(a?.amount || 0);
    const dp = Number(a?.downPayment || 0);
    return sum + Math.max(0, amt - Math.max(0, dp));
  }, 0);

  const invoiceEffective = Math.max(0, invoiceBase + adjNetToBalance);
  const initialPayment = Number(client.initialPaymentAmount || 0);

  // Total that can be collected via installments
  const collectibleCap = Math.max(0, invoiceEffective - initialPayment);
  if (collectibleCap <= 0) return [];

  // ----- Anchor / first due date -----
  const anchorRaw = client.expectedAnchor || rawStart;
  const anchorDate = parseMaybeTs(anchorRaw);
  if (!(anchorDate instanceof Date) || isNaN(anchorDate)) return [];

  // Due on the 15th of the anchor month
  const firstDueMid = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 15);

  // Pause logic (stop accruing on/after pause month)
  const pauseAt = parseMaybeTs(client.pauseStartedAt);
  const pauseMonthStart = pauseAt
    ? new Date(pauseAt.getFullYear(), pauseAt.getMonth(), 1)
    : null;

  const skipSet = buildSkipSet(client);

  const months = [];
  let expectedAccum = 0;
  let curMid = new Date(firstDueMid);
  let guard = 0;
  const MAX_MONTHS = 120;

  // Build through the end of the reporting range month
  const hardEnd = endOfMonth(rangeEndMonthStart);

  while (curMid <= hardEnd && expectedAccum < collectibleCap && guard < MAX_MONTHS) {
    const monthStart = new Date(curMid.getFullYear(), curMid.getMonth(), 1);

    // If paused, don't accrue months on/after pause month
    if (pauseMonthStart && monthStart >= pauseMonthStart) break;

    const ym = monthKey(monthStart);

    if (!skipSet.has(ym)) {
      const exp = getInstallmentAmountForDate(client, curMid);

      // Never push a month that would exceed the collectible cap
      if (expectedAccum >= collectibleCap) break;
      if (expectedAccum + exp > collectibleCap) break;

      months.push({
        ym,
        date: monthStart,     // month start (bucket)
        expected: exp,
        collected: 0,         // filled by allocation
        remaining: exp,       // for allocation
      });

      expectedAccum += exp;
    }

    curMid = addMonths(curMid, 1); // keep on the 1st; we only use monthStart anyway
    guard++;
  }

  return months;
};

// Allocate payments oldest-due-first across due months, with optional cutoff date.
const allocatePaymentsToDueMonths = (client, dueMonths, cutoffDate) => {
  const ipd = client.initialPaymentDate ? new Date(client.initialPaymentDate) : null;

  const isInitialFlag = (p) => {
    const t = (p?.type || p?.category || "").toString().toLowerCase();
    return p?.isInitial === true || t === "initial" || t === "retainer" || t === "setup";
  };

  const payments = (client.payments || [])
    .filter((p) => {
      const d = new Date(p.date);
      if (isInitialFlag(p)) return false;
      if (ipd && d <= ipd) return false;
      if (cutoffDate && d > cutoffDate) return false;
      return true;
    })
    .map((p) => ({ amount: Number(p.amount || 0), date: new Date(p.date) }))
    .filter((p) => p.amount > 0 && p.date && !isNaN(p.date))
    .sort((a, b) => a.date - b.date);

  for (const pay of payments) {
    let amt = pay.amount;
    if (amt <= 0) continue;

    for (const month of dueMonths) {
      if (month.remaining <= 0) continue;
      const take = Math.min(month.remaining, amt);
      month.collected += take;
      month.remaining -= take;
      amt -= take;
      if (amt <= 0) break;
    }
  }

  return dueMonths;
};

/**
 * ✅ NEW: "Next Expected" eligibility per month
 * For month M, a client contributes to Expected(M) iff ALL prior due months are fully paid
 * as-of END(M). (Whether M itself is paid or not, it still was "expected" for that month.)
 *
 * To compute this correctly, we simulate payments month-by-month (only payments up to end-of-month).
 */
function computeClientExpectedEligibilityByMonth(client, dueMonths, rs, re) {
  const out = new Map(); // ym -> expectedAmountContribution (0 or expected)

  if (!dueMonths.length) return out;

  // Only consider up to the end of reporting range month
  const cutoff = endOfMonth(re);

  const ipd = client.initialPaymentDate ? new Date(client.initialPaymentDate) : null;

  const isInitialFlag = (p) => {
    const t = (p?.type || p?.category || "").toString().toLowerCase();
    return p?.isInitial === true || t === "initial" || t === "retainer" || t === "setup";
  };

  const payments = (client.payments || [])
    .filter((p) => {
      const d = new Date(p.date);
      if (isInitialFlag(p)) return false;
      if (ipd && d <= ipd) return false;
      if (d > cutoff) return false;
      return true;
    })
    .map((p) => ({ amount: Number(p.amount || 0), date: new Date(p.date) }))
    .filter((p) => p.amount > 0 && p.date && !isNaN(p.date))
    .sort((a, b) => a.date - b.date);

  // Work with a fresh "remaining" ledger for this simulation
  const ledger = dueMonths.map((m) => ({
    ym: m.ym,
    date: m.date,
    expected: m.expected,
    remaining: m.expected,
  }));

  let payIdx = 0;

  // Iterate month-by-month across reporting window
  let cur = new Date(rs.getFullYear(), rs.getMonth(), 1);
  while (cur <= re) {
    const monthStart = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const monthEnd = endOfMonth(monthStart);
    const ym = monthKey(monthStart);

    // Apply payments up to end of this month
    while (payIdx < payments.length && payments[payIdx].date <= monthEnd) {
      let amt = payments[payIdx].amount;

      // Allocate oldest due first
      for (const m of ledger) {
        if (amt <= 0) break;
        if (m.remaining <= 0) continue;
        const take = Math.min(m.remaining, amt);
        m.remaining -= take;
        amt -= take;
      }

      payIdx++;
    }

    // Find due record for this month (if this client even has an installment due this month)
    const idxThis = ledger.findIndex((m) => m.ym === ym);

    // If there is no due month for this client this month, contribution is 0
    if (idxThis === -1) {
      out.set(ym, 0);
    } else {
      // All prior due months must be fully paid as-of end of this month
      const priorAllPaid = ledger
        .slice(0, idxThis)
        .every((m) => (m.remaining || 0) <= 0);

      out.set(ym, priorAllPaid ? Number(ledger[idxThis].expected || 0) : 0);
    }

    cur = addMonths(cur, 1);
  }

  return out;
}

// PUBLIC: compute collections for a date-range, by due month
export function computeCollectionsByPeriod(clients, rangeStart, rangeEnd) {
  // Normalize to month starts
  const rs = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const re = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);

  // Aggregate across clients:
  // - expected: "next-expected eligibility" per month (per rules above)
  // - collected: allocated to the due month (can include late payments up to end of reporting range)
  const agg = new Map(); // ym -> { expected, collected }

  const cutoff = endOfMonth(re);

  for (const c of clients || []) {
    // If closed, ignore entirely (matches prior behavior)
    const status = (c.status || c.billingStatus || "active").toLowerCase();
    if (status === "closed") continue;

    // If paused, we honor pause within buildClientDueMonths and also ignore future accrual;
    // you can keep paused clients included for collected if they have payments; buildClientDueMonths
    // will stop at pause month anyway.
    const dueMonths = buildClientDueMonths(c, re);

    if (!dueMonths.length) continue;

    // 1) Compute "Expected" contributions under the NEW rule (month-by-month simulation)
    const expectedMap = computeClientExpectedEligibilityByMonth(c, dueMonths, rs, re);

    // 2) Compute "Collected" allocations up to end of reporting window (late payments included)
    const allocated = allocatePaymentsToDueMonths(
      c,
      // fresh copy because allocation mutates
      dueMonths.map((m) => ({ ...m, collected: 0, remaining: m.expected })),
      cutoff
    );

    // Roll into aggregator for months within range
    for (const m of allocated) {
      const d = m.date;
      if (d < rs || d > re) continue;

      const key = m.ym;
      const cur = agg.get(key) || { expected: 0, collected: 0 };

      // ✅ expected is "next expected only" per eligibility map
      cur.expected += Number(expectedMap.get(key) || 0);

      // ✅ collected is still allocated to this due month (can include late payments)
      cur.collected += Number(m.collected || 0);

      agg.set(key, cur);
    }
  }

  // Build sorted array of periods (one row per month in window)
  const out = [];
  let cur = new Date(rs);

  while (cur <= re) {
    const key = monthKey(cur);
    const row = agg.get(key) || { expected: 0, collected: 0 };

    const expected = row.expected;
    const collected = row.collected;

    const variance = collected - expected;
    const rateRaw = expected > 0 ? (collected / expected) * 100 : 0;
    const collectionRate = Math.min(100, Math.max(0, Math.round(rateRaw)));
    const excessCollected = Math.max(0, variance);

    out.push({
      ym: key,
      label: cur.toLocaleString("default", { month: "long", year: "numeric" }),
      expected,
      collected,
      variance,
      collectionRate,
      excessCollected,
    });

    cur = addMonths(cur, 1);
  }

  // Totals for header
  const totals = out.reduce(
    (acc, r) => {
      acc.expected += r.expected;
      acc.collected += r.collected;
      acc.variance += r.variance;
      acc.excessCollected += r.excessCollected;
      return acc;
    },
    { expected: 0, collected: 0, variance: 0, excessCollected: 0 }
  );

  const rateTotalRaw =
    totals.expected > 0 ? (totals.collected / totals.expected) * 100 : 0;
  const collectionRateTotal = Math.min(100, Math.max(0, Math.round(rateTotalRaw)));

  return { rows: out, totals: { ...totals, collectionRate: collectionRateTotal } };
}

/* --------- small helpers ---------- */
function ymKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthInRange(ym, start, end) {
  const s = ymKey(start);
  const endPlus = new Date(end);
  endPlus.setMonth(endPlus.getMonth() + 1);
  const ePlus = ymKey(endPlus);
  return ym >= s && ym < ePlus;
}

/* (kept for other files that import these helpers) */
export { monthInRange };

/* --------- date helpers (kept for compatibility) ---------- */
function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfQuarter(d) {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1);
}