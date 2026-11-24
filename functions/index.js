// ---------- Core Firebase Admin & Functions (v1 compat) ----------
const functions = require("firebase-functions/v1"); // v1 compat
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Database every function reads and writes. Unset (default) = the original database.
 * Set FIRESTORE_DATABASE=mycase-rebuild in functions/.env to run against the rebuilt one.
 */
const { getFirestore } = require("firebase-admin/firestore");
const { planViews } = require("./plans");
const { caseIdFromLink, isReversal } = require("./mycasePayments");
function appDb() {
  const id = process.env.FIRESTORE_DATABASE;
  return id && id !== "(default)" ? getFirestore(admin.app(), id) : admin.firestore();
}

/* ------------------------------------------------------------------
 * Shared helpers
 * ------------------------------------------------------------------ */

/** Utility: zero-pad */
function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

/** YYYY-MM (cohort id) */
function ymOf(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** YYYY-MM-DD */
function ymdOf(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Convert Firestore Timestamp / string / Date-ish to Date or null */
function toDate(raw) {
  if (!raw) return null;
  if (raw.toDate && typeof raw.toDate === "function") {
    try {
      return raw.toDate();
    } catch (e) {
      // fall through
    }
  }
  if (typeof raw.seconds === "number") {
    return new Date(raw.seconds * 1000);
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/** Month key YYYY-MM */
function ymKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** Label "Month YYYY" */
function labelFor(d) {
  return `${d.toLocaleString("default", { month: "long" })} ${d.getFullYear()}`;
}

/* ------------------------------------------------------------------
 * Scheduled jobs use the v2 scheduler; callables stay on v1.
 * ------------------------------------------------------------------ */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
setGlobalOptions({ region: "us-central1", timeoutSeconds: 540, memory: "512MiB" });

/* -------------------------------------------------------------------
 * Follow-Ups list (built on the 16th, refreshed every 2 hours)
 * ------------------------------------------------------------------- */

/** Installment amount for a given month date using client's schedule */
function getInstallmentAmountForDate(client, date) {
  const schedule = Array.isArray(client.installmentSchedule)
    ? client.installmentSchedule.slice().sort((a, b) => {
        const da = toDate(a.start) || new Date(0);
        const db = toDate(b.start) || new Date(0);
        return da - db;
      })
    : [];

  for (const s of schedule) {
    const sStart = toDate(s.start);
    const sEnd = toDate(s.end);
    if (!sStart || !sEnd) continue;
    if (date >= sStart && date <= sEnd) {
      const amt = Number(s.amount || 0);
      return amt > 0 ? amt : 500;
    }
  }

  // Default monthly amount if no schedule segment matches
  return 500;
}

/**
 * Determine if client should be in the follow-up cohort for this anchor.
 * A case with several installment plans (e.g. main fee + removal defense) is judged
 * plan by plan (functions/plans.js): it is listed when some plan missed this month and
 * no plan owes more than one month, for the total missed this month across its plans.
 */
function computeFollowUpItemForClient(clientDoc, anchorDate) {
  const item = installmentFollowUp(clientDoc, anchorDate);
  const client = clientDoc.data();
  // An initial payment that was refunded or never paid puts the client in "behind".
  const status = String(client.status || "active").toLowerCase();
  const owed = status === "closed" ? 0 : unpaidInitialOf(client);
  const initDate = client.initialPaymentDate ? toDate(client.initialPaymentDate) : null;
  if (owed <= 0.005 || !initDate || initDate > anchorDate) return item;
  if (item) {
    return { ...item, section: "behind", monthsBehind: (item.monthsBehind || 0) + 1, pastDueTotal: Number(item.pastDueTotal || 0) + owed, initialUnpaid: owed };
  }
  return {
    clientId: clientDoc.id,
    clientName: `${client.firstName || ""} ${client.lastName || ""}`.trim() || "Unknown",
    myCaseLink: client.myCaseLink || null,
    section: "behind",
    planEnded: false,
    monthsBehind: 1,
    pastDueTotal: owed,
    amountDueCurrentMonth: 0,
    initialUnpaid: owed,
    dueMonthLabel: labelFor(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 15)),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function installmentFollowUp(clientDoc, anchorDate) {
  const clientId = clientDoc.id;
  const client = clientDoc.data();
  const views = planViews({ id: clientId, ...client });
  if (views.length <= 1) return followUpForPlan(clientId, client, anchorDate);

  const results = views.map((v) => followUpForPlan(clientId, v, anchorDate, { detail: true }));
  const missed = results.filter((r) => r && (r.includeThisMonth || r.planEnded));
  if (!missed.length) return null;
  // The row itself (name, link, month) is the same for every plan: take a missed one's.
  const item = followUpForPlan(clientId, views[results.indexOf(missed[0])], anchorDate);
  const behind = missed.some((r) => r.multiMonthPastDue || r.planEnded);
  return {
    ...item,
    section: behind ? "behind" : "current",
    planEnded: missed.every((r) => r.planEnded),
    monthsBehind: Math.max(...missed.map((r) => r.monthsBehind)),
    pastDueTotal: missed.reduce((sum, r) => sum + r.pastDueTotal, 0),
    amountDueCurrentMonth: missed.reduce((sum, r) => sum + r.pending, 0),
    plansMissed: missed.map((r) => ({ invoiceNumber: r.planInvoiceNumber || null, amount: r.pending, monthsBehind: r.monthsBehind })),
  };
}

/**
 * The part of each payment that goes to installments, oldest first.
 *  - Rebuilt from MyCase: the payment's invoice decides (installment invoice -> installment).
 *  - Otherwise payments up to the initial-payment date pay the initial payment only up to
 *    its amount; the rest counts toward installments (e.g. the whole plan paid on day one).
 */
function installmentPaymentsOf(client) {
  const init = client.initialPaymentDate ? toDate(client.initialPaymentDate) : null;
  const roles = client.invoiceRoles || {};
  let initialLeft = Math.max(0, Number(client.initialPaymentAmount || 0));
  const out = [];
  const pays = (Array.isArray(client.payments) ? client.payments : [])
    .map((p) => ({ amount: Number(p.amount || 0), date: toDate(p.date), kind: p.kind, invoiceId: p.invoiceId != null ? String(p.invoiceId) : "" }))
    .filter((p) => p.amount > 0 && p.date)
    .sort((a, b) => a.date - b.date);
  for (const p of pays) {
    const role = roles[p.invoiceId];
    let amount = p.amount;
    if (p.kind === "initial" || role === "initial" || role === "other") {
      if (role !== "other") initialLeft = Math.max(0, initialLeft - amount);
      continue;
    }
    if (role !== "installment" && init && p.date <= init) {
      const toInitial = Math.min(initialLeft, amount);
      initialLeft -= toInitial;
      amount -= toInitial;
    }
    if (amount > 0.005) out.push({ amount, date: p.date });
  }
  return out;
}

/** Initial payment never paid or refunded (only knowable for clients rebuilt from MyCase). */
function unpaidInitialOf(client) {
  const roles = client.invoiceRoles || {};
  if (!Object.values(roles).includes("initial")) return 0;
  const paid = (client.payments || []).filter((p) => p.kind === "initial" || roles[String(p.invoiceId)] === "initial").reduce((s, p) => s + Number(p.amount || 0), 0);
  return Math.max(0, Number(client.initialPaymentAmount || 0) - paid);
}

/** One plan (or a single-plan client): the follow-up row, or null. */
function followUpForPlan(clientId, client, anchorDate, { detail = false } = {}) {

  const status = (client.status || "active").toLowerCase();
  if (status === "closed") return null;

  const pauseStartedAt = client.pauseStartedAt ? toDate(client.pauseStartedAt) : null;

  // Anchor cohort month (we care about the 15th of this same month)
  const cohortId = ymOf(anchorDate);
  const dueDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 15);
  const dueMonthKey = ymKey(dueDate);

  // If paused BEFORE or ON the due date, we don't expect a payment this month
  if (status === "paused" && pauseStartedAt && pauseStartedAt <= dueDate) {
    return null;
  }

  // Basic invoice math (mirrors BillingOverview)
  const invoiceBase = Number(client.invoiceTotal || 0);
  const adjustments = Array.isArray(client.invoiceAdjustments)
    ? client.invoiceAdjustments
    : [];
  const adjToBalanceTotal = adjustments.reduce((sum, a) => {
    const applyTo = (a?.applyTo || "balance").toLowerCase();
    const amt = Number(a?.amount || 0);
    const dp = Number(a?.downPayment || 0);
    return applyTo === "balance" ? sum + (amt - dp) : sum;
  }, 0);
  const invoiceEffective = Math.max(0, invoiceBase + adjToBalanceTotal);

  const initialPayment = Number(client.initialPaymentAmount || 0);
  const initialPaymentDate = client.initialPaymentDate
    ? toDate(client.initialPaymentDate)
    : null;

  // If nothing to collect, skip
  const collectibleCap = Math.max(0, invoiceEffective - initialPayment);
  if (collectibleCap <= 0) return null;

  const firstInstallmentDate = client.firstInstallmentDate
    ? toDate(client.firstInstallmentDate)
    : null;
  const expectedAnchor = client.expectedAnchor ? toDate(client.expectedAnchor) : null;
  const anchorForPlan = expectedAnchor || firstInstallmentDate;

  if (!anchorForPlan) return null;

  // First due = 15 of anchor month
  const firstDueDate = new Date(
    anchorForPlan.getFullYear(),
    anchorForPlan.getMonth(),
    15
  );

  // If first due is AFTER this month's due date, client isn't expected yet
  if (firstDueDate > dueDate) {
    return null;
  }

  // Skip months (YYYY-MM)
  const skipSet = new Set((client.skipMonths || []).map(String));
  const monthIsSkipped = (d) => skipSet.has(ymKey(d));

  // Payments AFTER the initial payment date.
  // NOTE: We intentionally do NOT cap payments at the anchor date. Billing
  // Overview counts every payment on the client, so a payment made a few days
  // after the 15th (e.g. the 17th) still clears that month. Capping at the
  // anchor (the 16th) previously left clients who paid late permanently flagged
  // as owing, even after regenerating.
  // Same rule as the app (src/billing/ledger.js installmentPayments).
  const paymentsAfterInitial = installmentPaymentsOf(client);

  // Build months up to anchor, capped by collectibleCap
  const months = [];
  let expectedAccum = 0;
  const cutoff = new Date(anchorDate);
  let cursor = new Date(firstDueDate);
  let guard = 0;

  while (
    cursor <= cutoff &&
    expectedAccum < collectibleCap - 0.005 &&
    guard < 240 // safety
  ) {
    if (!monthIsSkipped(cursor)) {
      // The last installment is whatever is left of the balance (it may be smaller).
      const amt = Math.min(getInstallmentAmountForDate(client, cursor), collectibleCap - expectedAccum);
      months.push({ date: new Date(cursor), amt });
      expectedAccum += amt;
    }
    cursor.setMonth(cursor.getMonth() + 1);
    guard++;
  }

  // Nothing due this month AND nothing unpaid before it: not a follow-up. A plan whose
  // last month has passed but is still short stays on the list ("behind", plan ended).
  const monthHasDue = months.some((m) => ymKey(m.date) === dueMonthKey);

  // FIFO allocate payments across months
  const pool = paymentsAfterInitial.map((p) => ({
    amount: p.amount,
    date: p.date,
  }));

  let multiMonthPastDue = false;
  let includeThisMonth = false;
  let pendingForThisMonth = 0;
  let monthsBehind = 0; // unpaid (or part-paid) months up to and including this one
  let pastDueTotal = 0;

  for (const { date: m, amt } of months) {
    const mKey = ymKey(m);
    let paid = 0;

    for (const p of pool) {
      if (p.amount <= 0) continue;
      const take = Math.min(amt - paid, p.amount);
      paid += take;
      p.amount -= take;
      if (paid >= amt) break;
    }

    if (paid < amt && m <= dueDate) {
      monthsBehind++;
      pastDueTotal += amt - paid;
    }
    if (mKey === dueMonthKey) {
      if (paid < amt) {
        includeThisMonth = true;
        pendingForThisMonth = amt - paid;
      }
    } else if (m < dueDate) {
      // Any earlier month still unpaid? then this is "owes more than one month"
      if (paid < amt) {
        multiMonthPastDue = true;
      }
    }
  }

  const planEnded = !monthHasDue && monthsBehind > 0;
  if (detail) {
    return { includeThisMonth, multiMonthPastDue, planEnded, monthsBehind, pastDueTotal, pending: pendingForThisMonth, planInvoiceNumber: client.planInvoiceNumber || client.planInvoiceId };
  }

  // Missed this month. Clients who were current before go in the main list ("current");
  // those already owing earlier months (or past the end of their plan) go in "behind".
  if (!includeThisMonth && !planEnded) {
    return null;
  }

  // Build follow-up row
  const clientName = `${client.firstName || ""} ${client.lastName || ""}`.trim() || "Unknown";
  const myCaseLink = client.myCaseLink || null;

  return {
    clientId,
    clientName,
    myCaseLink,
    section: multiMonthPastDue || planEnded ? "behind" : "current",
    planEnded,
    monthsBehind,
    pastDueTotal,
    amountDueCurrentMonth: pendingForThisMonth,
    dueMonthLabel: labelFor(dueDate),
    // status: intentionally omitted -> UI defaults to FOLLOW_UP_STATUS.PENDING
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * Sync a cohort's items subcollection with a freshly computed list.
 *
 * IMPORTANT: This is NON-DESTRUCTIVE to follow-up progress. Regenerating a
 * cohort refreshes billing-derived fields (amount due, name, MyCase link) but
 * PRESERVES any logged tracking (status, notes, next follow-up date, attempt
 * count, non-payment reason) for clients still in the cohort. Clients who no
 * longer qualify (e.g. they paid) are removed; newly-qualifying clients are added.
 */
/**
 * Why a client on the list no longer owes this month: "paid" when a payment dated in
 * the due month or later is on the client, otherwise "no_longer_due" (closed, paused,
 * plan changed, record deleted).
 */
function resolutionFor(client, cohortId) {
  if (!client) return { resolvedReason: "no_longer_due", paidDate: null };
  const dates = (Array.isArray(client.payments) ? client.payments : [])
    .filter((p) => Number(p.amount || 0) > 0 && p.date)
    .map((p) => {
      // A plain "YYYY-MM-DD" is already the payment's day; parsing it would shift it a day in New York.
      if (typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(p.date)) return p.date.slice(0, 10);
      const d = toDate(p.date);
      return d ? ymdOf(d) : "";
    })
    .filter((d) => d.slice(0, 7) >= cohortId)
    .sort();
  if (!dates.length) return { resolvedReason: "no_longer_due", paidDate: null };
  return { resolvedReason: "paid", paidDate: dates[dates.length - 1] };
}

async function overwriteCohortItems(cohortId, items, clientsById = new Map()) {
  const db = appDb();
  const cohortRef = db.collection("followUpsCohorts").doc(cohortId);
  const itemsRef = cohortRef.collection("items");

  // Fields that hold follow-up progress and must survive a regeneration.
  const TRACKED_FIELDS = [
    "status",
    "attemptCount",
    "lastContactAt",
    "lastContactSummary",
    "nextFollowUpAt",
    "nonPayReason",
    "nonPayReasonCustom",
    "assignee",
    "escalationFlag",
    "lastContactBy",
    "lastContactByEmail",
    "history",
  ];

  // 1) Load existing items so we can preserve their tracked fields.
  const existingSnap = await itemsRef.get();
  const existingById = new Map();
  existingSnap.forEach((doc) => existingById.set(doc.id, doc.data()));

  const newIds = new Set(items.map((it) => it.clientId));

  // Chunked batch writer (Firestore batch limit is 500 ops).
  let batch = db.batch();
  let opCount = 0;
  const commits = [];
  const flush = () => {
    if (opCount > 0) {
      commits.push(batch.commit());
      batch = db.batch();
      opCount = 0;
    }
  };

  // 2) Upsert new items, carrying over tracked progress for returning clients.
  for (const item of items) {
    const ref = itemsRef.doc(item.clientId);
    const existing = existingById.get(item.clientId);

    let payload = item.resolvedReason ? { ...item, resolvedAt: admin.firestore.FieldValue.serverTimestamp() } : item;
    if (existing) {
      // Owes again (e.g. a bounced payment): back to an open row.
      payload = { resolvedAt: null, resolvedReason: null, paidDate: null, mycaseUnlogged: null, mycaseUnloggedDates: null, ...item };
      if (item.resolvedReason) payload.resolvedAt = existing.resolvedAt || admin.firestore.FieldValue.serverTimestamp();
      for (const f of TRACKED_FIELDS) {
        if (existing[f] !== undefined) payload[f] = existing[f];
      }
      // Keep the original createdAt rather than resetting it.
      if (existing.createdAt !== undefined) payload.createdAt = existing.createdAt;
    }

    batch.set(ref, payload, { merge: true });
    opCount++;
    if (opCount >= 450) flush();
  }

  // 3) Clients who no longer owe this month stay on the list (it is the record of who
  //    missed), marked paid with the date; their call notes are kept.
  existingSnap.forEach((doc) => {
    if (!newIds.has(doc.id) && !doc.data().resolvedAt) {
      const r = resolutionFor(clientsById.get(doc.id), cohortId);
      batch.update(doc.ref, { ...r, resolvedAt: admin.firestore.FieldValue.serverTimestamp() });
      opCount++;
      if (opCount >= 450) flush();
    }
  });

  flush();
  if (commits.length) {
    await Promise.all(commits);
  }

  // 4) Update cohort meta
  await cohortRef.set(
    {
      lastGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/* ---------------------------------------------------
 * Callable: generateFollowUpsCohort
 * --------------------------------------------------- */
exports.generateFollowUpsCohort = functions.https.onCall(async (data, context) => {
  await requireEditor(context);
  const db = appDb();

  const anchorStr = data && data.anchorDate ? String(data.anchorDate) : null;
  const anchor = anchorStr ? new Date(anchorStr) : new Date();
  if (isNaN(anchor.getTime())) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Invalid anchorDate: ${anchorStr}`
    );
  }

  const r = await generateCohort(db, anchor, "manual");
  return { ok: true, ...r, anchorDate: anchorStr || anchor.toISOString().slice(0, 10) };
});

/** Builds (or refreshes) the follow-up list for the anchor's month. */
/**
 * Hand-entered clients (no MyCase invoice tags) only get payments someone types in.
 * Credit them with this month's MyCase payments on their case that are not typed in
 * yet, so the list is right even before the team logs them. Client records are not
 * changed. Clients rebuilt from MyCase already receive MyCase payments: untouched.
 *   - covers what is owed -> row kept at the bottom as "paid_mycase" (to log)
 *   - covers part         -> amounts reduced, the unlogged sum shown on the row
 */
function applyMyCasePayments(item, client, monthPayments) {
  if (!item || !client || (client.invoiceRoles && Object.keys(client.invoiceRoles).length)) return item;
  const caseId = client.mycaseCaseId || caseIdFromLink(client.myCaseLink || "");
  const pays = caseId ? monthPayments.get(String(caseId)) || [] : [];
  const typed = Array.isArray(client.payments) ? client.payments : [];
  const unlogged = pays.filter((mp) => !typed.some((t) => {
    const td = typeof t.date === "string" ? t.date.slice(0, 10) : (toDate(t.date) ? ymdOf(toDate(t.date)) : "");
    return td === mp.date && Math.abs(Number(t.amount || 0) - mp.amount) < 0.005;
  }));
  const sum = unlogged.reduce((s, mp) => s + mp.amount, 0);
  if (sum <= 0) return item;
  const owed = Number(item.pastDueTotal ?? item.amountDueCurrentMonth ?? 0);
  const mycase = { mycaseUnlogged: sum, mycaseUnloggedDates: unlogged.map((mp) => mp.date).sort() };
  if (sum >= owed - 0.005) {
    return { ...item, ...mycase, resolvedReason: "paid_mycase", paidDate: mycase.mycaseUnloggedDates.slice(-1)[0] };
  }
  // Money goes to the oldest month first, so this month's amount only drops once the
  // earlier months are covered.
  const left = owed - sum;
  return { ...item, ...mycase, pastDueTotal: left, amountDueCurrentMonth: Math.min(Number(item.amountDueCurrentMonth || 0), left) };
}

/** This month's received MyCase payments, by case id. */
async function myCasePaymentsForMonth(db, cohortId) {
  const snap = await db.collection("mycasePayments").where("date", ">=", `${cohortId}-01`).where("date", "<=", `${cohortId}-31`).get();
  const byCase = new Map();
  snap.docs.forEach((d) => {
    const p = d.data();
    const amount = Number(p.amount);
    if (p.status !== "success" || !(amount > 0) || isReversal({ amount: p.amount, transaction_type: p.type })) return;
    const k = String(p.caseId || "");
    if (!k) return;
    if (!byCase.has(k)) byCase.set(k, []);
    byCase.get(k).push({ id: String(p.id || d.id), date: String(p.date).slice(0, 10), amount });
  });
  return byCase;
}

async function generateCohort(db, anchor, by) {
  const cohortId = ymOf(anchor);
  const [snap, monthPayments] = await Promise.all([db.collection("clients").get(), myCasePaymentsForMonth(db, cohortId)]);
  const items = [];
  const clientsById = new Map();
  for (const doc of snap.docs) {
    clientsById.set(doc.id, doc.data());
    const item = applyMyCasePayments(computeFollowUpItemForClient(doc, anchor), doc.data(), monthPayments);
    if (item) items.push(item);
  }
  await overwriteCohortItems(cohortId, items, clientsById);
  const open = items.filter((i) => !i.resolvedReason);
  const current = open.filter((i) => i.section !== "behind");
  const meta = {
    lastGeneratedBy: by,
    counts: { current: current.length, behind: open.length - current.length, paidInMyCaseNotLogged: items.length - open.length },
    totals: {
      current: current.reduce((s, i) => s + Number(i.amountDueCurrentMonth || 0), 0),
      behind: open.filter((i) => i.section === "behind").reduce((s, i) => s + Number(i.pastDueTotal || 0), 0),
    },
  };
  // The first scheduled run is the report itself: remember when and how big it was.
  const cohortRef = db.collection("followUpsCohorts").doc(cohortId);
  const existing = await cohortRef.get();
  if (by === "schedule" && !(existing.exists && existing.data().reportAt)) {
    meta.reportAt = admin.firestore.FieldValue.serverTimestamp();
    meta.reportCounts = meta.counts;
    meta.reportTotals = meta.totals;
  }
  await cohortRef.set(meta, { merge: true });
  return { cohortId, total: items.length, ...meta.counts };
}

/** "Today" as a date in New York (Cloud Functions run in UTC). */
function todayInNewYork() {
  const [y, m, d] = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

/* ---------------------------------------------------
 * Monthly follow-ups report: 16th at 09:00 New York.
 * Payments are due on the 15th; whoever has not paid this month's installment is
 * listed (current clients first; clients already behind in their own section).
 * --------------------------------------------------- */
exports.monthlyFollowUpsCron = onSchedule(
  { schedule: "0 9 16 * *", timeZone: "America/New_York" },
  async () => {
    const r = await generateCohort(appDb(), todayInNewYork(), "schedule");
    console.log("Monthly follow-ups report", r);
  }
);

/**
 * A promise is kept when the client paid at least the promised amount between the day
 * it was made and 3 days after the promised date. Pure, for tests.
 */
function promiseOutcome(promise, payments, today) {
  const due = String(promise.date || "").slice(0, 10);
  if (!due) return null;
  const made = String(promise.createdAt || "").slice(0, 10) || due;
  const graceEnd = (() => {
    const [y, m, d] = due.split("-").map(Number);
    const g = new Date(y, m - 1, d + 3, 12);
    return ymdOf(g);
  })();
  const paid = (payments || [])
    .filter((p) => Number(p.amount || 0) > 0)
    .map((p) => ({ amount: Number(p.amount), day: typeof p.date === "string" ? p.date.slice(0, 10) : (toDate(p.date) ? ymdOf(toDate(p.date)) : "") }))
    .filter((p) => p.day && p.day >= made && p.day <= graceEnd)
    .reduce((sum, p) => sum + p.amount, 0);
  const target = Number(promise.amount || 0);
  if (target > 0 && paid >= target - 0.005) return { status: "kept", paidAmount: paid };
  if (today > graceEnd) return { status: "broken", paidAmount: paid };
  return null; // still open
}

/**
 * Aging buckets for the whole book as of `at` (same code as the app's Aging report).
 * { b0, b30, b60, b90, total, clients }
 */
function agingTotals(clients, at) {
  // Same as the app: by client, and hand-entered clients get their MyCase payments.
  const { clientAging } = require("./shared/billing/ledger");
  const { withMyCasePayments } = require("./shared/billing/mycaseOverlay");
  const t = { b0: 0, b30: 0, b60: 0, b90: 0, total: 0, clients: 0 };
  for (const c of clients) {
    if (String(c.status || "active").toLowerCase() === "closed") continue;
    let a;
    try {
      a = clientAging(withMyCasePayments(c), at);
    } catch (e) {
      continue;
    }
    if (a.total <= 0.005) continue;
    ["b0", "b30", "b60", "b90", "total"].forEach((k) => (t[k] += a[k]));
    t.clients++;
  }
  return t;
}

/* Nightly: save this month's aging (the last run of the month is the month-end figure).
 * The Aging trend uses these saved months; earlier months are rebuilt from history. */
exports.agingSnapshotCron = onSchedule(
  { schedule: "45 23 * * *", timeZone: "America/New_York" },
  async () => {
    const db = appDb();
    const at = new Date();
    const clients = (await db.collection("clients").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    const totals = agingTotals(clients, at);
    const key = ymOf(todayInNewYork());
    await db.doc(`agingSnapshots/${key}`).set({ ...totals, month: key, asOf: at.toISOString(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log("Aging snapshot", key, totals);
  }
);

/* Nightly: mark payment promises kept or broken (Team page and promise reports). */
exports.checkPromisesCron = onSchedule(
  { schedule: "30 21 * * *", timeZone: "America/New_York" },
  async () => {
    const db = appDb();
    const today = ymdOf(todayInNewYork());
    const open = await db.collection("paymentPromises").where("status", "==", "open").get();
    let kept = 0;
    let broken = 0;
    for (const d of open.docs) {
      const pr = d.data();
      const client = (await db.doc(`clients/${pr.clientId}`).get()).data();
      const r = promiseOutcome(pr, client ? client.payments : [], today);
      if (!r) continue;
      await d.ref.update({ ...r, checkedAt: admin.firestore.FieldValue.serverTimestamp() });
      if (r.status === "kept") kept++;
      else broken++;
    }
    console.log("Promises checked", { open: open.size, kept, broken });
  }
);

/* Keeps this month's list current after the report: people who pay are marked paid.
 * Every 2 hours, 8 AM-8 PM New York, from the 17th to the end of the month. */
exports.refreshFollowUpsCron = onSchedule(
  { schedule: "0 8-20/2 17-31 * *", timeZone: "America/New_York" },
  async () => {
    const db = appDb();
    const anchor = todayInNewYork();
    const cohort = await db.collection("followUpsCohorts").doc(ymOf(anchor)).get();
    if (!cohort.exists || !cohort.data().reportAt) return; // no report this month yet
    const r = await generateCohort(db, anchor, "refresh");
    console.log("Follow-ups refresh", r);
  }
);


/* -------------------------------------------------------------------
 * MyCase sync — hourly, matches the Azure service's sync.
 * Mirrors {MYCASE_FEED_URL}/feed/cases, /feed/invoices and /feed/payments
 * into Firestore (mycaseCases / mycaseInvoices / mycasePayments), flags cases
 * that need setup, and applies payments to tracked clients. Token in the
 * MYCASE_FEED_TOKEN secret. NOT deployed until you run
 * `firebase deploy --only functions:importMyCasePayments`.
 * ------------------------------------------------------------------- */
const { defineSecret, defineString } = require("firebase-functions/params");
const { runAll } = require("./mycaseSync");
const {
  createFirestoreStore, setupCase, markNoPlanNeeded, retryReviewItem, tagReviewItem, dismissReviewItem, retagCase,
} = require("./mycasePaymentsStore");
const { linkClientToCase, keepRecordForCase } = require("./linkIssues");

const MYCASE_FEED_TOKEN = defineSecret("MYCASE_FEED_TOKEN");
const MYCASE_FEED_URL = defineString("MYCASE_FEED_URL");

/* RingCentral: billing calls -> proof of contact on each client (functions/ringcentral.js).
 * Every 15 minutes, 8 AM-8 PM New York, Mon-Sat. Secrets set with
 * `firebase functions:secrets:set RC_CLIENT_ID` (and RC_CLIENT_SECRET, RC_JWT). */
const RC_CLIENT_ID = defineSecret("RC_CLIENT_ID");
const RC_CLIENT_SECRET = defineSecret("RC_CLIENT_SECRET");
const RC_JWT = defineSecret("RC_JWT");
exports.importRingCentralCalls = onSchedule(
  { schedule: "*/15 8-20 * * 1-6", timeZone: "America/New_York", secrets: [RC_CLIENT_ID, RC_CLIENT_SECRET, RC_JWT] },
  async () => {
    const { getToken, importCalls } = require("./ringcentral");
    const token = await getToken({ clientId: RC_CLIENT_ID.value(), clientSecret: RC_CLIENT_SECRET.value(), jwt: RC_JWT.value() });
    // First run: the last 90 days (RingCentral keeps about that much call log).
    const since = new Date(Date.now() - 90 * 864e5).toISOString();
    const r = await importCalls(appDb(), { token, since, admin });
    console.log("RingCentral calls", r);
  }
);


exports.importMyCasePayments = onSchedule(
  {
    schedule: "every 60 minutes",
    timeZone: "America/New_York",
    secrets: [MYCASE_FEED_TOKEN],
    timeoutSeconds: 540,
    memory: "1GiB", // the first run mirrors ~135k MyCase rows
  },
  async () => {
    await runAll({
      store: createFirestoreStore(appDb()),
      baseUrl: MYCASE_FEED_URL.value(),
      token: MYCASE_FEED_TOKEN.value(),
    });
  }
);

/* Callable only by editor / admin / master (same roles as the Follow Ups page). */
const MASTER_EMAIL = "jhovanny@rahmanlawpllc.com";

async function requireEditor(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
  }
  const email = String(context.auth.token.email || "").toLowerCase();
  let allowed = email === MASTER_EMAIL;
  if (!allowed) {
    const prof = (await appDb().doc(`users/${context.auth.uid}`).get()).data() || {};
    // Same roles as src/auth/permissions.js: editor and above; disabled accounts never.
    allowed = prof.disabled !== true && ["editor", "lead", "admin", "master"].includes(String(prof.role || "").toLowerCase());
  }
  if (!allowed) {
    throw new functions.https.HttpsError("permission-denied", "Editor access required.");
  }
  return email;
}

async function requireAdmin(context) {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
  const email = String(context.auth.token.email || "").toLowerCase();
  if (email === MASTER_EMAIL) return email;
  const prof = (await appDb().doc(`users/${context.auth.uid}`).get()).data() || {};
  if (prof.disabled === true || !["admin", "master"].includes(String(prof.role || "").toLowerCase())) {
    throw new functions.https.HttpsError("permission-denied", "Admins only.");
  }
  return email;
}

const USER_ROLES = ["basic", "editor", "lead", "admin"];

/**
 * Users & roles: add a person. Creates the sign-in account and the profile, and returns
 * a one-time link for them to set their password (the admin sends it). The admin stays
 * signed in (the old Register page signed the admin out).
 */
exports.inviteUser = functions.https.onCall(async (data, context) => {
  const by = await requireAdmin(context);
  const email = String((data && data.email) || "").trim().toLowerCase();
  const name = String((data && data.name) || "").trim();
  const role = String((data && data.role) || "basic").toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new functions.https.HttpsError("invalid-argument", "Enter a valid email.");
  if (!USER_ROLES.includes(role)) throw new functions.https.HttpsError("invalid-argument", "Unknown role.");
  let user;
  try {
    user = await admin.auth().createUser({ email, displayName: name || undefined, password: require("crypto").randomBytes(18).toString("base64url") });
  } catch (e) {
    if (e.code === "auth/email-already-exists") throw new functions.https.HttpsError("already-exists", "A user with this email already exists.");
    throw new functions.https.HttpsError("internal", e.message);
  }
  const [firstName, ...rest] = name.split(" ");
  await appDb().doc(`users/${user.uid}`).set({
    email, name, firstName: firstName || "", lastName: rest.join(" "), role, disabled: false,
    onboardingCompleted: false, createdAt: admin.firestore.FieldValue.serverTimestamp(), invitedBy: by,
  });
  const setPasswordLink = await admin.auth().generatePasswordResetLink(email);
  return { uid: user.uid, setPasswordLink };
});

/** Users & roles: remove a person's account (profile and sign-in). Not yourself. */
exports.deleteUser = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);
  const uid = String((data && data.uid) || "");
  if (!uid) throw new functions.https.HttpsError("invalid-argument", "Missing user.");
  if (uid === context.auth.uid) throw new functions.https.HttpsError("failed-precondition", "You cannot delete your own account.");
  const prof = (await appDb().doc(`users/${uid}`).get()).data() || {};
  if (String(prof.email || "").toLowerCase() === MASTER_EMAIL) throw new functions.https.HttpsError("failed-precondition", "The owner account cannot be deleted.");
  try {
    await admin.auth().deleteUser(uid);
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw new functions.https.HttpsError("internal", e.message);
  }
  await appDb().doc(`users/${uid}`).delete();
  return { ok: true };
});

/* Review actions for payments the importer would not guess about. */
exports.resolveMyCaseReview = functions.https.onCall(async (data, context) => {
  const email = await requireEditor(context);
  const reviewId = String((data && data.reviewId) || "");
  const action = String((data && data.action) || "");
  if (!reviewId || !["retry", "dismiss", "tag"].includes(action)) {
    throw new functions.https.HttpsError("invalid-argument", "reviewId and action (retry|dismiss|tag) required.");
  }

  const db = appDb();
  try {
    if (action === "dismiss") {
      await dismissReviewItem(db, reviewId, email);
      return { status: "dismissed" };
    }
    if (action === "tag") {
      // For "installment", data.plan = { monthlyAmount, startDate } makes it its own plan.
      return await tagReviewItem(db, reviewId, String(data.role || ""), email, data.plan || null);
    }
    return await retryReviewItem(db, reviewId);
  } catch (err) {
    throw new functions.https.HttpsError("failed-precondition", err.message || "Action failed.");
  }
});

/* Case Setup, "Link problems": point a record at its MyCase case, or keep one of several. */
exports.linkMyCaseClient = functions.https.onCall(async (data, context) => {
  const email = await requireEditor(context);
  const clientId = String((data && data.clientId) || "");
  const caseId = String((data && data.caseId) || "");
  if (!clientId || !/^\d+$/.test(caseId)) throw new functions.https.HttpsError("invalid-argument", "clientId and caseId required.");
  try {
    return await linkClientToCase(appDb(), { clientId, caseId, by: email });
  } catch (err) {
    throw new functions.https.HttpsError("failed-precondition", err.message || "Could not link.");
  }
});

exports.keepMyCaseRecord = functions.https.onCall(async (data, context) => {
  const email = await requireEditor(context);
  const clientId = String((data && data.clientId) || "");
  const caseId = String((data && data.caseId) || "");
  if (!clientId || !/^\d+$/.test(caseId)) throw new functions.https.HttpsError("invalid-argument", "clientId and caseId required.");
  try {
    return await keepRecordForCase(appDb(), { caseId, clientId, by: email });
  } catch (err) {
    throw new functions.https.HttpsError("failed-precondition", err.message || "Could not save.");
  }
});

/* Case Setup, "Waiting for a plan": the fee was paid in one invoice, no plan needed. */
exports.markMyCaseNoPlanNeeded = functions.https.onCall(async (data, context) => {
  const email = await requireEditor(context);
  const caseId = String((data && data.caseId) || "");
  if (!/^\d+$/.test(caseId)) {
    throw new functions.https.HttpsError("invalid-argument", "caseId required.");
  }
  try {
    return await markNoPlanNeeded(appDb(), { caseId, by: email });
  } catch (err) {
    throw new functions.https.HttpsError("failed-precondition", err.message || "Could not save.");
  }
});

/* Case Setup: billing tags a MyCase case's invoices and enters the plan. */
exports.setupMyCaseCase = functions.https.onCall(async (data, context) => {
  const email = await requireEditor(context);
  const caseId = String((data && data.caseId) || "");
  if (!/^\d+$/.test(caseId)) {
    throw new functions.https.HttpsError("invalid-argument", "caseId required.");
  }
  try {
    return await setupCase(appDb(), {
      caseId,
      roles: (data && data.roles) || {},
      plans: (data && data.plans) || [],
      by: email,
    });
  } catch (err) {
    // Validation messages from buildSetupClient are written for billing to read.
    throw new functions.https.HttpsError("failed-precondition", err.message || "Setup failed.");
  }
});

/* Existing clients in the rebuilt database: billing tags the case's invoices (and the
 * amount of any extra installment plan); the payment history is rebuilt from MyCase.
 * Refuses to run anywhere but the "mycase-rebuild" database. */
exports.retagMyCaseClient = functions.https.onCall(async (data, context) => {
  const email = await requireEditor(context);
  const caseId = String((data && data.caseId) || "");
  if (!/^\d+$/.test(caseId)) {
    throw new functions.https.HttpsError("invalid-argument", "caseId required.");
  }
  try {
    return await retagCase(appDb(), {
      caseId,
      roles: (data && data.roles) || {},
      plans: (data && data.plans) || [],
      by: email,
    });
  } catch (err) {
    throw new functions.https.HttpsError("failed-precondition", err.message || "Rebuild failed.");
  }
});

// Unit tests only (FUNCTIONS_UNIT_TEST=1): never set in Cloud Functions, so not deployed.
if (process.env.FUNCTIONS_UNIT_TEST === "1") {
  module.exports._test = { agingTotals, computeFollowUpItemForClient, resolutionFor, generateCohort, overwriteCohortItems, applyMyCasePayments, promiseOutcome };
}
