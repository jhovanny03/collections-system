// src/ClientDashboard/letters/_helpers/billing.js
export function computeCurrentPastDue(client) {
  const monthly = Number(client?.installmentAmount || 500);
  const rawStart = client?.firstInstallmentDate;
  if (!rawStart) return 0;

  const start = rawStart?.seconds ? new Date(rawStart.seconds * 1000) : new Date(rawStart);
  if (isNaN(start.getTime())) return 0;

  const today = new Date();
  const monthsSinceStart =
    (today.getFullYear() - start.getFullYear()) * 12 +
    (today.getMonth() - start.getMonth()) +
    (today.getDate() >= start.getDate() ? 1 : 0);

  const expectedInstallments = Math.max(0, monthsSinceStart);
  const expectedTotal = expectedInstallments * monthly;

  const payments = Array.isArray(client?.payments) ? client.payments : [];
  const validPaid = payments
    .map((p) => ({ ...p, d: new Date(p.date) }))
    .filter((p) => !isNaN(p.d.getTime()) && p.d >= start)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return Math.max(0, expectedTotal - validPaid);
}