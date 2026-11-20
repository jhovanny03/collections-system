// functions/mycasePayments.js
//
// Imports MyCase payments (served by the Azure MyCase-Integration service at
// GET /feed/payments) into the Collections app's Firestore ledger.
//
// Design rules:
//  - Idempotent: a MyCase payment always lands in payments/mycase_<id>, so re-running
//    or re-fetching a page can never double-count it.
//  - Never guess: payments that cannot be matched to exactly one client, that look
//    like refunds/reversals, or that duplicate a manual entry go to the
//    mycasePaymentReview collection for a person to resolve.
//  - Matching is on the MyCase case ID in the client's myCaseLink
//    (https://<firm>.mycase.com/court_cases/<caseId>).
//
// The allocation logic below is a port of buildAllocationRowsForNewPayment in
// src/ClientDashboard/RecordPayment.js. Keep the two in step until they are shared.

const { viewForInvoice } = require("./plans");

const FEED_SOURCE = "mycase";
const RECORDED_BY = "MyCase sync";

/* ----------------------------- small helpers ----------------------------- */

const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
// Formatting a month name builds a locale formatter each time, which dominated the
// cost of rebuilding thousands of clients; one formatter and a cache per month.
const MONTH_NAME = new Intl.DateTimeFormat("en-US", { month: "long" });
const labelCache = new Map();
const labelFor = (d) => {
  const key = ymKey(d);
  if (!labelCache.has(key)) labelCache.set(key, `${MONTH_NAME.format(d)} ${d.getFullYear()}`);
  return labelCache.get(key);
};
const toDate = (raw) =>
  raw && raw.seconds ? new Date(raw.seconds * 1000) : new Date(raw);

/** Case ID from a MyCase link, or null. Only the /court_cases/<digits> form counts. */
function caseIdFromLink(link) {
  if (typeof link !== "string") return null;
  const m = link.match(/\/court_cases\/(\d+)/);
  return m ? m[1] : null;
}

const NY_HOUR = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" });

/** Midnight America/New_York for a YYYY-MM-DD date (the app's business timezone). */
function etMidnight(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  let t = new Date(Date.UTC(y, m - 1, d, 5)); // 00:00 EST
  const hour = Number(NY_HOUR.format(t));
  if (hour !== 0) t = new Date(t.getTime() - hour * 3600000); // EDT: 01:00 -> 00:00
  return t;
}

const clientDisplayName = (c) =>
  `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name || "Unknown Client";

/* --------------------- allocation (port of RecordPayment) ---------------------- */

const getInstallmentAmountForDate = (date, schedule, fallbackAmount) => {
  for (const s of schedule) {
    if (date >= new Date(s.start) && date <= new Date(s.end)) return Number(s.amount);
  }
  return Number(fallbackAmount || 500);
};

const buildSkipSet = (client) =>
  new Set([...(client.skipMonths || []), ...(client.skippedMonths || [])].map(String));

function buildDueMonthBuckets(client) {
  const rawStart = client && client.firstInstallmentDate;
  if (!rawStart) return [];

  const invoiceBase = Number(
    client.invoiceBaseTotal != null ? client.invoiceBaseTotal : client.invoiceTotal || 0
  );
  const adjustments = Array.isArray(client.invoiceAdjustments) ? client.invoiceAdjustments : [];
  const adjToBalanceTotal = adjustments.reduce((sum, a) => {
    if (String((a && a.applyTo) || "balance").toLowerCase() !== "balance") return sum;
    const amt = Number((a && a.amount) || 0);
    const dp = Number((a && a.downPayment) || 0);
    return sum + Math.max(0, amt - Math.max(0, dp));
  }, 0);

  const invoiceEffective = Math.max(0, invoiceBase + adjToBalanceTotal);
  const collectibleCap = Math.max(0, invoiceEffective - Number(client.initialPaymentAmount || 0));
  if (collectibleCap <= 0) return [];

  const anchorDate = toDate(client.expectedAnchor || rawStart);
  if (!(anchorDate instanceof Date) || isNaN(anchorDate)) return [];

  const schedule = (client.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  const skipSet = buildSkipSet(client);

  const buckets = [];
  const cursor = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 15);
  let expectedAccum = 0;
  let guard = 0;
  while (expectedAccum < collectibleCap && guard < 120) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const key = ymKey(monthStart);
    if (!skipSet.has(key)) {
      const expected = getInstallmentAmountForDate(
        new Date(cursor.getFullYear(), cursor.getMonth(), 15),
        schedule,
        client.installmentAmount
      );
      if (expectedAccum + expected > collectibleCap) break;
      buckets.push({
        dueMonthKey: key,
        dueMonthLabel: labelFor(monthStart),
        expectedInstallmentAmount: Number(expected || 0),
        remaining: Number(expected || 0),
      });
      expectedAccum += Number(expected || 0);
    }
    cursor.setMonth(cursor.getMonth() + 1);
    guard++;
  }
  return buckets;
}

function applyPriorPaymentsToBuckets(client, buckets) {
  const initialPaymentDate = client.initialPaymentDate ? new Date(client.initialPaymentDate) : null;
  const prior = (client.payments || [])
    .filter((p) => {
      const d = new Date(p.date);
      if (isNaN(d)) return false;
      return !initialPaymentDate || d > initialPaymentDate;
    })
    .map((p) => ({ amount: Number(p.amount || 0), date: p.date }))
    .filter((p) => p.amount > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  for (const p of prior) {
    let remaining = p.amount;
    for (const bucket of buckets) {
      if (remaining <= 0) break;
      if (bucket.remaining <= 0) continue;
      const used = Math.min(bucket.remaining, remaining);
      bucket.remaining -= used;
      remaining -= used;
    }
  }
}

function buildAllocationRows({ client, paymentId, paymentDate, amount, createdAt }) {
  const buckets = buildDueMonthBuckets(client);
  if (!buckets.length) return [];
  applyPriorPaymentsToBuckets(client, buckets);

  let remainingNew = Number(amount || 0);
  const rows = [];
  for (const bucket of buckets) {
    if (remainingNew <= 0) break;
    if (bucket.remaining <= 0) continue;
    const applied = Math.min(bucket.remaining, remainingNew);
    const remainingForMonth = Math.max(0, bucket.remaining - applied);
    rows.push({
      clientId: client.id || "",
      clientName: clientDisplayName(client),
      caseTitle: client.caseTitle || "",
      paymentId,
      paymentDate,
      paymentDateTs: etMidnight(paymentDate),
      dueMonthKey: bucket.dueMonthKey,
      dueMonthLabel: bucket.dueMonthLabel,
      appliedAmount: applied,
      expectedInstallmentAmount: bucket.expectedInstallmentAmount,
      remainingForMonth,
      allocationStatus: remainingForMonth <= 0 ? "paid" : "partial",
      recordedBy: RECORDED_BY,
      caseType: client.caseType || "",
      caseStatus: client.caseStatus || "",
      source: FEED_SOURCE,
      createdAt,
    });
    bucket.remaining = remainingForMonth;
    remainingNew -= applied;
  }
  return rows;
}

/* ------------------------------ classification ------------------------------ */

// Same rule as the rebuild: in this firm's MyCase data every reversal (CREDIT, VOID,
// Rejection) has a negative amount; exact type names are a backstop. Never a substring
// match: "Credit Card" is a normal payment type.
const REVERSAL_TYPES = new Set(["void", "rejection", "refund", "reversal", "chargeback", "nsf"]);
const isReversal = (payment) =>
  Number(payment.amount) < 0 || REVERSAL_TYPES.has(String(payment.transaction_type || "").trim().toLowerCase());

/**
 * Decide what to do with one feed payment, without touching storage.
 * Returns { action: "ignore" | "review" | "import" | "reverse", reason?, client?, kind? }.
 * "reverse": a refund/void/bounce on a counted invoice; the store cancels the payment
 * it reverses (or sends it to review when none matches).
 */
function classifyPayment(payment, clientsByCaseId) {
  // Only money actually received counts; pending/failed/etc. are ignored and will be
  // picked up again if MyCase later flips them to success (updated_at moves).
  if (payment.status !== "success") return { action: "ignore", reason: "not_success" };

  const amount = Number(payment.amount);
  if (!Number.isFinite(amount) || amount === 0) return { action: "ignore", reason: "zero_amount" };

  // A case nobody tracks yet is not an error: its payments stay in the mirror and are
  // imported when billing sets the case up (Case Setup page).
  const matches = payment.case_id ? clientsByCaseId.get(String(payment.case_id)) || [] : [];
  if (matches.length === 0) return { action: "ignore", reason: "case_not_tracked" };
  if (matches.length > 1) return { action: "review", reason: "multiple_matching_clients" };
  const client = matches[0];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payment.payment_date || "")) {
    return { action: "review", reason: "invalid_date" };
  }

  // Only clients whose invoices billing has tagged (Case Setup or the MyCase rebuild)
  // receive MyCase payments. A hand-entered client without tags already has its history
  // typed in, so importing MyCase on top would count every payment twice.
  const roles = client.invoiceRoles;
  if (!roles || !Object.keys(roles).length) return { action: "ignore", reason: "client_not_rebuilt" };

  // Initial and installment invoices feed the plan; "other" (consultation fee,
  // removal defense, ...) is shown from the mirror but never counted.
  const role = roles[String(payment.invoice_id)];
  if (!role) {
    // A case still waiting for billing's tags: hold quietly, it is rebuilt once tagged.
    if (client.rebuild && client.rebuild.status === "needs_tagging") return { action: "ignore", reason: "awaiting_tagging" };
    return { action: "review", reason: "untagged_invoice", client };
  }
  // A refund of a payment that was never counted (consultation fee, ...) changes nothing.
  if (role === "other") return { action: "ignore", reason: "other_invoice" };
  const kind = role === "initial" ? "initial" : "installment";
  if (isReversal(payment)) return { action: "reverse", client, kind };
  return { action: "import", client, kind };
}

/**
 * Given the latest client doc, compute everything that would be written for a payment.
 * Returns { skip: "possible_duplicate" } when a manual entry already covers it.
 */
function computeImport(client, payment, now = new Date(), opts = {}) {
  const amount = Number(payment.amount);
  const paymentDate = payment.payment_date;
  const ledgerId = `mycase_${payment.id}`;
  const isInitial = opts.kind === "initial";

  // A person may already have keyed this payment in by hand. Importing it again would
  // double-count, so hold it for review instead.
  const dup = (client.payments || []).some(
    (p) =>
      p.date === paymentDate &&
      Math.abs(Number(p.amount) - amount) < 0.005 &&
      !(p.paymentId || "").startsWith("mycase_")
  );
  if (dup) return { skip: "possible_duplicate" };

  const createdAt = now.toISOString();
  const ledgerDoc = {
    clientId: client.id || "",
    clientName: clientDisplayName(client),
    caseTitle: client.caseTitle || "",
    caseType: client.caseType || "",
    caseStatus: client.caseStatus || "",
    amount,
    paymentDate,
    paymentDateTs: etMidnight(paymentDate),
    recordedAt: createdAt,
    recordedBy: RECORDED_BY,
    source: FEED_SOURCE,
    mycase: {
      paymentId: String(payment.id),
      caseId: payment.case_id ? String(payment.case_id) : null,
      clientId: payment.client_id ? String(payment.client_id) : null,
      invoiceId: payment.invoice_id ? String(payment.invoice_id) : null,
      invoiceNumber: payment.invoice_number || null,
      transactionType: payment.transaction_type || null,
      accountName: payment.account_name || null,
      notes: payment.notes || null,
    },
  };

  const invoiceId = payment.invoice_id ? String(payment.invoice_id) : null;
  const clientPayment = {
    paymentId: ledgerId,
    amount,
    date: paymentDate,
    recordedAt: createdAt,
    recordedBy: RECORDED_BY,
    source: FEED_SOURCE,
    // Which plan a payment counts toward (cases with several installment invoices).
    ...(invoiceId ? { invoiceId } : {}),
    ...(isInitial ? { kind: "initial" } : {}),
  };
  if (isInitial) ledgerDoc.kind = "initial";

  // Every page treats payments on or before initialPaymentDate as the down payment.
  // A late part of the initial invoice moves that date forward, but only while no
  // installment payment sits in between (it would otherwise be swallowed).
  const clientUpdates = {};
  if (isInitial && paymentDate > (client.initialPaymentDate || "")) {
    const installmentBetween = (client.payments || []).some(
      (p) => p.kind !== "initial" && p.date > (client.initialPaymentDate || "") && p.date <= paymentDate
    );
    if (!installmentBetween) clientUpdates.initialPaymentDate = paymentDate;
  }

  // Allocate against the plan this payment belongs to, using only that plan's payments.
  const planView = viewForInvoice(client, invoiceId);
  const allocationRows = isInitial
    ? []
    : buildAllocationRows({ client: planView, paymentId: ledgerId, paymentDate, amount, createdAt })
        .map((row) => (planView.planInvoiceId ? { ...row, planInvoiceId: planView.planInvoiceId } : row));

  // Same rule as manual entry: an on-time payment that covers the promise clears it.
  let clearPromise = false;
  if (!isInitial && client.paymentPromise) {
    const promisedDate = new Date(client.paymentPromise.date);
    const promisedAmount = parseFloat(client.paymentPromise.amount);
    if (new Date(paymentDate) <= promisedDate && amount >= promisedAmount) clearPromise = true;
  }

  return { ledgerId, ledgerDoc, clientPayment, allocationRows, clearPromise, clientUpdates };
}

/* ------------------------------ reversals (refunds) ------------------------------ */

/**
 * The counted MyCase payment a reversal cancels: same invoice, same amount, dated on or
 * before it; the latest such payment wins. Returns { index, ledgerId } or null.
 */
function planReversal(client, reversal) {
  const want = Math.abs(cents(reversal.amount));
  const inv = String(reversal.invoice_id ?? "");
  const date = reversal.payment_date || "9999-12-31";
  let best = null;
  (client.payments || []).forEach((p, index) => {
    if (!String(p.paymentId || "").startsWith("mycase_")) return; // never touch hand entries
    if (String(p.invoiceId ?? "") !== inv || cents(p.amount) !== want || String(p.date) > date) return;
    if (!best || String(p.date) >= String(client.payments[best.index].date)) best = { index, ledgerId: p.paymentId };
  });
  return best;
}

/**
 * Month-by-month allocation rows for every counted MyCase payment, recomputed in date
 * order (each payment allocated after the ones before it, within its own plan).
 * Hand-entered payments still count as prior payments but get no rows here.
 */
function replayAllocations(client, now = new Date()) {
  const ordered = (client.payments || []).map((p, i) => ({ p, i }))
    .sort((a, b) => String(a.p.date).localeCompare(String(b.p.date)) || a.i - b.i);
  const rows = [];
  const seen = [];
  const createdAt = now.toISOString();
  for (const { p } of ordered) {
    if (String(p.paymentId || "").startsWith("mycase_") && p.kind !== "initial") {
      const view = viewForInvoice({ ...client, payments: seen.slice() }, p.invoiceId);
      buildAllocationRows({ client: view, paymentId: p.paymentId, paymentDate: p.date, amount: Number(p.amount), createdAt })
        .forEach((row, i) => rows.push({
          id: `${p.paymentId}_${i}`,
          doc: view.planInvoiceId ? { ...row, planInvoiceId: view.planInvoiceId } : row,
        }));
    }
    seen.push(p);
  }
  return rows;
}

const cents = (v) => Math.round(Number(v || 0) * 100);

/* --------------------------------- feed client --------------------------------- */

async function fetchFeedPage({ baseUrl, token, cursor, limit = 500, fetchImpl = fetch, path = "/feed/payments" }) {
  const url = new URL(path, baseUrl);
  url.searchParams.set("limit", String(limit));
  if (cursor && cursor.after_updated_at) {
    url.searchParams.set("after_updated_at", cursor.after_updated_at);
    if (cursor.after_id) url.searchParams.set("after_id", cursor.after_id);
  }
  const res = await fetchImpl(url.toString(), {
    headers: { "x-feed-token": token, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`MyCase feed responded ${res.status}`);
  }
  return res.json();
}

/* ----------------------------------- runner ----------------------------------- */

/**
 * store interface:
 *   getCursor() -> cursor | null          saveCursor(cursor)
 *   loadClientsByCaseId() -> Map<caseId, client[]>
 *   importPayment(client, payment) -> "imported" | "exists" | "possible_duplicate"
 *   addReview(payment, reason)  (idempotent per payment id + reason)
 */
async function runImport({ store, baseUrl, token, fetchImpl, pageLimit = 500, maxPages = 50, log = console }) {
  const stats = { pages: 0, imported: 0, alreadyImported: 0, ignored: 0, review: 0, reversed: 0 };
  const clientsByCaseId = await store.loadClientsByCaseId();
  let cursor = await store.getCursor("payments");

  for (let page = 0; page < maxPages; page++) {
    const feed = await fetchFeedPage({ baseUrl, token, cursor, limit: pageLimit, fetchImpl });
    stats.pages++;
    // Keep every payment, tracked or not: Case Setup imports a case's history from here.
    if (store.upsertMirror) await store.upsertMirror("payments", feed.payments);
    // Payments the rebuild already settled (e.g. cancelled reversal pairs) stay settled.
    const handled = store.handledIds && feed.payments.length
      ? await store.handledIds(feed.payments.map((p) => p.id))
      : new Set();

    for (const payment of feed.payments) {
      if (handled.has(String(payment.id))) { stats.ignored++; continue; }
      const decision = classifyPayment(payment, clientsByCaseId);
      if (decision.action === "ignore") {
        stats.ignored++;
      } else if (decision.action === "review") {
        await store.addReview(payment, decision.reason);
        stats.review++;
      } else if (decision.action === "reverse") {
        // Cancel the payment this refund/void/bounce reverses; review only if none matches.
        const outcome = store.reversePayment ? await store.reversePayment(decision.client, payment) : "no_match";
        if (outcome === "cancelled") stats.reversed++;
        else { await store.addReview(payment, "refund_or_reversal"); stats.review++; }
      } else {
        const outcome = await store.importPayment(decision.client, payment, { kind: decision.kind });
        if (outcome === "imported") stats.imported++;
        else if (outcome === "exists") stats.alreadyImported++;
        else {
          await store.addReview(payment, outcome);
          stats.review++;
        }
      }
    }

    // Persist after every page: a crash mid-run resumes here, and the idempotent
    // writes make any re-fetched rows harmless.
    if (feed.next_cursor) {
      cursor = feed.next_cursor;
      await store.saveCursor(cursor, "payments");
    }
    if (!feed.has_more) break;
  }

  log.info && log.info("MyCase payment import", stats);
  return stats;
}

module.exports = {
  caseIdFromLink,
  etMidnight,
  classifyPayment,
  computeImport,
  buildAllocationRows,
  fetchFeedPage,
  runImport,
  planReversal,
  replayAllocations,
  isReversal,
};
