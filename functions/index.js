// ---------- Core Firebase Admin & Functions (v1 compat) ----------
const functions = require("firebase-functions/v1"); // v1 compat
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
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

/** Utility: current Monday in a given TZ (defaults to ET) */
function currentMondayInTZ(tz = "America/New_York") {
  const nowTZ = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
  const day = nowTZ.getDay(); // 0 Sun..6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // move to Monday
  const m = new Date(nowTZ);
  m.setDate(m.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

/* ------------------------------------------------------------------
 * Level10 Weekly Snapshots (Scheduler + Admin "Run now" trigger)
 * ------------------------------------------------------------------ */

// v2 scheduler (works alongside your existing v1 https functions)
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
setGlobalOptions({ region: "us-central1", timeoutSeconds: 540, memory: "512MiB" });

/* -------------------------------
 * Minimal compute placeholders
 * Replace with your real server-side implementations when ready.
 * ------------------------------- */
function computeOpening30AR({ clients /*, month, tz, dueDay */ }) {
  // TODO: port your real opening 30+ A/R logic here.
  // Safe default so pipeline never crashes:
  return 0;
}

function computeAll({ clients /*, monday, sunday, month, tz, dueDay, opening30AR */ }) {
  // TODO: port your real metric logic here (same IDs as the web grid).
  const metrics = {
    // Example autos; keep ids aligned with your UI list
    total_cases_in_plans: clients.length,
    total_cases_current: null,
    total_cases_past_due: null,
    lt60_pd: null,
    gt60_pd: null,
    paused_clients: null,
    payments_received_week: null,
    payments_received_mtd: null,
    pct_30_60: null,
    past_due_recovery_30p: null,
    mtd_pct_past_due_recovered: null,
    clients_recovered_from_pd: null,
    total_outstanding_ar: null,
    ytd_paused_clients: null,
    // Any other auto-only metric ids used in your grid can be added as null.
  };
  return { metrics };
}

/* ---------------------------------------
 * Core upsert used by both triggers below
 * --------------------------------------- */
async function computeAndUpsertWeek({
  mondayKey,
  monthKey,
  tz = "America/New_York",
  dueDay = 15,
}) {
  const db = admin.firestore();

  // 1) Ensure month doc has opening30AR (compute once per month)
  const monthRef = db.doc(`level10/${monthKey}`);
  const monthSnap = await monthRef.get();
  let opening30 =
    monthSnap.exists && monthSnap.data().opening30AR != null
      ? monthSnap.data().opening30AR
      : null;

  if (opening30 == null) {
    const clientsForOpening = (await db.collection("clients").get()).docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    opening30 = computeOpening30AR({
      clients: clientsForOpening,
      month: monthKey,
      tz,
      dueDay,
    });
    await monthRef.set(
      {
        opening30AR: opening30,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  // 2) Compute this week's auto metrics
  const monday = new Date(mondayKey);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const clients = (await db.collection("clients").get()).docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  const computed = computeAll({
    clients,
    monday,
    sunday,
    month: monthKey,
    tz,
    dueDay,
    opening30AR: opening30,
  });

  // 3) Upsert week doc, preserving manualMetrics
  const weekRef = db.doc(`level10/${monthKey}/weeks/${mondayKey}`);
  await weekRef.set(
    {
      metrics: computed.metrics || {},
      // manualMetrics is left intact by merge
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/* ---------------------------------------------------
 * A) Cron — Every Monday 09:00 America/New_York
 * --------------------------------------------------- */
exports.weeklySnapshotCron = onSchedule(
  { schedule: "0 9 * * 1", timeZone: "America/New_York" },
  async () => {
    const monday = currentMondayInTZ("America/New_York");
    const mondayKey = ymdOf(monday);
    const monthKey = ymOf(monday);
    await computeAndUpsertWeek({
      mondayKey,
      monthKey,
      tz: "America/New_York",
      dueDay: 15,
    });
  }
);

/* -------------------------------------------------------------------
 * B) Admin “Run now” — Firestore trigger on adminTasks/weeklySnapshot
 * ------------------------------------------------------------------- */
exports.onWeeklySnapshotRequested = functions.firestore
  .document("adminTasks/weeklySnapshot")
  .onWrite(async (change) => {
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return;

    const tz = (after.params && after.params.tz) || "America/New_York";
    const dueDay = (after.params && after.params.dueDay) || 15;

    // If a specific month was passed, use its current Monday series starter;
    // otherwise default to "this" Monday in TZ.
    let monday = currentMondayInTZ(tz);
    if (after.params && after.params.month) {
      // Use the first Monday <= today within that month when running manually.
      const [Y, M] = String(after.params.month).split("-").map(Number);
      const first = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
      first.setFullYear(Y, M - 1, 1);
      first.setHours(0, 0, 0, 0);
      // advance to Monday
      const dow = first.getDay();
      const diff = (dow === 0 ? 1 : 8 - dow) % 7;
      first.setDate(first.getDate() + (dow === 1 ? 0 : diff));
      monday = first;
    }

    const mondayKey = ymdOf(monday);
    const monthKey = ymOf(monday);

    await computeAndUpsertWeek({ mondayKey, monthKey, tz, dueDay });

    await change.after.ref.set(
      { lastProcessedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  });

/* -------------------------------------------------------------------
 * C) Follow-Ups Cohort Generator (real logic)
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

/** Determine if client should be in the follow-up cohort for this anchor */
function computeFollowUpItemForClient(clientDoc, anchorDate) {
  const clientId = clientDoc.id;
  const client = clientDoc.data();

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

  // Payments AFTER initial payment date, and <= anchor date
  const allPayments = Array.isArray(client.payments) ? client.payments : [];
  const filteredPays = allPayments
    .map((p) => ({
      amount: Number(p.amount || 0),
      date: toDate(p.date),
    }))
    .filter((p) => p.amount > 0 && p.date);

  const paymentsAfterInitial = filteredPays
    .filter((p) => {
      if (initialPaymentDate && p.date <= initialPaymentDate) return false;
      if (p.date > anchorDate) return false;
      return true;
    })
    .sort((a, b) => a.date - b.date);

  // Build months up to anchor, capped by collectibleCap
  const months = [];
  let expectedAccum = 0;
  const cutoff = new Date(anchorDate);
  let cursor = new Date(firstDueDate);
  let guard = 0;

  while (
    cursor <= cutoff &&
    expectedAccum < collectibleCap &&
    guard < 120 // safety
  ) {
    if (!monthIsSkipped(cursor)) {
      const amt = getInstallmentAmountForDate(client, cursor);
      if (expectedAccum + amt > collectibleCap) break;
      months.push(new Date(cursor));
      expectedAccum += amt;
    }
    cursor.setMonth(cursor.getMonth() + 1);
    guard++;
  }

  // If this cohort's due month is not in the schedule, nothing is due this month
  const monthHasDue = months.some((m) => ymKey(m) === dueMonthKey);
  if (!monthHasDue) return null;

  // FIFO allocate payments across months
  const pool = paymentsAfterInitial.map((p) => ({
    amount: p.amount,
    date: p.date,
  }));

  let multiMonthPastDue = false;
  let includeThisMonth = false;
  let pendingForThisMonth = 0;

  for (const m of months) {
    const mKey = ymKey(m);
    const amt = getInstallmentAmountForDate(client, m);
    let paid = 0;

    for (const p of pool) {
      if (p.amount <= 0) continue;
      const take = Math.min(amt - paid, p.amount);
      paid += take;
      p.amount -= take;
      if (paid >= amt) break;
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

  // Respect "only clients that missed the CURRENT month, not those owing >1 month"
  if (!includeThisMonth || multiMonthPastDue) {
    return null;
  }

  // Build follow-up row
  const clientName = `${client.firstName || ""} ${client.lastName || ""}`.trim() || "Unknown";
  const myCaseLink = client.myCaseLink || null;

  return {
    clientId,
    clientName,
    myCaseLink,
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
async function overwriteCohortItems(cohortId, items) {
  const db = admin.firestore();
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

    let payload = item;
    if (existing) {
      payload = { ...item };
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

  // 3) Remove items for clients that no longer qualify this month.
  existingSnap.forEach((doc) => {
    if (!newIds.has(doc.id)) {
      batch.delete(doc.ref);
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
  const db = admin.firestore();

  const anchorStr = data && data.anchorDate ? String(data.anchorDate) : null;
  const anchor = anchorStr ? new Date(anchorStr) : new Date();
  if (isNaN(anchor.getTime())) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Invalid anchorDate: ${anchorStr}`
    );
  }

  const cohortId = ymOf(anchor);

  // Load all clients
  const snap = await db.collection("clients").get();
  const docs = snap.docs;

  const items = [];
  for (const doc of docs) {
    const item = computeFollowUpItemForClient(doc, anchor);
    if (item) {
      items.push(item);
    }
  }

  // Overwrite cohort items with fresh list
  await overwriteCohortItems(cohortId, items);

  return {
    ok: true,
    cohortId,
    total: items.length,
    anchorDate: anchorStr || anchor.toISOString().slice(0, 10),
  };
});