// src/billing/callCredit.js
// "Payment after a call": MyCase does not record who on the team processed a payment
// (and the initials in payment notes are intake's), so billing gets credit from RingCentral:
//   a payment-plan payment (initial payments left out) is credited to the billing team
//   member who TALKED with the client (connected call, 40 s or more, made or received) on
//   the payment day or up to CREDIT_DAYS days before it. Several people? The most recent
//   call before the payment wins.
// Calls are ringcentralCalls documents ({ at, by, connected, clientIds }).

export const CREDIT_DAYS = 3;

const dayKey = (d) => {
  const x = d instanceof Date ? d : new Date(`${String(d).slice(0, 10)}T12:00:00`);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const addDays = (key, n) => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};

/** Connected billing calls grouped by client id, newest first. */
export function callsByClient(calls) {
  const map = new Map();
  for (const c of calls || []) {
    if (!c || !c.connected || !c.by || !c.at) continue;
    for (const id of c.clientIds || []) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push({ at: c.at, day: dayKey(new Date(c.at)), by: c.by, direction: c.direction });
    }
  }
  map.forEach((list) => list.sort((a, b) => String(b.at).localeCompare(String(a.at))));
  return map;
}

/**
 * The call a payment is credited to, or null.
 * payment: { clientId, date (Date or "YYYY-MM-DD"), initial? }
 */
export function creditFor(payment, byClient, days = CREDIT_DAYS) {
  if (!payment || payment.initial || !payment.clientId) return null;
  const list = byClient.get(payment.clientId);
  if (!list) return null;
  const payDay = dayKey(payment.date);
  const from = addDays(payDay, -days);
  // Newest first: the first call inside the window is the most recent one.
  const hit = list.find((c) => c.day <= payDay && c.day >= from);
  if (!hit) return null;
  const daysBefore = Math.round((new Date(`${payDay}T12:00:00`) - new Date(`${hit.day}T12:00:00`)) / 864e5);
  return { by: hit.by, callAt: hit.at, daysBefore, direction: hit.direction };
}

/** Per person: payments credited after their calls, and how much. */
export function creditTotals(payments, byClient, days = CREDIT_DAYS) {
  const out = new Map();
  for (const p of payments) {
    const c = creditFor(p, byClient, days);
    if (!c) continue;
    const t = out.get(c.by) || { count: 0, amount: 0, clients: new Set() };
    t.count++;
    t.amount += Number(p.amount || 0);
    t.clients.add(p.clientId);
    out.set(c.by, t);
  }
  return out;
}
