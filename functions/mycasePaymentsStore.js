// functions/mycasePaymentsStore.js
// Firestore-backed store for runImport() / runAll(), plus the Case Setup and review actions.

const { computeImport, caseIdFromLink, classifyPayment, planReversal, replayAllocations } = require("./mycasePayments");
const { toMirrorDoc, caseFlags, buildSetupClient, buildIntakeClient, caseTypeFromMyCase, uninvoicedFee, ROLES } = require("./mycaseSync");
const { plansWithNewInvoice, firstPlanFields } = require("./plans");

const REVIEW_COLLECTION = "mycasePaymentReview";
// MyCase payments already dealt with outside the ledger (e.g. both halves of a bounced
// e-check cancelled by the rebuild). The hourly sync skips them.
const HANDLED = "mycaseHandled";
const MIRROR = { cases: "mycaseCases", invoices: "mycaseInvoices", payments: "mycasePayments" };
// The payments cursor predates the mirror; keep its document so a deployed importer resumes.
const cursorDoc = (kind = "payments") =>
  kind === "payments" ? "integrations/mycasePayments" : `integrations/mycase_${kind}`;
const BATCH = 400;

async function inChunks(list, size, fn) {
  for (let i = 0; i < list.length; i += size) await fn(list.slice(i, i + size));
}

function createFirestoreStore(db) {
  const store = {
    async getCursor(kind) {
      const snap = await db.doc(cursorDoc(kind)).get();
      return snap.exists ? snap.data().cursor || null : null;
    },

    async saveCursor(cursor, kind) {
      await db.doc(cursorDoc(kind)).set({ cursor, updatedAt: new Date().toISOString() }, { merge: true });
    },

    /** Upsert feed rows. merge keeps the computed fields on mycaseCases. */
    async upsertMirror(kind, rows) {
      const col = db.collection(MIRROR[kind]);
      const syncedAt = new Date().toISOString();
      await inChunks(rows, BATCH, async (chunk) => {
        const batch = db.batch();
        for (const r of chunk) batch.set(col.doc(String(r.id)), { ...toMirrorDoc(kind, r), syncedAt }, { merge: true });
        await batch.commit();
      });
    },

    /** Map of MyCase case ID -> clients whose myCaseLink points at that case. */
    async loadClientsByCaseId() {
      const map = new Map();
      const snap = await db.collection("clients").get();
      snap.forEach((d) => {
        const data = d.data();
        // A duplicate billing set aside on "Link problems" is never matched to its case.
        if (data.mycaseExcluded) return;
        const caseId = data.mycaseCaseId || caseIdFromLink(data.myCaseLink);
        if (!caseId) return;
        if (!map.has(caseId)) map.set(caseId, []);
        map.get(caseId).push({ id: d.id, ...data });
      });
      return map;
    },

    /** Recompute openBalance / needsSetup / trackedClientId. Returns how many need setup. */
    async refreshCases(caseIds, clientsByCaseId) {
      if (!caseIds.length) return 0;
      const invByCase = new Map();
      const push = (inv) => {
        if (!invByCase.has(inv.caseId)) invByCase.set(inv.caseId, []);
        invByCase.get(inv.caseId).push(inv);
      };
      // Payments too, for each case's last payment date (Case Setup filters on it). A
      // payment changes its invoice's paid amount, so a paid case is always touched here.
      const payByCase = new Map();
      const pushPay = (p) => {
        if (!payByCase.has(p.caseId)) payByCase.set(p.caseId, []);
        payByCase.get(p.caseId).push(p);
      };
      if (caseIds.length > 300) {
        // First run or a large catch-up: one scan beats thousands of small queries.
        (await db.collection(MIRROR.invoices).get()).forEach((d) => push(d.data()));
        (await db.collection(MIRROR.payments).select("caseId", "date", "status", "amount").get()).forEach((d) => pushPay(d.data()));
      } else {
        await inChunks(caseIds, 30, async (ids) => {
          (await db.collection(MIRROR.invoices).where("caseId", "in", ids).get()).forEach((d) => push(d.data()));
          (await db.collection(MIRROR.payments).where("caseId", "in", ids).select("caseId", "date", "status", "amount").get())
            .forEach((d) => pushPay(d.data()));
        });
      }
      let flagged = 0;
      await inChunks(caseIds, BATCH, async (ids) => {
        const refs = ids.map((id) => db.collection(MIRROR.cases).doc(id));
        const snaps = await db.getAll(...refs);
        const batch = db.batch();
        snaps.forEach((s) => {
          if (!s.exists) return; // invoice for a case the cases feed has not delivered yet
          const tracked = clientsByCaseId.get(s.id) || [];
          const flags = caseFlags(s.data(), invByCase.get(s.id) || [], tracked, payByCase.get(s.id) || []);
          if (flags.needsSetup) flagged++;
          batch.set(s.ref, flags, { merge: true });
          // Records created from MyCase follow MyCase: case type (practice area) and, while
          // no plan is set, the flat fee as the total.
          const only = tracked.length === 1 ? tracked[0] : null;
          if (only && only.source === "mycase") {
            const upd = {};
            const type = caseTypeFromMyCase(s.data().practiceArea);
            if (type && type !== only.caseType) upd.caseType = type;
            const fee = Number(s.data().flatFee || 0);
            if (only.awaitingPlan && fee > Number(only.invoiceTotal || 0)) {
              upd.invoiceTotal = Math.max(fee, Number(only.initialPaymentAmount || 0));
              upd.mycaseFlatFee = fee;
            }
            if (Object.keys(upd).length) batch.update(db.collection("clients").doc(only.id), upd);
          }
        });
        await batch.commit();
      });
      return flagged;
    },

    /** Close (or reopen) clients to match their case's status in MyCase. */
    async syncCaseClosures(caseIds, opts = {}) {
      const { syncCaseClosures } = require("./caseClosures");
      return syncCaseClosures(db, { caseIds, clientsByCaseId: await store.loadClientsByCaseId(), ...opts });
    },

    /** Rebuild the "Link problems" list (unlinked records, several records on one case). */
    async refreshLinkIssues() {
      const { refreshLinkIssues } = require("./linkIssues");
      return refreshLinkIssues(db, await store.loadClientsByCaseId());
    },

    /** Create the client for every new intake case flagged autoCreate. Returns how many. */
    async autoCreatePending() {
      const snap = await db.collection(MIRROR.cases).where("autoCreate", "==", true).get();
      if (snap.empty) return 0;
      const byCase = await store.loadClientsByCaseId();
      let created = 0;
      for (const d of snap.docs) {
        const r = await createIntakeClient(db, d.id, byCase);
        if (r.created) created++;
      }
      return created;
    },

    /** Ids (of the given ones) recorded in mycaseHandled. */
    async handledIds(ids) {
      const found = new Set();
      await inChunks(ids.map(String), 300, async (chunk) => {
        const snaps = await db.getAll(...chunk.map((id) => db.collection(HANDLED).doc(id)));
        snaps.forEach((s) => { if (s.exists) found.add(s.id); });
      });
      return found;
    },

    async importPayment(client, payment, opts = {}) {
      const ledgerRef = db.collection("payments").doc(`mycase_${payment.id}`);
      const clientRef = db.collection("clients").doc(client.id);

      return db.runTransaction(async (tx) => {
        const [ledgerSnap, clientSnap] = await Promise.all([tx.get(ledgerRef), tx.get(clientRef)]);
        if (ledgerSnap.exists) return "exists";
        if (!clientSnap.exists) return "no_matching_client";

        // Use the freshest client doc: payments recorded since the clients scan must
        // be reflected in duplicate detection and allocation.
        const fresh = { id: clientSnap.id, ...clientSnap.data() };
        const plan = computeImport(fresh, payment, new Date(), opts);
        if (plan.skip) return plan.skip;

        tx.set(ledgerRef, plan.ledgerDoc);
        const updates = { payments: [...(fresh.payments || []), plan.clientPayment], ...plan.clientUpdates };
        if (plan.clearPromise) updates.paymentPromise = null;
        tx.update(clientRef, updates);

        // Deterministic ids keep allocation rows idempotent too.
        plan.allocationRows.forEach((row, i) => {
          tx.set(db.collection("paymentAllocations").doc(`${plan.ledgerId}_${i}`), row);
        });
        return "imported";
      });
    },

    /**
     * A refund / void / bounced payment from MyCase: remove the counted payment it
     * reverses, delete its ledger row, recompute this client's MyCase allocation rows, and
     * record both ids as handled. Returns "cancelled" or "no_match" (caller sends to review).
     */
    async reversePayment(client, reversal) {
      const clientRef = db.collection("clients").doc(client.id);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(clientRef);
        if (!snap.exists) return "no_match";
        const fresh = { id: snap.id, ...snap.data() };
        const target = planReversal(fresh, reversal);
        if (!target) return "no_match";
        const allocSnap = await tx.get(db.collection("paymentAllocations").where("clientId", "==", client.id));

        const cancelled = fresh.payments[target.index];
        const remaining = fresh.payments.filter((_, i) => i !== target.index);
        const rows = replayAllocations({ ...fresh, payments: remaining });
        const keep = new Set(rows.map((r) => r.id));
        // Only MyCase rows are rebuilt; hand-entered allocation rows are left alone.
        allocSnap.forEach((d) => { if (d.id.startsWith("mycase_") && !keep.has(d.id)) tx.delete(d.ref); });
        rows.forEach((r) => tx.set(db.collection("paymentAllocations").doc(r.id), r.doc));
        tx.delete(db.collection("payments").doc(target.ledgerId));

        const at = new Date().toISOString();
        tx.update(clientRef, {
          payments: remaining,
          reversalsApplied: [...(fresh.reversalsApplied || []), {
            reversalId: String(reversal.id), cancelledPaymentId: target.ledgerId,
            amount: Number(cancelled.amount), paymentDate: cancelled.date,
            reversalDate: reversal.payment_date || null, type: reversal.transaction_type || null, at,
          }],
        });
        const originalId = target.ledgerId.replace(/^mycase_/, "");
        for (const id of [originalId, String(reversal.id)]) {
          tx.set(db.collection(HANDLED).doc(id), { reason: "reversed_pair", clientId: client.id, pair: [originalId, String(reversal.id)], at });
        }
        return "cancelled";
      });
    },

    /** Create-only: a resolved review item must not be reopened by the next run. */
    async addReview(payment, reason) {
      const ref = db.collection(REVIEW_COLLECTION).doc(`${payment.id}_${reason}`);
      try {
        await ref.create({
          status: "open",
          reason,
          paymentId: String(payment.id),
          caseId: payment.case_id ? String(payment.case_id) : null,
          invoiceId: payment.invoice_id ? String(payment.invoice_id) : null,
          mycaseClientName: payment.client_name || null,
          amount: Number(payment.amount),
          paymentDate: payment.payment_date || null,
          transactionType: payment.transaction_type || null,
          invoiceNumber: payment.invoice_number || null,
          raw: payment,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        if (err && (err.code === 6 || /ALREADY_EXISTS/.test(String(err.message)))) return;
        throw err;
      }
    },
  };
  return store;
}

/* ------------------------------- Case Setup ------------------------------- */

/** Import a case's mirrored payment history (oldest first) onto one client. */
async function importCaseHistory(db, store, client, payments) {
  const result = { imported: 0, ignored: 0, review: 0 };
  const history = payments
    .filter((p) => p.feed)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  const byCase = new Map([[String(client.mycaseCaseId), [client]]]);
  for (const p of history) {
    const decision = classifyPayment(p.feed, byCase);
    if (decision.action === "ignore") { result.ignored++; continue; }
    if (decision.action === "review") { await store.addReview(p.feed, decision.reason); result.review++; continue; }
    if (decision.action === "reverse") {
      // History is processed in date order, so the payment being reversed is already in.
      const r = await store.reversePayment(client, p.feed);
      if (r === "cancelled") result.reversed = (result.reversed || 0) + 1;
      else { await store.addReview(p.feed, "refund_or_reversal"); result.review++; }
      continue;
    }
    const outcome = await store.importPayment(client, p.feed, { kind: decision.kind });
    if (outcome === "imported" || outcome === "exists") result.imported++;
    else { await store.addReview(p.feed, outcome); result.review++; }
  }
  return result;
}

async function caseData(db, caseId) {
  const [inv, pay] = await Promise.all([
    db.collection(MIRROR.invoices).where("caseId", "==", String(caseId)).get(),
    db.collection(MIRROR.payments).where("caseId", "==", String(caseId)).get(),
  ]);
  return { invoices: inv.docs.map((d) => d.data()), payments: pay.docs.map((d) => d.data()) };
}

/**
 * A new intake case: create its client (initial payment only, no plan yet) and import the
 * payments made so far. The record id is fixed per case (mycase_<caseId>), so two runs can
 * never create it twice.
 */
async function createIntakeClient(db, caseId, clientsByCaseId) {
  const store = createFirestoreStore(db);
  const caseRef = db.collection(MIRROR.cases).doc(String(caseId));
  const caseSnap = await caseRef.get();
  if (!caseSnap.exists) return { created: false, reason: "no_case" };
  const tracked = (clientsByCaseId || await store.loadClientsByCaseId()).get(String(caseId)) || [];
  if (tracked.length) {
    await caseRef.set({ autoCreate: false }, { merge: true });
    return { created: false, reason: "already_tracked" };
  }
  const { invoices, payments } = await caseData(db, caseId);
  const clientDoc = buildIntakeClient({ caseDoc: caseSnap.data(), invoices, payments });
  const clientRef = db.collection("clients").doc(`mycase_${caseId}`);
  try {
    await clientRef.create(clientDoc);
  } catch (err) {
    if (err && (err.code === 6 || /ALREADY_EXISTS/.test(String(err.message)))) {
      await caseRef.set({ autoCreate: false }, { merge: true });
      return { created: false, reason: "already_created" };
    }
    throw err;
  }
  await caseRef.set({ trackedClientId: clientRef.id, autoCreate: false, needsSetup: false, needsPlan: true }, { merge: true });
  const result = await importCaseHistory(db, store, { id: clientRef.id, ...clientDoc }, payments);
  return { created: true, clientId: clientRef.id, ...result };
}

/**
 * "Paid in full, no plan needed" on Case Setup's "Waiting for a plan" tab: a client from
 * intake whose fee was billed (and usually paid) in one invoice never gets an installment
 * plan. The record stays as it is (initial payment = the invoice); it just leaves the list.
 * If billing later adds an installment invoice, it can still become the first plan.
 */
async function markNoPlanNeeded(db, { caseId, by }) {
  const caseRef = db.collection(MIRROR.cases).doc(String(caseId));
  const caseSnap = await caseRef.get();
  if (!caseSnap.exists) throw new Error("Case not found in the MyCase mirror.");
  const tracked = (await createFirestoreStore(db).loadClientsByCaseId()).get(String(caseId)) || [];
  if (tracked.length !== 1 || !tracked[0].awaitingPlan) throw new Error("This case is not waiting for a plan.");
  const client = tracked[0];
  const invoices = (await db.collection(MIRROR.invoices).where("caseId", "==", String(caseId)).get()).docs.map((d) => d.data());
  const left = uninvoicedFee(caseSnap.data(), invoices);
  if (left > 0) {
    throw new Error(`MyCase's flat fee is $${Number(caseSnap.data().flatFee).toLocaleString()} and $${left.toLocaleString()} of it is not invoiced yet. Add a plan once billing creates the monthly invoice.`);
  }
  const at = new Date().toISOString();
  await db.collection("clients").doc(client.id).update({
    awaitingPlan: false,
    noPlanNeeded: true,
    invoiceUpdatedAt: at,
    invoiceUpdatedBy: by || "Case Setup",
  });
  await caseRef.set({ needsPlan: false }, { merge: true });
  return { clientId: client.id };
}

/** Retry every open review item of a case (after its invoices were tagged). */
async function retryCaseReviews(db, caseId) {
  const open = (await db.collection(REVIEW_COLLECTION).where("caseId", "==", String(caseId)).where("status", "==", "open").get()).docs
    .sort((a, b) => String(a.data().paymentDate).localeCompare(String(b.data().paymentDate)));
  let resolved = 0;
  for (const d of open) if ((await retryReviewItem(db, d.id)).status === "resolved") resolved++;
  return resolved;
}

/**
 * Billing's "Save" on Case Setup. For a new MyCase case it creates the client record; for
 * a client created from intake that is waiting for its plan, it adds the plan to that
 * record. Either way the case's payment history is imported under the invoice tags.
 */
async function setupCase(db, { caseId, roles, plans, by }) {
  const store = createFirestoreStore(db);
  const caseRef = db.collection(MIRROR.cases).doc(String(caseId));
  const caseSnap = await caseRef.get();
  if (!caseSnap.exists) throw new Error("Case not found in the MyCase mirror.");
  const tracked = (await store.loadClientsByCaseId()).get(String(caseId)) || [];
  const waiting = tracked.length === 1 && tracked[0].awaitingPlan ? tracked[0] : null;
  if (tracked.length && !waiting) throw new Error("This case already has a Collections record.");

  const { invoices, payments } = await caseData(db, caseId);
  const built = buildSetupClient({ caseDoc: caseSnap.data(), invoices, roles, plans, payments, by });

  let client;
  if (waiting) {
    // Keep the record and the payments already counted; add the plan and the tags.
    // eslint-disable-next-line no-unused-vars
    const { firstName, lastName, mycaseClientNames, payments: _p, createdAt, ...planFields } = built;
    await db.collection("clients").doc(waiting.id).update(planFields);
    client = { ...waiting, ...planFields };
  } else {
    const clientRef = await db.collection("clients").add(built);
    client = { id: clientRef.id, ...built };
  }
  await caseRef.set({ trackedClientId: client.id, needsSetup: false, needsPlan: false, autoCreate: false }, { merge: true });

  const result = { clientId: client.id, ...(await importCaseHistory(db, store, client, payments)) };
  // Payments held while the new invoice was untagged are counted now: close their items.
  if (waiting) result.reviewsSettled = await retryCaseReviews(db, caseId);
  return result;
}

/* --------------------------- tag & rebuild (existing) --------------------------- */

const REBUILD_DATABASE = "mycase-rebuild";

/**
 * Rebuilding deletes a client's hand-entered ledger rows in the database it runs in.
 * That must only ever happen in the separate rebuild database, never in the original
 * one. The local emulator (FIRESTORE_EMULATOR_HOST) is the only exception, for tests.
 */
function assertRebuildDatabase(db) {
  const id = db.databaseId || "(default)";
  if (id === REBUILD_DATABASE) return;
  if (process.env.FIRESTORE_EMULATOR_HOST) return;
  throw new Error(`Rebuilding is only allowed in the "${REBUILD_DATABASE}" database (this is "${id}").`);
}

/** Replace one client's payments, ledger and allocations with a rebuildClient() result. */
async function writeRebuild(db, clientId, result) {
  assertRebuildDatabase(db);
  const store = createFirestoreStore(db);
  const refsToDelete = [];
  for (const col of ["payments", "paymentAllocations"]) {
    (await db.collection(col).where("clientId", "==", clientId).get()).forEach((d) => refsToDelete.push(d.ref));
  }
  const writes = [
    ...refsToDelete.map((ref) => ({ kind: "delete", ref })),
    ...result.ledger.map((l) => ({ kind: "set", ref: db.collection("payments").doc(l.id), data: l.doc })),
    ...result.allocations.map((a) => ({ kind: "set", ref: db.collection("paymentAllocations").doc(a.id), data: a.doc })),
    ...(result.handled || []).map((h) => ({
      kind: "set", ref: db.collection(HANDLED).doc(h.id),
      data: { reason: h.reason, clientId: h.clientId, at: new Date().toISOString() },
    })),
  ];
  // Deletes are queued before sets, and sets reuse deterministic ids, so a row that is
  // both deleted and rewritten ends up written.
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 400)) {
      if (w.kind === "delete") batch.delete(w.ref);
      else batch.set(w.ref, w.data);
    }
    await batch.commit();
  }
  const { id, ...doc } = result.client;
  await db.collection("clients").doc(clientId).set(doc);
  for (const r of result.reviews) await store.addReview(r.payment, r.reason);
}

/**
 * Billing tags every invoice of an EXISTING client's case (and enters the amount for any
 * extra installment plan); the client's payment history is rebuilt from the MyCase mirror.
 */
async function retagCase(db, { caseId, roles, plans, by }) {
  assertRebuildDatabase(db);
  const { rebuildClient } = require("./rebuildClient");
  const caseRef = db.collection(MIRROR.cases).doc(String(caseId));
  const caseSnap = await caseRef.get();
  if (!caseSnap.exists) throw new Error("Case not found in the MyCase mirror.");
  const clientId = caseSnap.data().trackedClientId;
  if (!clientId || clientId === "multiple") throw new Error("This case is not linked to exactly one client.");
  const clientSnap = await db.collection("clients").doc(clientId).get();
  if (!clientSnap.exists) throw new Error("Client record not found.");

  const invoices = (await db.collection(MIRROR.invoices).where("caseId", "==", String(caseId)).get()).docs.map((d) => d.data());
  const payments = (await db.collection(MIRROR.payments).where("caseId", "==", String(caseId)).get()).docs
    .map((d) => d.data().feed).filter(Boolean);

  const cleanRoles = {};
  for (const inv of invoices.filter((i) => i.status !== "draft")) {
    const role = roles && roles[inv.id];
    if (!ROLES.includes(role)) throw new Error(`Choose a type for invoice ${inv.number || inv.id}.`);
    cleanRoles[inv.id] = role;
  }

  const result = rebuildClient({
    client: { id: clientId, ...clientSnap.data(), mycaseCaseId: String(caseId) },
    roles: cleanRoles, invoices, payments, extraPlans: plans || [],
  });
  result.client.invoiceUpdatedAt = new Date().toISOString();
  result.client.invoiceUpdatedBy = by || "Tagging";
  await writeRebuild(db, clientId, result);
  await caseRef.set({ needsTagging: false }, { merge: true });
  return { clientId, ...result.stats };
}

/* ------------------------------ review actions ------------------------------ */

/**
 * Re-run one review item, e.g. after someone fixed the client's myCaseLink.
 * Returns { status: "resolved" | "open", detail }.
 */
async function retryReviewItem(db, reviewId) {
  const ref = db.collection(REVIEW_COLLECTION).doc(reviewId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Review item not found");
  const item = snap.data();
  if (item.status !== "open") return { status: item.status, detail: "already_handled" };

  const store = createFirestoreStore(db);
  const decision = classifyPayment(item.raw, await store.loadClientsByCaseId());
  if (decision.action === "ignore") {
    // e.g. the invoice was tagged "other": nothing to import, so the item is done.
    await ref.update({ status: "resolved", resolution: `not_counted_${decision.reason}`, resolvedAt: new Date().toISOString() });
    return { status: "resolved", detail: decision.reason };
  }
  if (decision.action === "reverse") {
    const r = await store.reversePayment(decision.client, item.raw);
    if (r !== "cancelled") return { status: "open", detail: "no_matching_payment_to_reverse" };
    await ref.update({ status: "resolved", resolution: "reversal_applied", resolvedAt: new Date().toISOString() });
    return { status: "resolved", detail: "reversal_applied" };
  }
  if (decision.action !== "import") {
    return { status: "open", detail: decision.reason || decision.action };
  }
  const outcome = await store.importPayment(decision.client, item.raw, { kind: decision.kind });
  if (outcome === "imported" || outcome === "exists") {
    await ref.update({
      status: "resolved",
      resolution: outcome === "imported" ? "imported_on_retry" : "already_in_ledger",
      resolvedAt: new Date().toISOString(),
    });
    return { status: "resolved", detail: outcome };
  }
  return { status: "open", detail: outcome };
}

/** Tag the invoice behind an "untagged_invoice" item on its client, then retry it. */
async function tagReviewItem(db, reviewId, role, byEmail, plan) {
  if (!ROLES.includes(role)) throw new Error("Unknown invoice type.");
  const snap = await db.collection(REVIEW_COLLECTION).doc(reviewId).get();
  if (!snap.exists) throw new Error("Review item not found");
  const item = snap.data();
  const invoiceId = item.invoiceId || (item.raw && item.raw.invoice_id);
  if (!invoiceId) throw new Error("This payment has no invoice to tag.");
  const clients = (await createFirestoreStore(db).loadClientsByCaseId()).get(String(item.caseId)) || [];
  if (clients.length !== 1) throw new Error("Could not find exactly one client for this case.");
  const client = clients[0];

  const updates = {
    [`invoiceRoles.${invoiceId}`]: role,
    invoiceUpdatedAt: new Date().toISOString(),
    invoiceUpdatedBy: byEmail || "Review",
  };
  if (role === "installment") {
    // A new installment invoice is its own plan, with its own monthly amount and start,
    // so its payments count toward it and not toward the existing plan.
    const invSnap = await db.collection(MIRROR.invoices).doc(String(invoiceId)).get();
    if (!invSnap.exists) throw new Error("This invoice is not in the MyCase mirror yet; try again after the next sync.");
    updates.plans = plansWithNewInvoice(client, invSnap.data(), plan || {});
    if (updates.plans.length === 1) Object.assign(updates, firstPlanFields(client, updates.plans[0]));
  }
  await db.collection("clients").doc(client.id).update(updates);
  if (updates.awaitingPlan === false) {
    await db.collection(MIRROR.cases).doc(String(item.caseId)).set({ needsPlan: false }, { merge: true });
  }

  // Every payment on this invoice was held as its own review item: settle them all now,
  // oldest first, not just the one that was clicked.
  const siblings = (await db.collection(REVIEW_COLLECTION)
    .where("invoiceId", "==", String(invoiceId)).where("status", "==", "open").get()).docs
    .filter((d) => d.data().reason === "untagged_invoice" && String(d.data().caseId) === String(item.caseId))
    .sort((a, b) => String(a.data().paymentDate).localeCompare(String(b.data().paymentDate)));
  let resolved = 0;
  let clicked = { status: "open", detail: "untagged_invoice" };
  for (const d of siblings) {
    const r = await retryReviewItem(db, d.id);
    if (r.status === "resolved") resolved++;
    if (d.id === reviewId) clicked = r;
  }
  if (!siblings.some((d) => d.id === reviewId)) clicked = await retryReviewItem(db, reviewId);
  return { ...clicked, paymentsSettled: resolved };
}

async function dismissReviewItem(db, reviewId, byEmail) {
  await db.collection(REVIEW_COLLECTION).doc(reviewId).update({
    status: "dismissed",
    resolvedAt: new Date().toISOString(),
    resolvedBy: byEmail || null,
  });
}

module.exports = {
  createFirestoreStore, setupCase, createIntakeClient, markNoPlanNeeded, retryReviewItem, tagReviewItem, dismissReviewItem,
  retagCase, writeRebuild, assertRebuildDatabase, REBUILD_DATABASE,
};
