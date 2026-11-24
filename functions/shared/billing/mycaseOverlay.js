// GENERATED from src/billing/mycaseOverlay.js by scripts/build-shared.js. Do not edit here.
"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/billing/mycaseOverlay.js
// MyCase is the source of truth for payments. Clients rebuilt from MyCase already hold
// MyCase payments. Hand-entered clients (no MyCase invoice tags) hold what the team typed;
// for them the billing math uses the payments MyCase received on their case instead
// (decided 2026-11-23: typed payments are less accurate). Nothing is written: the sync
// stores the MyCase list on the client as `mycaseReceived` (functions/mycasePaymentsStore.js
// refreshMyCaseReceived), and the typed payments stay in the record, just not counted.
// A hand-entered client with no MyCase case link (or no stored list yet) keeps its typed
// payments until the link is fixed (Case Setup → Link problems).

 const isHandEntered = (c) => !(c.invoiceRoles && Object.keys(c.invoiceRoles).length) && c.source !== "mycase"; exports.isHandEntered = isHandEntered;

 function caseIdOf(c) {
  if (c.mycaseCaseId) return String(c.mycaseCaseId);
  const m = String(c.myCaseLink || "").match(/court_cases\/(\d+)/);
  return m ? m[1] : null;
} exports.caseIdOf = caseIdOf;

/** A MyCase mirror payment that is real money received (no failures, refunds, reversals). */
 const isReceived = (p) => p && p.status === "success" && Number(p.amount) > 0 && !/credit|refund|reject|reversal|chargeback/i.test(String(p.type || "")); exports.isReceived = isReceived;

/**
 * The MyCase payments that count for a hand-entered client, in the app's payment shape,
 * or null when typed payments still apply (not hand-entered, no case link, no list yet).
 * `liveThisMonth`: this month's mirror rows for the case, for payments the sync has not
 * stored on the client yet. Invoice role "other" (the $150 consultation) is left out;
 * "initial" (intake's IP invoice) pays the initial payment.
 */
 function mycasePaymentsOf(client, liveThisMonth = []) {
  if (!client || client.mycaseExcluded || !exports.isHandEntered.call(void 0, client) || !caseIdOf(client) || !Array.isArray(client.mycaseReceived)) return null;
  const stored = client.mycaseReceived;
  const ids = new Set(stored.map((p) => String(p.id)));
  const extra = (liveThisMonth || []).filter((p) => !ids.has(String(p.id)) && exports.isReceived.call(void 0, p));
  return [...stored, ...extra]
    .filter((p) => p.role !== "other" && Number(p.amount) > 0 && p.date)
    .map((p) => ({
      amount: Number(p.amount),
      date: String(p.date).slice(0, 10),
      paymentId: `mycase_${p.id}`,
      source: "mycase",
      recordedBy: "MyCase",
      invoiceId: p.invoiceId || null,
      ...(p.role === "initial" ? { kind: "initial" } : {}),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
} exports.mycasePaymentsOf = mycasePaymentsOf;

/**
 * The client as the billing math should see it. With MyCase payments: those replace the
 * typed ones (kept as `typedPayments`).
 */
 const billingView = (c) => (c && Array.isArray(c.mycasePayments) ? { ...c, payments: c.mycasePayments, typedPayments: c.typedPayments || c.payments || [] } : c); exports.billingView = billingView;

/** Shorthand: the billing view of a client straight from its document. */
 const withMyCasePayments = (c, liveThisMonth) => {
  const mc = mycasePaymentsOf(c, liveThisMonth);
  return mc ? exports.billingView.call(void 0, { ...c, mycasePayments: mc }) : c;
}; exports.withMyCasePayments = withMyCasePayments;
