// functions/mycaseSync.js
//
// Keeps a Firestore mirror of MyCase cases, invoices and payments (from the Azure
// MyCase-Integration /feed/* endpoints) and decides which cases billing must set up.
//
//   mycaseCases/{caseId}       case + openBalance + needsSetup + trackedClientId
//   mycaseInvoices/{invoiceId} one per invoice (drafts included; status says so)
//   mycasePayments/{paymentId} every payment, any status
//
// A case "needs setup" when it is not closed in MyCase, has an unpaid invoice balance,
// and no Collections record points at it. Billing then tags its invoices and enters the
// plan on the Case Setup page, which creates the client record (buildSetupClient).

const { fetchFeedPage, runImport, caseIdFromLink } = require("./mycasePayments");
const { scheduleForPlan, cleanAdjustment } = require("./plans");

const MYCASE_CASE_URL = "https://law-firm-of-moumita-rahman-pllc.mycase.com/court_cases/";
const ROLES = ["initial", "installment", "other"];
const CONSULT_FEE_CENTS = 15000;

const cents = (v) => Math.round(Number(v || 0) * 100);
const isYMD = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/* ------------------------------- mirror rows ------------------------------- */

const FEEDS = {
  cases: { path: "/feed/cases", key: "cases" },
  invoices: { path: "/feed/invoices", key: "invoices" },
  payments: { path: "/feed/payments", key: "payments" },
};

/** Feed row -> mirror document (camelCase, numbers as numbers, ids as strings). */
function toMirrorDoc(kind, r) {
  if (kind === "cases") {
    return {
      id: String(r.id), name: r.name || "", caseNumber: r.case_number || "", status: r.status || "",
      practiceArea: r.practice_area || "", caseStage: r.case_stage || "", billingType: r.billing_type || "",
      openedDate: r.opened_date || null, closedDate: r.closed_date || null,
      clientIds: (r.client_ids || []).map(String), clientNames: r.client_names || [],
      leadAttorneyId: r.lead_attorney_id || null,
      // MyCase's "outstanding_balance" on a flat-fee case is the case's flat fee (it matched
      // the fee typed in the old app on 1,915 of 2,732 linked cases, 11/18). Null otherwise.
      flatFee: r.billing_type === "flat" && Number(r.outstanding_balance) > 0 ? Number(r.outstanding_balance) : null,
    };
  }
  if (kind === "invoices") {
    return {
      id: String(r.id), caseId: r.case_id ? String(r.case_id) : null, number: r.invoice_number || "",
      description: r.description || "", status: r.status || "",
      invoiceDate: r.invoice_date || null, dueDate: r.due_date || null,
      total: Number(r.total_amount || 0), paid: Number(r.paid_amount || 0), balance: Number(r.balance || 0),
    };
  }
  return {
    id: String(r.id), caseId: r.case_id ? String(r.case_id) : null,
    invoiceId: r.invoice_id ? String(r.invoice_id) : null, invoiceNumber: r.invoice_number || "",
    amount: Number(r.amount || 0), date: r.payment_date || null, status: r.status || "",
    type: r.transaction_type || "", clientName: r.client_name || "",
    // The original feed row, so the payment importer can be re-run from the mirror.
    feed: r,
  };
}

/* ------------------------------ setup decisions ------------------------------ */

/**
 * Pre-selected role for an invoice on the setup form. Billing confirms or changes it.
 * Intake marks the initial-payment invoice "IP"; the $150 invoice is the old
 * consultation fee. Anything else is left for billing to choose.
 */
function defaultInvoiceRole(inv) {
  const d = String(inv.description || "");
  if (/^\s*IP\b/i.test(d) || /initial\s+payment/i.test(d)) return "initial";
  if (cents(inv.total) === CONSULT_FEE_CENTS || /consult/i.test(d)) return "other";
  if (/install|monthly|payment\s*plan/i.test(d)) return "installment";
  return null;
}

/**
 * Computed fields stored on a mirrored case.
 *   needsSetup  open, owes money, not in Collections: billing sets it up on Case Setup
 *   autoCreate  a new intake case (initial-payment invoice only): the sync creates it
 *   needsPlan   in Collections but still waiting for billing's monthly plan
 * trackedClients: the client records pointing at this case (or just their ids).
 */
/**
 * Intake names a case "Potential Case: …" (or "Potential Client:", "Case Evaluation:")
 * until the person signs; such a case may already carry a quote or consultation invoice.
 */
function isPotentialCase(caseDoc) {
  const name = String((caseDoc && caseDoc.name) || "");
  const stage = String((caseDoc && caseDoc.caseStage) || "");
  return /^\s*(potential\s+(case|client)|case\s+evaluation)\b/i.test(name) || /\bpotential\b/i.test(stage);
}

/** Open in MyCase but marked closed by its stage or name (not updated in MyCase yet). */
function looksClosed(caseDoc) {
  const name = String((caseDoc && caseDoc.name) || "");
  const stage = String((caseDoc && caseDoc.caseStage) || "");
  return /^\s*closed\b/i.test(stage) || /^\s*[[(]?\s*closed\b/i.test(name);
}

/**
 * Which list a case belongs to on Case Setup: "potential" (not a client yet), "closed"
 * (marked closed by stage or name), else "client".
 */
function setupGroup(caseDoc) {
  if (isPotentialCase(caseDoc)) return "potential";
  if (looksClosed(caseDoc)) return "closed";
  return "client";
}

/** Latest successful payment date among a case's mirrored payments, or null. */
function lastPaymentDate(payments = []) {
  const dates = payments.filter((p) => p.status === "success" && Number(p.amount) > 0 && isYMD(p.date)).map((p) => p.date).sort();
  return dates[dates.length - 1] || null;
}

function caseFlags(caseDoc, invoices, trackedClients = [], payments = null) {
  const openBalanceCents = invoices
    .filter((i) => i.status !== "draft")
    .reduce((s, i) => s + Math.max(0, cents(i.total) - cents(i.paid)), 0);
  const ids = trackedClients.map((c) => (typeof c === "object" ? c.id : c));
  const tracked = ids.length ? (ids.length === 1 ? ids[0] : "multiple") : null;
  const open = caseDoc.status !== "closed";
  const autoCreate = !tracked && shouldAutoCreate(caseDoc, invoices);
  const only = trackedClients.length === 1 && typeof trackedClients[0] === "object" ? trackedClients[0] : null;
  return {
    openBalance: openBalanceCents / 100,
    invoiceCount: invoices.filter((i) => i.status !== "draft").length,
    trackedClientId: tracked,
    needsSetup: open && openBalanceCents > 0 && !tracked && !autoCreate,
    autoCreate,
    needsPlan: open && !!(only && only.awaitingPlan),
    setupGroup: setupGroup(caseDoc),
    flatFee: caseDoc.flatFee || null,
    uninvoicedFee: uninvoicedFee(caseDoc, invoices),
    // Only when the caller looked the payments up; otherwise the stored value stays.
    ...(payments ? { lastPaymentDate: lastPaymentDate(payments) } : {}),
  };
}

/* -------------------------------- case types -------------------------------- */

// The app's case types (same list as src/CreateClient.js).
const CASE_TYPES = [
  "VAWA SPOUSE", "PARENT VAWA", "CHILD VAWA", "T VISA", "U VISA", "MARRIAGE AOS",
  "N400", "I751 REGULAR", "I751 ECB", "I90", "ASYLUM", "REMOVAL DEFENSE",
];

// MyCase practice area -> app case type. Built from how existing clients were typed
// (snapshot 2026-11-12): each row is what the team chose 90%+ of the time. Areas that
// were typed several ways ("AOS", "NVC Processing", blank) are left for billing to pick.
const PRACTICE_AREA_TYPES = {
  "VAWASPOUSE": "VAWA SPOUSE", "VAWA": "VAWA SPOUSE", "WIDOWERI360": "VAWA SPOUSE",
  "VAWAPARENT": "PARENT VAWA", "PARENTVAWA": "PARENT VAWA",
  "VAWACHILD": "CHILD VAWA", "CHILDVAWA": "CHILD VAWA",
  "TVISA": "T VISA", "TVISALABOR": "T VISA", "TVISADV": "T VISA", "TVISASMUGGLING": "T VISA",
  "UVISA": "U VISA",
  "MARRIAGEAOS": "MARRIAGE AOS",
  "N400": "N400",
  "I751REGULAR": "I751 REGULAR", "I751DIVORCEWAIVER": "I751 REGULAR",
  "I751ECB": "I751 ECB",
  "I90": "I90",
  "ASYLUM": "ASYLUM",
  "REMOVALDEFENSE": "REMOVAL DEFENSE",
};

/** App case type for a MyCase practice area, or "" when billing has to choose. */
function mapCaseType(practiceArea) {
  const key = String(practiceArea || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return PRACTICE_AREA_TYPES[key] || "";
}

/**
 * The case type comes from MyCase only (the team does not edit it in the app): the app's
 * name for the practice area when it has one, else MyCase's own practice area in capitals,
 * else "" until a practice area is set in MyCase (the sync then fills it in).
 */
function caseTypeFromMyCase(practiceArea) {
  const raw = String(practiceArea || "").trim();
  if (!raw || /^[-\s]+$/.test(raw)) return "";
  return mapCaseType(raw) || raw.toUpperCase();
}

/** Fee not invoiced yet: MyCase's flat fee minus the case's invoices (consultation fee aside). */
function uninvoicedFee(caseDoc, invoices) {
  const fee = cents(caseDoc && caseDoc.flatFee);
  if (!fee) return 0;
  const invoiced = invoices.filter((i) => i.status !== "draft" && !isConsultFee(i)).reduce((s, i) => s + cents(i.total), 0);
  return Math.max(0, fee - invoiced) / 100;
}

/* ------------------------------ intake clients ------------------------------ */

// Cases opened on or after this date are created in Collections automatically as soon as
// intake's initial-payment invoice is in MyCase. Older open cases stay on Case Setup.
const AUTO_CREATE_FROM = "2026-11-01";

const isConsultFee = (inv) => cents(inv.total) === CONSULT_FEE_CENTS || /consult/i.test(String(inv.description || ""));

/**
 * The intake invoice of a brand-new case: the case's only invoice (consultation fee
 * aside), unless its description says it is an installment invoice. Returns null when
 * the case is not in that state (no invoice yet, or billing already added more).
 */
function intakeInvoice(invoices) {
  const active = invoices.filter((i) => i.status !== "draft" && !isConsultFee(i));
  if (active.length !== 1) return null;
  return defaultInvoiceRole(active[0]) === "installment" ? null : active[0];
}

/** Should this untracked case be created automatically? */
function shouldAutoCreate(caseDoc, invoices) {
  if (!caseDoc || caseDoc.status === "closed") return false;
  // A potential client's quote is not an intake invoice: wait until the case is renamed.
  if (isPotentialCase(caseDoc) || looksClosed(caseDoc)) return false;
  const ip = intakeInvoice(invoices);
  if (!ip) return false;
  const opened = isYMD(caseDoc.openedDate) ? caseDoc.openedDate : ip.invoiceDate;
  return isYMD(opened) && opened >= AUTO_CREATE_FROM;
}

/** Client fields shared by intake-created and billing-set-up records (current app format). */
function baseClientFields(caseDoc, caseType, iso) {
  const { firstName, lastName } = splitName(caseDoc.clientNames && caseDoc.clientNames[0]);
  return {
    // Names and case types are kept in capitals, as the team types them.
    firstName: (firstName || caseDoc.name || "Unknown").toUpperCase(),
    lastName: lastName.toUpperCase(),
    mycaseClientNames: caseDoc.clientNames || [],
    caseTitle: caseDoc.name || "",
    caseType,
    caseStatus: "ACTIVE",
    status: "active",
    myCaseLink: MYCASE_CASE_URL + caseDoc.id,
    mycaseCaseId: caseDoc.id,
    payments: [],
    createdAt: iso,
  };
}

/** Last successful payment date on the given invoices, else the earliest invoice date. */
function initialDateFor(initialInvoices, payments) {
  const ids = new Set(initialInvoices.map((i) => String(i.id)));
  const paid = payments
    .filter((p) => p.status === "success" && p.amount > 0 && ids.has(String(p.invoiceId)) && isYMD(p.date))
    .map((p) => p.date).sort();
  const issued = initialInvoices.map((i) => i.invoiceDate).filter(isYMD).sort();
  return paid[paid.length - 1] || issued[0] || null;
}

/**
 * The client record for a new case that so far has only intake's initial-payment invoice.
 * It has no monthly plan yet (firstInstallmentDate null, which the app shows as current
 * with nothing due); billing adds the plan once the installment invoice exists.
 */
function buildIntakeClient({ caseDoc, invoices, payments = [], now = new Date() }) {
  const ip = intakeInvoice(invoices);
  if (!ip) throw new Error("This case has no single initial-payment invoice.");
  const iso = now.toISOString();
  const roles = { [ip.id]: "initial" };
  for (const inv of invoices) if (inv.status !== "draft" && isConsultFee(inv)) roles[inv.id] = "other";
  return {
    ...baseClientFields(caseDoc, caseTypeFromMyCase(caseDoc.practiceArea), iso),
    // The whole flat fee from MyCase, so what is not invoiced yet still shows as owed;
    // the initial payment is the intake invoice.
    invoiceTotal: Math.max(Number(caseDoc.flatFee || 0), Number(ip.total || 0)),
    mycaseFlatFee: caseDoc.flatFee || null,
    initialPaymentAmount: Number(ip.total || 0),
    initialPaymentDate: initialDateFor([ip], payments),
    firstInstallmentDate: null,
    installmentSchedule: [],
    invoiceUpdatedAt: iso,
    invoiceUpdatedBy: "MyCase intake",
    invoiceRoles: roles,
    plans: [],
    awaitingPlan: true,
    source: "mycase",
    autoCreatedAt: iso,
  };
}

function splitName(full) {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || "", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/**
 * Validates billing's setup and builds the new client document.
 *   roles: { [invoiceId]: "initial" | "installment" | "other" } for every non-draft invoice
 *   plans: [{ invoiceId, monthlyAmount, startDate }] one per installment invoice
 *   payments: mirrored payments of the case (to place the down-payment date)
 * Throws an Error whose message is safe to show billing.
 *
 * The existing app understands one plan per client, so the earliest plan also fills the
 * legacy fields (invoiceTotal, firstInstallmentDate, installmentAmount). Every plan is
 * kept in plans[] for the multi-plan screens that come next.
 */
function buildSetupClient({ caseDoc, invoices, roles, plans, payments = [], by, now = new Date() }) {
  if (!caseDoc) throw new Error("Case not found in the MyCase mirror.");
  const active = invoices.filter((i) => i.status !== "draft");
  if (!active.length) throw new Error("This case has no invoices to set up.");

  const cleanRoles = {};
  for (const inv of active) {
    const role = roles && roles[inv.id];
    if (!ROLES.includes(role)) throw new Error(`Choose a type for invoice ${inv.number || inv.id}.`);
    cleanRoles[inv.id] = role;
  }
  const installments = active.filter((i) => cleanRoles[i.id] === "installment");
  if (!installments.length) throw new Error("Mark at least one invoice as the installment invoice.");

  const cleanPlans = installments.map((inv) => {
    const p = (plans || []).find((x) => String(x.invoiceId) === inv.id) || {};
    const monthly = Number(p.monthlyAmount);
    if (!Number.isFinite(monthly) || monthly <= 0) throw new Error(`Enter the monthly amount for invoice ${inv.number || inv.id}.`);
    if (monthly > inv.total) throw new Error(`The monthly amount for invoice ${inv.number || inv.id} is more than the invoice total.`);
    const startDate = p.startDate || inv.dueDate;
    if (!isYMD(startDate)) throw new Error(`Enter a start date for invoice ${inv.number || inv.id}.`);
    const plan = { invoiceId: inv.id, invoiceNumber: inv.number || "", total: inv.total, monthlyAmount: monthly, startDate };
    // Adjustments billing entered with the plan ("$350 the first month", "$1,000 for 6 months").
    const adjustments = (Array.isArray(p.adjustments) ? p.adjustments : []).map((a) => {
      try { return cleanAdjustment(plan, { ...a, by }); } catch (e) { throw new Error(`Invoice ${inv.number || inv.id}: ${e.message}`); }
    });
    return adjustments.length ? { ...plan, adjustments } : plan;
  }).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const primary = cleanPlans[0];

  const initialInvoices = active.filter((i) => cleanRoles[i.id] === "initial");
  const initialTotal = initialInvoices.reduce((s, i) => s + cents(i.total), 0) / 100;
  // Pages count a payment toward installments only when it is strictly after this date.
  const initialPaymentDate = initialDateFor(initialInvoices, payments);

  const iso = now.toISOString();
  return {
    ...baseClientFields(caseDoc, caseTypeFromMyCase(caseDoc.practiceArea), iso),

    invoiceTotal: initialTotal + primary.total,
    initialPaymentAmount: initialTotal,
    initialPaymentDate,
    firstInstallmentDate: primary.startDate,
    installmentAmount: primary.monthlyAmount,
    // The app reads the monthly amount only from the schedule (else $500).
    installmentSchedule: scheduleForPlan(primary),
    invoiceUpdatedAt: iso,
    invoiceUpdatedBy: by || "Case Setup",

    invoiceRoles: cleanRoles,
    plans: cleanPlans,
    awaitingPlan: false,
    source: "mycase",
    setupBy: by || null,
    setupAt: iso,
  };
}

/* --------------------------------- runners --------------------------------- */

/** Pull one feed into the mirror. Returns rows read and case ids touched. */
async function syncMirror({ store, kind, baseUrl, token, fetchImpl, pageLimit = 1000, maxPages = 200 }) {
  const { path, key } = FEEDS[kind];
  let cursor = await store.getCursor(kind);
  const touched = new Set();
  let rows = 0;
  for (let page = 0; page < maxPages; page++) {
    const feed = await fetchFeedPage({ baseUrl, token, cursor, limit: pageLimit, fetchImpl, path });
    const list = feed[key] || [];
    await store.upsertMirror(kind, list);
    rows += list.length;
    for (const r of list) {
      const caseId = kind === "cases" ? r.id : r.case_id;
      if (caseId) touched.add(String(caseId));
    }
    if (feed.next_cursor) {
      cursor = feed.next_cursor;
      await store.saveCursor(cursor, kind);
    }
    if (!feed.has_more) break;
  }
  return { rows, touched };
}

/**
 * One hourly pass: cases and invoices first (so new cases show on Case Setup), then
 * payments (mirrored, and applied to tracked clients).
 */
async function runAll({ store, baseUrl, token, fetchImpl, log = console }) {
  const cases = await syncMirror({ store, kind: "cases", baseUrl, token, fetchImpl });
  const invoices = await syncMirror({ store, kind: "invoices", baseUrl, token, fetchImpl });
  const touched = new Set([...cases.touched, ...invoices.touched]);
  const clientsByCaseId = await store.loadClientsByCaseId();
  const flagged = await store.refreshCases([...touched], clientsByCaseId);
  // New intake cases become clients before payments are applied, so their payments count.
  const autoCreated = store.autoCreatePending ? await store.autoCreatePending() : 0;
  const payments = await runImport({ store, baseUrl, token, fetchImpl, log: {} });
  // A case closed (or reopened) in MyCase closes (or reopens) its client here.
  const closures = store.syncCaseClosures ? await store.syncCaseClosures([...touched]) : null;
  const linkIssues = store.refreshLinkIssues ? await store.refreshLinkIssues() : null;
  const stats = { cases: cases.rows, invoices: invoices.rows, casesRefreshed: touched.size, needsSetup: flagged, autoCreated, payments, closures: closures && { closed: closures.closed, reopened: closures.reopened }, linkIssues };
  if (log.info) log.info("MyCase sync", stats);
  return stats;
}

module.exports = {
  FEEDS,
  ROLES,
  CASE_TYPES,
  isPotentialCase,
  looksClosed,
  setupGroup,
  lastPaymentDate,
  AUTO_CREATE_FROM,
  mapCaseType,
  caseTypeFromMyCase,
  uninvoicedFee,
  intakeInvoice,
  shouldAutoCreate,
  buildIntakeClient,
  toMirrorDoc,
  defaultInvoiceRole,
  caseFlags,
  buildSetupClient,
  splitName,
  syncMirror,
  runAll,
  caseIdFromLink,
};
