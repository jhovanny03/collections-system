// src/Level10/Trends/trends.service.js
// Centralized calculators for the Trends module.
// NOTE: Pure computations only. No React here.
// We rely on your canonical math by importing deriveClientAging.
// Nothing in this file mutates Firestore or other app state.

import { deriveClientAging } from "../services/metrics.compute";

// ---------- Small utils ----------
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const toDate = (raw) => (raw?.seconds ? new Date(raw.seconds * 1000) : new Date(raw));

const isSameYMD = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addWeeks(d, n) {
  return addDays(d, n * 7);
}
function previousSunday(sunday) {
  return addDays(sunday, -7);
}
function median(arr) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function p75(arr) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  const idx = Math.ceil(0.75 * a.length) - 1;
  return a[clamp(idx, 0, a.length - 1)];
}

// Detect "initial/retainer/setup" style payments (exclude from promise kept math & FIFO)
function isInitialPaymentLike(pay, client) {
  if (pay?.isInitial === true) return true;
  const t = (pay?.type || pay?.category || "").toString().toLowerCase();
  if (["initial", "retainer", "setup"].includes(t)) return true;

  // Heuristic: before first installment month start
  const first = client?.firstInstallmentDate ? toDate(client.firstInstallmentDate) : null;
  const d = pay?.date ? toDate(pay.date) : null;
  if (first && d) {
    const firstMonthStart = new Date(first.getFullYear(), first.getMonth(), 1);
    if (d < firstMonthStart) return true;
  }
  return false;
}

// Sum installment payments within [from..to] inclusive, excluding initials
function sumInstallmentPaymentsInRange(client, from, to) {
  const pays = Array.isArray(client?.payments) ? client.payments : [];
  let total = 0;
  for (const p of pays) {
    if (!p?.date) continue;
    const d = toDate(p.date);
    if (d >= from && d <= to && !isInitialPaymentLike(p, client)) {
      total += Number(p.amount || 0);
    }
  }
  return total;
}

// ---------- Per-week helpers ----------
function makeWeekSeries(sunday, weeks = 12) {
  // Returns an array of { monday, sunday, key } from oldest → newest
  const out = [];
  const lastSunday = startOfDay(sunday);
  for (let i = weeks - 1; i >= 0; i--) {
    const s = addWeeks(lastSunday, -i);
    const m = addDays(s, -6);
    out.push({
      monday: startOfDay(m),
      sunday: startOfDay(s),
      key: `${m.getFullYear()}-${pad2(m.getMonth() + 1)}-${pad2(m.getDate())}..${s.getFullYear()}-${pad2(s.getMonth() + 1)}-${pad2(s.getDate())}`,
    });
  }
  return out;
}

// ---------- Metric calculators per week ----------
function calcAgingMixForSunday(clients, sunday, dueDay) {
  let sumCurrent = 0,
    sumLt60 = 0,
    sum60_89 = 0,
    sum90p = 0;

  for (const c of clients) {
    const ag = deriveClientAging(c, sunday, dueDay);
    const bal = Number(ag.remainingBalance || 0);
    if (bal <= 0) continue;

    if (ag.isCurrent) sumCurrent += bal;
    else if (ag.agingDays < 60) sumLt60 += bal;
    else if (ag.agingDays < 90) sum60_89 += bal;
    else sum90p += bal;
  }

  const total = sumCurrent + sumLt60 + sum60_89 + sum90p;
  const pct = (x) => (total > 0 ? Math.round((x / total) * 100) : 0);

  return {
    amounts: { current: sumCurrent, lt60: sumLt60, mid60_89: sum60_89, over90: sum90p, total },
    percents: { current: pct(sumCurrent), lt60: pct(sumLt60), mid60_89: pct(sum60_89), over90: pct(sum90p) },
  };
}

function calcOnlyCurrentMonthForSunday(clients, sunday, dueDay) {
  const monthKey = ymKey(sunday);
  let count = 0;
  let pastDueCount = 0;

  for (const c of clients) {
    const ag = deriveClientAging(c, sunday, dueDay);
    if (!ag.isCurrent) {
      pastDueCount++;
      if (Array.isArray(ag.dueMonthKeys) && ag.dueMonthKeys.length === 1 && ag.dueMonthKeys[0] === monthKey) {
        count++;
      }
    }
  }
  const pctOfPD = pastDueCount > 0 ? Math.round((count / pastDueCount) * 100) : 0;
  return { count, pctOfPD, pastDueCount };
}

function calcTimeToCureThisWeek(clients, monday, sunday, dueDay) {
  const times = [];

  // Iterate only on clients recovered within the week
  for (const c of clients) {
    const mon = deriveClientAging(c, monday, dueDay);
    const sun = deriveClientAging(c, sunday, dueDay);
    if (mon.isCurrent || !sun.isCurrent) continue;

    // Find oldest missed month’s due date from Monday snapshot
    const oldestKey = Array.isArray(mon.dueMonthKeys) && mon.dueMonthKeys.length > 0 ? mon.dueMonthKeys[0] : null;
    if (!oldestKey) continue;
    const [y, m] = oldestKey.split("-").map((x) => Number(x));
    const oldestDueDate = new Date(y, m - 1, dueDay);

    // Find first day in the week when client becomes current
    let flipDate = null;
    for (let i = 0; i < 7; i++) {
      const day = addDays(monday, i);
      const ag = deriveClientAging(c, day, dueDay);
      if (ag.isCurrent) {
        flipDate = startOfDay(day);
        break;
      }
    }
    if (!flipDate) continue;

    const days = Math.max(0, Math.floor((flipDate - oldestDueDate) / (1000 * 60 * 60 * 24)));
    times.push(days);
  }

  return {
    sampleSize: times.length,
    medianDays: Math.round(median(times)),
    p75Days: Math.round(p75(times)),
  };
}

function calcPromisesKeptThisWeek(clients, monday, sunday) {
  let totalPromises = 0;
  let keptCount = 0;
  let promisedAmount = 0;
  let keptAmount = 0;

  for (const c of clients) {
    const p = c?.paymentPromise;
    if (!p?.date) continue;
    const when = toDate(p.date);
    const amt = Number(p.amount || 0) || 0;
    if (!(when >= monday && when <= sunday) || amt <= 0) continue;

    totalPromises += 1;
    promisedAmount += amt;

    // Payments counted from Monday up to and including promise date
    const paid = sumInstallmentPaymentsInRange(c, monday, when);
    if (paid >= amt) {
      keptCount += 1;
      keptAmount += Math.min(paid, amt);
    } else {
      keptAmount += Math.max(0, paid);
    }
  }

  const keptRate = totalPromises > 0 ? Math.round((keptCount / totalPromises) * 100) : 0;
  return {
    totalPromises,
    keptCount,
    keptRate,
    promisedAmount: Math.round(promisedAmount),
    keptAmount: Math.round(keptAmount),
  };
}

function calcAtRiskThisWeek(clients, monday, sunday, dueDay) {
  let newEntrants = 0;
  let lt60Sun = 0;

  for (const c of clients) {
    const mon = deriveClientAging(c, monday, dueDay);
    const sun = deriveClientAging(c, sunday, dueDay);

    if (!sun.isCurrent && sun.agingDays < 60) lt60Sun++;
    if (mon.isCurrent && !sun.isCurrent && sun.agingDays < 60) newEntrants++;
  }

  // Net change vs prior Sunday
  const prevSun = previousSunday(sunday);
  let lt60PrevSun = 0;
  for (const c of clients) {
    const agPrev = deriveClientAging(c, prevSun, dueDay);
    if (!agPrev.isCurrent && agPrev.agingDays < 60) lt60PrevSun++;
  }
  const netChangeLt60 = lt60Sun - lt60PrevSun;

  return { newEntrants, netChangeLt60, lt60Sun, lt60PrevSun };
}

function calcConcentrationRiskForSunday(clients, sunday, dueDay) {
  const rows = [];
  let totalAR = 0;

  for (const c of clients) {
    const ag = deriveClientAging(c, sunday, dueDay);
    const bal = Math.round(Number(ag.remainingBalance || 0));
    if (bal <= 0) continue;
    totalAR += bal;
    const firstName = (c.firstName || "").trim();
    const lastName = (c.lastName || "").trim();
    rows.push({
      id: c.id,
      name: (firstName || lastName) ? `${firstName} ${lastName}`.trim() : (c.displayName || c.id),
      balance: bal,
    });
  }

  rows.sort((a, b) => b.balance - a.balance);
  const top = rows.slice(0, 10);
  const topSum = top.reduce((s, r) => s + r.balance, 0);
  let running = 0;
  const topWithCum = top.map((r) => {
    running += r.balance;
    return {
      ...r,
      cumulativePct: totalAR > 0 ? Math.round((running / totalAR) * 100) : 0,
    };
  });

  return {
    totalAR: Math.round(totalAR),
    top10Sum: Math.round(topSum),
    top10Pct: totalAR > 0 ? Math.round((topSum / totalAR) * 100) : 0,
    top10: topWithCum,
  };
}

// ---------- Public orchestrator ----------
/**
 * Compute all trends for the last `weeksWindow` weeks ending at `sunday`.
 * Inputs:
 *  - clients: full client array from Firestore
 *  - monday: Date (Monday of the "current" week in your L10)
 *  - sunday: Date (Sunday of the "current" week in your L10)
 *  - month: 'YYYY-MM' (used only for labels when needed)
 *  - dueDay: number (15)
 *  - weeksWindow: default 12
 *
 * Output shape:
 * {
 *   series: {
 *     agingMix: [{ key, percents:{...}, amounts:{...} }, ...],
 *     onlyCurrentMonth: [{ key, count, pctOfPD, pastDueCount }, ...],
 *     timeToCure: [{ key, sampleSize, medianDays, p75Days }, ...],
 *     promises: [{ key, totalPromises, keptCount, keptRate, promisedAmount, keptAmount }, ...],
 *     atRisk: [{ key, newEntrants, netChangeLt60, lt60Sun, lt60PrevSun }, ...],
 *   },
 *   concentrationNow: { totalAR, top10Sum, top10Pct, top10: [{id,name,balance,cumulativePct}...] }
 * }
 */
export function computeTrends({
  clients,
  monday,
  sunday,
  month,
  dueDay = 15,
  weeksWindow = 12,
}) {
  const weeks = makeWeekSeries(sunday, weeksWindow);

  const agingMix = [];
  const onlyCurrentMonth = [];
  const timeToCure = [];
  const promises = [];
  const atRisk = [];

  for (const w of weeks) {
    agingMix.push({
      key: w.key,
      ...calcAgingMixForSunday(clients, w.sunday, dueDay),
    });

    onlyCurrentMonth.push({
      key: w.key,
      ...calcOnlyCurrentMonthForSunday(clients, w.sunday, dueDay),
    });

    timeToCure.push({
      key: w.key,
      ...calcTimeToCureThisWeek(clients, w.monday, w.sunday, dueDay),
    });

    promises.push({
      key: w.key,
      ...calcPromisesKeptThisWeek(clients, w.monday, w.sunday),
    });

    atRisk.push({
      key: w.key,
      ...calcAtRiskThisWeek(clients, w.monday, w.sunday, dueDay),
    });
  }

  const concentrationNow = calcConcentrationRiskForSunday(clients, sunday, dueDay);

  return {
    series: { agingMix, onlyCurrentMonth, timeToCure, promises, atRisk },
    concentrationNow,
    meta: {
      weeksWindow,
      month,
      range: { from: weeks[0]?.monday, to: weeks[weeks.length - 1]?.sunday },
    },
  };
}