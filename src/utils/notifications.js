// src/utils/notifications.js
// ---------------------------
// Lógica para generar notificaciones desde la lista de clientes.

// Convierte varios formatos a Date
const toDate = (v) => {
  if (v && typeof v === "object" && typeof v.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

export const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();

const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1, 0, 0, 0, 0);
const monthsPassedInclusive = (start, asOf) =>
  (asOf.getFullYear() - start.getFullYear()) * 12 +
  (asOf.getMonth() - start.getMonth()) + 1;

// --------- Cuota mensual aplicable a un mes (respeta installmentSchedule si existe) ---------
function getMonthlyForMonth(client, monthDate) {
  const schedule = Array.isArray(client?.installmentSchedule) ? client.installmentSchedule : [];
  const mStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);

  for (const item of schedule) {
    const s = toDate(item?.start);
    const e = toDate(item?.end);
    const amt = Number(item?.amount || 0);
    if (!s || !e || !amt) continue;
    const overlaps = !(e < mStart || s > mEnd);
    if (overlaps) return amt;
  }

  const fallback = Number(client?.installmentAmount || 0) || 500;
  return fallback > 0 ? fallback : 0;
}

// --------- Adeudado acumulado hasta “asOf” (usando schedule si existe) ---------
function amountDueAsOf(client, asOf = new Date()) {
  const start = toDate(client?.firstInstallmentDate);
  if (!start) return 0;

  const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
  const asOfMonth = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  if (asOfMonth < startMonth) return 0;

  let expected = 0;
  for (let cursor = new Date(startMonth); cursor <= asOfMonth; cursor = addMonths(cursor, 1)) {
    expected += getMonthlyForMonth(client, cursor);
  }

  const paid = (client?.payments || [])
    .map((p) => ({ ...p, d: toDate(p?.date) }))
    .filter((p) => p.d && p.d >= start && p.d <= asOf)
    .reduce((sum, p) => sum + Number(p?.amount || 0), 0);

  return Math.max(0, expected - paid);
}

// --------- Meses “missed” a la fecha ---------
function missedMonthsAsOf(client, asOf = new Date()) {
  const start = toDate(client?.firstInstallmentDate);
  if (!start) return 0;
  const monthly = getMonthlyForMonth(client, asOf);
  const months = monthsPassedInclusive(start, asOf);

  const paid = (client?.payments || [])
    .map((p) => ({ ...p, d: toDate(p?.date) }))
    .filter((p) => p.d && p.d >= start && p.d <= asOf)
    .reduce((sum, p) => sum + Number(p?.amount || 0), 0);

  const paidMonths = monthly > 0 ? Math.floor(paid / monthly) : 0;
  return Math.max(0, months - paidMonths);
}

// ==============================
//   1) Promises que vencen hoy
// ==============================
export function promisesDueToday(clients, today = new Date()) {
  const t0 = startOfDay(today);
  return clients.filter((c) => {
    const dp = toDate(c?.paymentPromise?.date);
    return dp && sameDay(dp, t0);
  });
}

// ==============================
//   2) Conteo de Follow-Ups pendientes (ventana 15→15)
//      Regla: NO past-due antes de la ventana, HOY exactamente 1 mes de atraso, sin promise.
//      (si existe nextFollowUpDate, que esté en la ventana)
// ==============================
export function countOutstandingFollowUps(clients, today = new Date()) {
  const t0 = startOfDay(today);
  const cutoffDay = 15;
  let windowStart, windowEnd;
  if (t0.getDate() < cutoffDay) {
    windowStart = new Date(t0.getFullYear(), t0.getMonth() - 1, cutoffDay);
    windowEnd   = new Date(t0.getFullYear(), t0.getMonth(), cutoffDay);
  } else {
    windowStart = new Date(t0.getFullYear(), t0.getMonth(), cutoffDay);
    windowEnd   = new Date(t0.getFullYear(), t0.getMonth() + 1, cutoffDay);
  }

  const tsBefore = new Date(windowStart.getTime() - 1); // instante anterior a la apertura

  return clients.filter((c) => {
    if (c?.paymentPromise) return false;

    if (c?.nextFollowUpDate) {
      const nfd = toDate(c.nextFollowUpDate);
      if (!nfd || nfd < windowStart || nfd >= windowEnd) return false;
    }

    const missedBefore = missedMonthsAsOf(c, tsBefore);
    const missedNow    = missedMonthsAsOf(c, t0);
    if (missedBefore !== 0) return false;
    if (missedNow !== 1) return false;
    if (amountDueAsOf(c, t0) <= 0) return false;

    return true;
  }).length;
}
