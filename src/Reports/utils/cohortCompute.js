// src/Reports/utils/cohortCompute.js

// ---------- Date helpers ----------
const pad = (n) => String(n).padStart(2, "0");
export const toDate = (raw) => (raw?.seconds ? new Date(raw.seconds * 1000) : new Date(raw));
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const fromYMD = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d || 1);
};

// ---------- Amount per month ----------
const getInstallmentAmountForDate = (client, date) => {
  const sched = (client.installmentSchedule || []).slice().sort((a, b) => new Date(a.start) - new Date(b.start));
  for (let i = 0; i < sched.length; i++) {
    const s = sched[i];
    const sStart = new Date(s.start);
    const sEnd = new Date(s.end);
    if (date >= sStart && date <= sEnd) return Number(s.amount);
  }
  return Number(client.installmentAmount || 500);
};

// 15th-of-month sequence
const buildMonth15List = (start15, endDate) => {
  const out = [];
  const cursor = new Date(start15);
  while (cursor <= endDate) {
    out.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
};

// Anchor (expectedAnchor if present, else firstInstallmentDate)
const getAnchorDate = (client) => {
  if (client.expectedAnchor) {
    const d = toDate(client.expectedAnchor);
    if (!isNaN(d)) return d;
  }
  const d = toDate(client.firstInstallmentDate);
  return isNaN(d) ? null : d;
};

// Skip array: ["YYYY-MM", ...]
const isSkippedMonth = (client, monthDate) => {
  const list = client.skipMonths || [];
  return list.includes(ym(monthDate));
};

// Accrual rule considering pause/closed
const monthIsInAccrual = (client, m15, asOf) => {
  const status = (client.status || "active").toLowerCase();
  if (status === "closed") return false;
  if (status === "paused") {
    const pauseStart = client.pauseStartedAt ? toDate(client.pauseStartedAt) : null;
    if (pauseStart) {
      const pauseMonth15 = new Date(pauseStart.getFullYear(), pauseStart.getMonth(), 15);
      if (m15 >= pauseMonth15) return false; // pause-month and beyond do not accrue
    }
  }
  return m15 <= asOf;
};

// Build list of accrual months up to asOf (after pause/skip filtering)
const buildAccrualMonths = (client, asOf) => {
  const anchor = getAnchorDate(client);
  if (!anchor) return [];
  const firstDue = new Date(anchor.getFullYear(), anchor.getMonth(), 15);
  const raw = buildMonth15List(firstDue, asOf).filter((m15) => monthIsInAccrual(client, m15, asOf));
  return raw.filter((m15) => !isSkippedMonth(client, m15));
};

// Payments after initialPaymentDate up to asOf
const buildPaymentPool = (client, asOf) => {
  const initialDate = client.initialPaymentDate ? fromYMD(client.initialPaymentDate) : null;
  return (client.payments || [])
    .filter((p) => {
      const pd = fromYMD(p.date);
      return pd && (!initialDate || pd > initialDate) && pd <= asOf;
    })
    .map((p) => ({ amount: Number(p.amount || 0) }));
};

// --- Past-due test at a specific date ---
const isPastDueAt = (client, asOf) => {
  const status = (client.status || "active").toLowerCase();
  if (status === "closed") return false;

  const months = buildAccrualMonths(client, asOf);
  if (months.length === 0) return false;

  const pool = buildPaymentPool(client, asOf);
  for (const m15 of months) {
    const due = getInstallmentAmountForDate(client, m15);
    let paid = 0;
    for (const p of pool) {
      if (p.amount <= 0) continue;
      const take = Math.min(due - paid, p.amount);
      paid += take;
      p.amount -= take;
      if (paid >= due) break;
    }
    if (paid < due) return true;
  }
  return false;
};

// --- First delinquency date (15th) if it ever occurred up to now ---
const firstDelinquencyDate = (client, now = new Date()) => {
  const status = (client.status || "active").toLowerCase();
  if (status === "closed") return null;

  const months = buildAccrualMonths(client, now);
  if (months.length === 0) return null;

  const pool = buildPaymentPool(client, now);
  for (const m15 of months) {
    const due = getInstallmentAmountForDate(client, m15);
    let paid = 0;
    for (const p of pool) {
      if (p.amount <= 0) continue;
      const take = Math.min(due - paid, p.amount);
      paid += take;
      p.amount -= take;
      if (paid >= due) break;
    }
    if (paid < due) return m15;
  }
  return null;
};

// --- Amount Due now (sum due months - payments), respecting pause/skip/closed ---
const amountDueNow = (client, now = new Date()) => {
  const status = (client.status || "active").toLowerCase();
  if (status === "closed") return 0;

  const months = buildAccrualMonths(client, now);
  if (months.length === 0) return 0;

  const pool = buildPaymentPool(client, now);
  let dueSum = 0;
  for (const m15 of months) {
    dueSum += getInstallmentAmountForDate(client, m15);
  }
  const paidSum = pool.reduce((s, p) => s + (p.amount || 0), 0);
  return Math.max(0, dueSum - paidSum);
};

// ---------- Public API ----------
export function buildCohorts(clients, options = {}) {
  const {
    windows = [30, 60, 90, 120], // 120 is treated as "<=120"; we'll add 120+ separately
    cohortStart,
    cohortEnd,
    now = new Date(),
    filters = {}, // { caseType, caseStatus, billingStatus }
  } = options;

  // Filter clients
  let list = clients.slice();
  const wantType = filters.caseType && filters.caseType !== "Any" ? filters.caseType : null;
  const wantCaseStatus = filters.caseStatus && filters.caseStatus !== "Any" ? filters.caseStatus : null;
  const wantBilling = filters.billingStatus && filters.billingStatus !== "Any" ? filters.billingStatus.toLowerCase() : null;

  if (wantType) list = list.filter((c) => (c.caseType || "") === wantType);
  if (wantCaseStatus) list = list.filter((c) => (c.caseStatus || "") === wantCaseStatus);
  if (wantBilling) list = list.filter((c) => ((c.status || "active").toLowerCase() === wantBilling));

  // Group by signup month (initialPaymentDate month)
  const cohorts = new Map();
  for (const c of list) {
    if (!c.initialPaymentDate) continue;
    const d = fromYMD(c.initialPaymentDate);
    if (!d || isNaN(d)) continue;
    const key = ym(d);
    if (!cohorts.has(key)) cohorts.set(key, { key, month: d, clients: [] });
    cohorts.get(key).clients.push(c);
  }

  const startBoundary = cohortStart ? new Date(cohortStart.getFullYear(), cohortStart.getMonth(), 1) : null;
  const endBoundary = cohortEnd ? new Date(cohortEnd.getFullYear(), cohortEnd.getMonth(), 1) : null;

  const rows = [];
  for (const [key, bucket] of cohorts.entries()) {
    const cohortMonth = bucket.month;
    if (startBoundary && cohortMonth < startBoundary) continue;
    if (endBoundary) {
      const endNext = new Date(endBoundary.getFullYear(), endBoundary.getMonth() + 1, 1);
      if (cohortMonth >= endNext) continue;
    }

    const clientsInCohort = bucket.clients;
    const size = clientsInCohort.length;

    const totals = {
      size,
      paused: 0,
      current: 0,
      pastDue: 0,
    };

    const byWindow = {}; // {30:{pd,list},60:{},90:{},120:{}, "120plus":{pd,list}}
    for (const w of windows) byWindow[w] = { pd: 0, list: [] };
    byWindow["120plus"] = { pd: 0, list: [] };

    let totalDueNow = 0;
    let pdDaysAccumulator = 0; // sum of days-to-first-PD across those who became PD
    let pdCountForAvg = 0;

    for (const cli of clientsInCohort) {
      const statusNow = (cli.status || "active").toLowerCase();
      if (statusNow === "paused") totals.paused++;

      const pdNow = isPastDueAt(cli, now);
      if (pdNow) totals.pastDue++; else if (statusNow !== "paused") totals.current++;

      // Sum due now (closed treated as 0 internally)
      totalDueNow += amountDueNow(cli, now);

      // Window buckets
      const ipd = fromYMD(cli.initialPaymentDate);
      const firstPD = firstDelinquencyDate(cli, now);
      if (firstPD) {
        // avg days to PD
        const days = Math.floor((firstPD - ipd) / (1000 * 60 * 60 * 24));
        if (Number.isFinite(days) && days >= 0) {
          pdDaysAccumulator += days;
          pdCountForAvg++;
        }

        // bucket by first PD timing
        if (days <= 30) {
          byWindow[30].pd++; byWindow[30].list.push(cli);
        } else if (days <= 60) {
          byWindow[60].pd++; byWindow[60].list.push(cli);
        } else if (days <= 90) {
          byWindow[90].pd++; byWindow[90].list.push(cli);
        } else if (days <= 120) {
          byWindow[120].pd++; byWindow[120].list.push(cli);
        } else {
          byWindow["120plus"].pd++; byWindow["120plus"].list.push(cli);
        }
      }
    }

    const avgDaysToPD = pdCountForAvg ? Math.round(pdDaysAccumulator / pdCountForAvg) : null;

    rows.push({
      key,
      label: cohortMonth.toLocaleString("default", { month: "long", year: "numeric" }),
      totals,             // { size, paused, current, pastDue }
      byWindow,           // {30,60,90,120,"120plus"}
      totalDueNow,        // number
      avgDaysToPD,        // number|null
      clients: clientsInCohort,
    });
  }

  rows.sort((a, b) => new Date(a.key + "-01") - new Date(b.key + "-01"));
  return rows;
}