// src/Reports/utils/cohortCompute.js
import { computeBillingSnapshot } from "./billingCompute";

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
      // Single source of truth for past-due/amount-due, shared with A/R Aging.
      const snap = computeBillingSnapshot(cli, now);
      const statusNow = snap.status;

      if (statusNow === "paused") totals.paused++;

      const pdNow = snap.missedMonths > 0;
      if (pdNow) totals.pastDue++; else if (statusNow !== "paused") totals.current++;

      totalDueNow += snap.amountDue;

      // Window buckets (days from signup to oldest still-unpaid due month)
      const ipd = fromYMD(cli.initialPaymentDate);
      const firstPD = snap.oldestUnpaidDueDate;
      if (firstPD && ipd) {
        const days = Math.floor((firstPD - ipd) / (1000 * 60 * 60 * 24));
        if (Number.isFinite(days) && days >= 0) {
          pdDaysAccumulator += days;
          pdCountForAvg++;
        }

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
