// src/Reports/utils/collectionsCompute.js
//
// Computes Expected vs Collected by DUE MONTH (not payment month).
// - Allocates payments "oldest due first" against monthly expected amounts.
// - Honors pause/close/skips best-effort with the data on the client.
// - Returns capped collection rate (<=100%) and excess collected.
//

// ----- helpers -----
const toLocalYMD = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

const monthKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const cloneDate = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);

const parseMaybeTs = (raw) =>
  raw && raw.seconds ? new Date(raw.seconds * 1000) : (raw ? new Date(raw) : null);

// 🔧 NEW: normalize to the 15th (your due day) before comparing to schedule tiers
const toDueMidMonth = (dateLike) => {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return new Date(d.getFullYear(), d.getMonth(), 15);
};

const getInstallmentAmountForDate = (client, date) => {
  const dueMid = toDueMidMonth(date);
  const schedule = (client.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  for (const s of schedule) {
    const sStart = new Date(s.start);
    const sEnd = new Date(s.end);
    // compare against the 15th of the month
    if (dueMid >= sStart && dueMid <= sEnd) return Number(s.amount || 0);
  }
  return Number(client.installmentAmount || 500);
};

// Did this month accrue while paused/closed?
const monthAccrues = (client, monthDate) => {
  const status = (client.status || "active").toLowerCase();
  if (status === "closed") return false;

  // Pause logic: if pauseStartedAt exists AND the month is >= pause month, no accrual.
  const pauseAt = parseMaybeTs(client.pauseStartedAt);
  if (pauseAt) {
    const pauseMonth = new Date(pauseAt.getFullYear(), pauseAt.getMonth(), 1);
    const m = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    if (m >= pauseMonth) return false;
  }
  return true;
};

// Skipped months array can be ['2025-04', '2025-05', ...]
const isSkippedMonth = (client, monthDate) => {
  const sk = client.skippedMonths || [];
  return sk.includes(monthKey(monthDate));
};

// Build all due months for a client between a wide window (we'll slice later)
const buildClientDueMonths = (client) => {
  const rawStart = client.firstInstallmentDate;
  if (!rawStart) return [];

  // Anchor: if expectedAnchor exists (resume point), use it, else start from firstInstallmentDate
  const expectedAnchor = client.expectedAnchor ? new Date(client.expectedAnchor) : null;
  const start = expectedAnchor || parseMaybeTs(rawStart);
  if (!(start instanceof Date) || isNaN(start)) return [];

  // Go up to +36 months safety
  const limit = addMonths(new Date(start.getFullYear(), start.getMonth(), 1), 36);

  const months = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= limit) {
    const m = new Date(cur);
    if (monthAccrues(client, m) && !isSkippedMonth(client, m)) {
      // 🔧 Use the 15th to determine expected for this month
      const dueMid = toDueMidMonth(m);
      const exp = getInstallmentAmountForDate(client, dueMid);

      months.push({
        ym: monthKey(m),
        date: m,
        expected: exp,
        collected: 0,
        remaining: exp, // for allocation
      });
    }
    cur = addMonths(cur, 1);
  }
  return months;
};

// Allocate payments oldest-due-first across all due months
const allocatePaymentsToDueMonths = (client, dueMonths) => {
  // Payments after initial payment date participate in installment coverage
  const ipd = client.initialPaymentDate ? new Date(client.initialPaymentDate) : null;
  const payments = (client.payments || [])
    .filter((p) => !ipd || new Date(p.date) > ipd)
    .map((p) => ({ amount: Number(p.amount || 0), date: new Date(p.date) }))
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

// PUBLIC: compute collections for a date-range, by due month
export function computeCollectionsByPeriod(clients, rangeStart, rangeEnd) {
  const rs = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const re = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);

  // Aggregate all clients’ due months
  const agg = new Map(); // ym -> { expected, collected }
  for (const c of clients || []) {
    const dueMonths = allocatePaymentsToDueMonths(c, buildClientDueMonths(c));
    for (const m of dueMonths) {
      // Only sum due months within the requested reporting range
      const d = m.date;
      if (d < rs || d > re) continue;
      const key = m.ym;
      const cur = agg.get(key) || { expected: 0, collected: 0 };
      cur.expected += Number(m.expected || 0);
      cur.collected += Number(m.collected || 0);
      agg.set(key, cur);
    }
  }

  // Build sorted array of periods
  const out = [];
  let cur = new Date(rs);
  while (cur <= re) {
    const key = monthKey(cur);
    const row = agg.get(key) || { expected: 0, collected: 0 };
    const expected = row.expected;
    const collected = row.collected;

    const variance = collected - expected;
    const rateRaw = expected > 0 ? (collected / expected) * 100 : 0;
    const collectionRate = Math.min(100, Math.max(0, Math.round(rateRaw))); // cap at 100
    const excessCollected = Math.max(0, variance);

    out.push({
      ym: key,
      label: cur.toLocaleString("default", { month: "long", year: "numeric" }),
      expected,
      collected,
      variance,
      collectionRate,   // capped
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
  const rateTotalRaw = totals.expected > 0 ? (totals.collected / totals.expected) * 100 : 0;
  const collectionRateTotal = Math.min(100, Math.max(0, Math.round(rateTotalRaw)));

  return { rows: out, totals: { ...totals, collectionRate: collectionRateTotal } };
}

/* ======================
   Per-client allocation
   ====================== */

// Build the per-client due-month ledger and allocate payments oldest-first.
function allocateClientByDueMonth(client, rangeStart, rangeEnd) {
  const status = (client.billingStatus || client.status || "active").toLowerCase();
  const isClosed = status === "closed";

  // Dates
  const firstInstallmentRaw = client.firstInstallmentDate;
  if (!firstInstallmentRaw) return { months: new Map() };

  const firstInstallmentDate =
    firstInstallmentRaw?.seconds
      ? new Date(firstInstallmentRaw.seconds * 1000)
      : new Date(firstInstallmentRaw);

  // due on the 15th
  const firstDue = new Date(
    firstInstallmentDate.getFullYear(),
    firstInstallmentDate.getMonth(),
    15
  );

  // Pause logic (stop accruing on/after pause month)
  const pauseStart = client.pauseStartedAt
    ? (client.pauseStartedAt?.seconds
        ? new Date(client.pauseStartedAt.seconds * 1000)
        : new Date(client.pauseStartedAt))
    : null;
  const pauseCutoffYM = pauseStart
    ? ymKey(new Date(pauseStart.getFullYear(), pauseStart.getMonth(), 1))
    : null;

  // Skip logic (array of "YYYY-MM")
  const skipSet = new Set((client.skipMonths || []).map(String));

  // Schedule
  const schedule = (client.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const getInstallmentAmountFor = (date) => {
    // use 15th here too (cursor itself is the 15th, but we enforce it)
    const dueMid = toDueMidMonth(date);
    for (const s of schedule) {
      const sStart = new Date(s.start);
      const sEnd = new Date(s.end);
      if (dueMid >= sStart && dueMid <= sEnd) return Number(s.amount || 0);
    }
    return Number(client.installmentAmount || 500);
  };

  // Build due months from firstDue up to rangeEnd (monthly)
  const months = new Map(); // ym -> { expected, collected }
  if (!isClosed) {
    const cursor = new Date(firstDue); // this starts on the 15th
    const hardEnd = new Date(rangeEnd);
    hardEnd.setMonth(hardEnd.getMonth() + 1); // include end month generation

    while (cursor < hardEnd) {
      const ym = ymKey(cursor);

      // Pause cut: if paused and this month is on/after pause month, do not accrue expected
      const pausedMonth = pauseCutoffYM && ym >= pauseCutoffYM;

      // Skipped month?
      const skipped = skipSet.has(ym);

      const expected = pausedMonth || skipped ? 0 : getInstallmentAmountFor(cursor);
      months.set(ym, { expected, collected: 0 });

      // move exactly one month, keeping day=15 intact
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // Payments after initial date only
  const initialPayDate = client.initialPaymentDate ? new Date(client.initialPaymentDate) : null;
  const rawPayments = (client.payments || [])
    .filter((p) => {
      const d = new Date(p.date);
      return initialPayDate ? d > initialPayDate : true;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((p) => ({ amount: Number(p.amount || 0), date: new Date(p.date) }));

  // Allocate oldest-first over ALL months from firstDue forward
  const allocKeys = Array.from(months.keys()).sort();
  for (const pay of rawPayments) {
    let remaining = pay.amount;
    for (const ym of allocKeys) {
      if (remaining <= 0) break;

      const rec = months.get(ym);
      if (!rec) continue;

      const cap = Math.max(0, rec.expected - rec.collected);
      if (cap <= 0) continue;

      const take = Math.min(cap, remaining);
      rec.collected += take;
      remaining -= take;
    }
  }

  return { months };
}

/* --------- small helpers ---------- */
function ymKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function monthInRange(ym, start, end) {
  const s = ymKey(start);
  const e = ymKey(end);
  const endPlus = new Date(end);
  endPlus.setMonth(endPlus.getMonth() + 1);
  const ePlus = ymKey(endPlus);
  return ym >= s && ym < ePlus;
}

/* (kept for other files that import these helpers) */
export { monthInRange };

/* --------- date helpers already in your file ---------- */
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