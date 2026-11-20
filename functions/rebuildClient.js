// functions/rebuildClient.js
//
// Rebuild ONE existing client's payment history from MyCase, in memory.
// Used by the bulk rebuild script (into the separate "mycase-rebuild" database) and by
// billing's "tag and rebuild" action. Pure: returns what to write, writes nothing.
//
// Rules
//  - The client's hand-entered payments are kept untouched in `legacyPayments`.
//  - Only invoices tagged initial/installment count; "other" is never counted.
//  - Payments on invoices not tagged yet are held (left in the MyCase mirror) until
//    billing tags them; nothing is guessed.
//  - A reversal (rejected e-check, void, credit) cancels the earlier payment of the same
//    size on the same invoice; an unmatched reversal goes to MyCase Review.
//  - Historical payments never clear the client's current payment promise.

const { computeImport, classifyPayment } = require("./mycasePayments");
const { scheduleForPlan } = require("./plans");

// In this firm's MyCase data every reversal (CREDIT, VOID, Rejection) carries a negative
// amount; exact type names are a backstop. Not a substring match: "Credit Card" is a
// normal payment type.
const REVERSAL_TYPES = new Set(["void", "rejection", "refund", "reversal", "chargeback", "nsf"]);
const cents = (v) => Math.round(Number(v || 0) * 100);
const isNegative = (p) =>
  Number(p.amount) < 0 || REVERSAL_TYPES.has(String(p.transaction_type || "").trim().toLowerCase());

/** Monthly amount the app already uses for this client (schedule first, else the app's $500 default). */
function currentMonthly(client) {
  const start = client.firstInstallmentDate;
  const hit = (client.installmentSchedule || []).find((s) => s.start <= start && start <= s.end);
  return Number((hit || (client.installmentSchedule || [])[0] || {}).amount || 500);
}

/**
 * Cancel reversals against the payments they reverse.
 * Returns { kept, reversedPairs, unmatched, cancelledIds } where cancelledIds holds both
 * halves of every pair, so the hourly sync never brings either back.
 */
function netReversals(payments) {
  const pos = payments.filter((p) => !isNegative(p)).map((p) => ({ p, used: false }));
  const unmatched = [];
  const cancelledIds = [];
  let reversedPairs = 0;
  for (const n of payments.filter(isNegative)) {
    const target = pos
      .filter((x) => !x.used && String(x.p.invoice_id) === String(n.invoice_id)
        && cents(x.p.amount) === Math.abs(cents(n.amount))
        && (!x.p.payment_date || !n.payment_date || x.p.payment_date <= n.payment_date))
      .sort((a, b) => String(b.p.payment_date).localeCompare(String(a.p.payment_date)))[0];
    if (target) {
      target.used = true;
      reversedPairs++;
      cancelledIds.push(String(target.p.id), String(n.id));
    } else unmatched.push(n);
  }
  return { kept: pos.filter((x) => !x.used).map((x) => x.p), reversedPairs, unmatched, cancelledIds };
}

/**
 * client:   the existing client doc (with id)
 * roles:    { invoiceId: "initial" | "installment" | "other" } (may be partial)
 * invoices: MyCase invoices of the case (mirror shape: id, number, total, status, ...)
 * payments: MyCase payment FEED rows of the case (id, amount, payment_date, status, invoice_id, ...)
 */
function rebuildClient({ client, roles, invoices, payments, extraPlans = [], invoiceTotalAdjustment = 0, now = new Date() }) {
  const installments = invoices.filter((i) => roles[i.id] === "installment");
  if (!installments.length) throw new Error("No installment invoice tagged; nothing to rebuild.");

  // The client's existing plan settings belong to its first installment invoice. Any
  // further installment invoice (e.g. removal defense) is a separate plan whose amount
  // and start billing enter on the tagging screen (extraPlans).
  const sorted = installments.slice().sort((a, b) => String(a.invoiceDate || "").localeCompare(String(b.invoiceDate || "")));
  const primary = sorted[0];
  const plans = [{
    invoiceId: primary.id, invoiceNumber: primary.number || "", total: Number(primary.total || 0),
    monthlyAmount: currentMonthly(client), startDate: client.firstInstallmentDate || primary.dueDate || null,
  }];
  for (const inv of sorted.slice(1)) {
    const p = extraPlans.find((x) => String(x.invoiceId) === String(inv.id)) || {};
    const monthly = Number(p.monthlyAmount);
    if (!Number.isFinite(monthly) || monthly <= 0) throw new Error(`Enter the monthly amount for invoice ${inv.number || inv.id}.`);
    const startDate = p.startDate || inv.dueDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "")) throw new Error(`Enter a start date for invoice ${inv.number || inv.id}.`);
    plans.push({ invoiceId: inv.id, invoiceNumber: inv.number || "", total: Number(inv.total || 0), monthlyAmount: monthly, startDate });
  }

  let current = {
    ...client,
    legacyPayments: client.legacyPayments || client.payments || [],
    payments: [],
    invoiceRoles: { ...roles },
    plans,
    installmentSchedule: client.installmentSchedule && client.installmentSchedule.length
      ? client.installmentSchedule
      : scheduleForPlan(plans[0]),
  };

  const stats = { imported: 0, reversedPairs: 0, held: 0, ignored: 0, review: 0 };
  const ledger = [], allocations = [], reviews = [];

  const success = payments.filter((p) => p.status === "success" && Number(p.amount) !== 0);
  stats.ignored += payments.length - success.length;
  const { kept, reversedPairs, unmatched, cancelledIds } = netReversals(success);
  stats.reversedPairs = reversedPairs;
  const handled = cancelledIds.map((id) => ({ id, reason: "reversed_pair", clientId: client.id }));
  for (const n of unmatched) { reviews.push({ payment: n, reason: "refund_or_reversal" }); stats.review++; }

  const ordered = kept.slice().sort((a, b) =>
    String(a.payment_date).localeCompare(String(b.payment_date)) || String(a.id).localeCompare(String(b.id)));

  for (const p of ordered) {
    if (!roles[String(p.invoice_id)]) { stats.held++; continue; } // waits for billing's tag
    const map = new Map([[String(p.case_id), [current]]]);
    const decision = classifyPayment(p, map);
    if (decision.action === "ignore") { stats.ignored++; continue; }
    if (decision.action === "review") { reviews.push({ payment: p, reason: decision.reason }); stats.review++; continue; }
    const plan = computeImport(current, p, now, { kind: decision.kind });
    if (plan.skip) { reviews.push({ payment: p, reason: plan.skip }); stats.review++; continue; }
    current = { ...current, payments: [...current.payments, plan.clientPayment], ...plan.clientUpdates };
    ledger.push({ id: plan.ledgerId, doc: plan.ledgerDoc });
    plan.allocationRows.forEach((row, i) => allocations.push({ id: `${plan.ledgerId}_${i}`, doc: row }));
    stats.imported++;
  }

  const untagged = invoices.filter((i) => i.status !== "draft" && !roles[i.id]).map((i) => i.id);
  current.rebuild = {
    status: untagged.length ? "needs_tagging" : "rebuilt",
    untaggedInvoices: untagged,
    at: now.toISOString(),
    legacyTotal: (current.legacyPayments || []).reduce((s, p) => s + Number(p.amount || 0), 0),
    mycaseTotal: current.payments.reduce((s, p) => s + Number(p.amount || 0), 0),
    ...stats,
  };
  // Never let history clear today's promise: keep it exactly as it was.
  current.paymentPromise = client.paymentPromise ?? null;
  // The fee was entered including the separately billed $150 consultation (see autoTag):
  // the plan total drops by that amount; the original is kept for audit.
  if (invoiceTotalAdjustment && !client.rebuild?.invoiceTotalAdjusted) {
    const from = Number(client.invoiceTotal || 0);
    current.invoiceTotal = from + Number(invoiceTotalAdjustment);
    current.rebuild.invoiceTotalAdjusted = {
      from, to: current.invoiceTotal, reason: "consultation fee billed as a separate MyCase invoice",
    };
  }
  return { client: current, ledger, allocations, reviews, handled, stats };
}

module.exports = { rebuildClient, netReversals, currentMonthly };
