// src/billing/plans.js
//
// Multiple installment plans per case (e.g. the main fee plus a removal-defense plan).
//
// Every billing calculation in the app was written for ONE plan per client. Rather than
// rewrite each of them, a multi-plan client is split into one "plan view" per installment
// invoice. Each view is shaped exactly like a single-plan client (its own total, monthly
// amount, start date and only the payments made to that invoice), the existing
// calculation runs unchanged on each view, and the results are combined.
//
// A client with zero or one plan is returned as-is, so existing clients are unaffected.
//
// Keep planViews in step with functions/plans.js (server-side copy).

/** Installment plans, earliest start first. */
export function sortedPlans(client) {
  const plans = Array.isArray(client?.plans) ? client.plans.filter(Boolean) : [];
  return plans.slice().sort((a, b) => String(a.startDate || "").localeCompare(String(b.startDate || "")));
}

export const isMultiPlan = (client) => sortedPlans(client).length > 1;

// A plan is its normal monthly amount from its start month, plus billing's adjustments
// (e.g. "$350 the first month", "$1,000 for 6 months", "$450 from March on"). The billing
// calculations read the amount ONLY from a schedule (else $500) and, where two entries
// cover a month, use the one that started first. So the schedule is built here as
// back-to-back entries with no overlap: every report then reads adjustments correctly.
// Later adjustments win over earlier ones for the months they share.
const pad2 = (n) => String(n).padStart(2, "0");
const isYM = (s) => /^\d{4}-\d{2}$/.test(String(s || ""));
const ymOf = (s) => String(s || "").slice(0, 7);
const monthIndex = (ym) => { const [y, m] = ym.split("-").map(Number); return y * 12 + (m - 1); };
const ymFromIndex = (i) => `${Math.floor(i / 12)}-${pad2((i % 12) + 1)}`;
const lastDayOf = (ym) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${pad2(new Date(y, m, 0).getDate())}`; };
const HORIZON_MONTHS = 240; // far enough that the plan always ends by its total first

export function scheduleForPlan(plan) {
  const start = ymOf(plan && plan.startDate);
  if (!isYM(start)) return [];
  const s0 = monthIndex(start);
  const amounts = new Array(HORIZON_MONTHS).fill(Number(plan.monthlyAmount || 0));
  const notes = new Array(HORIZON_MONTHS).fill(`Plan for MyCase invoice ${plan.invoiceNumber || plan.invoiceId}`);
  for (const a of plan.adjustments || []) {
    if (!a || !isYM(a.start)) continue;
    const from = Math.max(0, monthIndex(a.start) - s0);
    const to = a.months ? Math.min(HORIZON_MONTHS, monthIndex(a.start) - s0 + Number(a.months)) : HORIZON_MONTHS;
    for (let i = from; i < to; i++) {
      amounts[i] = Number(a.amount);
      notes[i] = a.note ? `Adjustment: ${a.note}` : "Adjustment";
    }
  }
  const runs = [];
  for (let i = 0; i < HORIZON_MONTHS; i++) {
    const last = runs[runs.length - 1];
    if (last && last.amount === amounts[i] && last.note === notes[i]) last.to = i;
    else runs.push({ amount: amounts[i], note: notes[i], from: i, to: i });
  }
  // Starts on the 1st so the month's due date (the 15th) is inside; the last entry runs to
  // the horizon, earlier ones end on their last month's last day.
  return runs.map((r, k) => ({
    amount: r.amount,
    start: `${ymFromIndex(s0 + r.from)}-01`,
    end: k === runs.length - 1 ? `${ymFromIndex(s0 + HORIZON_MONTHS)}-01` : lastDayOf(ymFromIndex(s0 + r.to)),
    note: r.note,
  }));
}

/**
 * Checks one adjustment billing entered and returns it cleaned.
 *   amount: monthly amount for those months; start: "YYYY-MM";
 *   months: how many months (blank = from then on); note: reason (optional)
 */
export function cleanAdjustment(plan, { amount, start, months, note = "", by = "" } = {}) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Enter the adjusted monthly amount.");
  if (Number(plan && plan.total) > 0 && amt > Number(plan.total)) throw new Error("The adjusted amount is more than the plan total.");
  if (!isYM(start)) throw new Error("Choose the month the adjustment starts.");
  const planStart = ymOf(plan && plan.startDate);
  if (isYM(planStart) && start < planStart) throw new Error("The adjustment starts before the plan does.");
  const n = months === "" || months === null || months === undefined ? null : Number(months);
  if (n !== null && (!Number.isInteger(n) || n < 1 || n > 120)) {
    throw new Error("Enter how many months (1 or more), or leave it blank for \"from then on\".");
  }
  const out = { amount: amt, start, months: n, note: String(note || "").trim(), at: new Date().toISOString() };
  if (by) out.by = by;
  return out;
}

/** The plan with one more adjustment (validated). */
export function withAdjustment(plan, adjustment) {
  return { ...plan, adjustments: [...((plan && plan.adjustments) || []), cleanAdjustment(plan, adjustment)] };
}

/** The plan without its adjustment number `index`. */
export function withoutAdjustment(plan, index) {
  return { ...plan, adjustments: ((plan && plan.adjustments) || []).filter((_, i) => i !== index) };
}

/** A plan's schedule (adjustments included). */
export function planSchedule(plan) {
  // An older saved schedule is used only until the plan has adjustments of its own.
  if (Array.isArray(plan && plan.schedule) && plan.schedule.length && !((plan.adjustments || []).length)) return plan.schedule;
  return scheduleForPlan(plan);
}

/** The monthly amount in force on `on` (a Date) for a schedule; the latest started entry. */
export function monthlyOn(schedule, on = new Date()) {
  const ymd = `${on.getFullYear()}-${String(on.getMonth() + 1).padStart(2, "0")}-${String(on.getDate()).padStart(2, "0")}`;
  const started = (schedule || []).filter((e) => String(e.start || "") <= ymd)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const e = started[started.length - 1] || (schedule || [])[0];
  return e ? Number(e.amount || 0) : 0;
}

/** "From this month on, $X a month": an adjustment with no end. */
export function withMonthlyChange(plan, { amount, effectiveMonth, note = "", by = "" }) {
  return withAdjustment(plan, { amount, start: effectiveMonth, months: null, note, by });
}

/**
 * Plans whose adjustments billing manages in the app: every plan of a client created from
 * MyCase; on older (hand-entered) clients only the extra plans, because their main plan's
 * schedule is still edited in Installment Settings.
 */
export function managedPlanIds(client) {
  const plans = sortedPlans(client);
  const fromMyCase = client?.source === "mycase";
  return plans.filter((_, i) => fromMyCase || i > 0).map((p) => String(p.invoiceId));
}

/** What to save after billing changed a plan: the plans, and the main plan's schedule if managed. */
export function planUpdates(client, plans) {
  const primary = sortedPlans({ plans })[0];
  const out = { plans };
  if (primary && client?.source === "mycase") out.installmentSchedule = scheduleForPlan(primary);
  return out;
}

// Payments only count as installments when dated after initialPaymentDate, and none
// count when it is missing. A later plan has no down payment of its own, so it gets a
// date before any real payment.
const NO_DOWN_PAYMENT = "1900-01-01";

// A service billed as its own plan (plan.service) replaces the hand-entered adjustment billing
// used for it before ("Removal Defense", "Derivative add-on" on the Invoice section); the
// first plan's view leaves those adjustments out so the service is not counted twice.
const SERVICE_ADJUSTMENT_TYPE = { "Removal defense": "REMOVAL_DEFENSE", Derivative: "DERIVATIVE_ADD_ON" };
function adjustmentsWithoutPlannedServices(client, plans) {
  const list = Array.isArray(client.invoiceAdjustments) ? client.invoiceAdjustments : [];
  const covered = new Set(plans.map((p) => SERVICE_ADJUSTMENT_TYPE[p.service]).filter(Boolean));
  return covered.size ? list.filter((a) => !covered.has(String(a?.type || "").toUpperCase())) : list;
}

/**
 * Which plan a recorded payment belongs to: its invoice's plan if it has one;
 * otherwise the first plan (initial payments, hand-entered payments, other invoices).
 */
export function planIndexForPayment(payment, plans) {
  if (payment?.kind === "initial") return 0;
  const i = plans.findIndex((p) => String(p.invoiceId) === String(payment?.invoiceId ?? ""));
  return i >= 0 ? i : 0;
}

/**
 * One single-plan-shaped client per installment plan. The first plan keeps every
 * legacy field (billing may have edited them on the Invoice section); later plans get
 * only their own figures, with no initial payment, adjustments, schedule or promise.
 */
export function planViews(client) {
  const plans = sortedPlans(client);
  if (plans.length <= 1) return [client];

  const buckets = plans.map(() => []);
  for (const p of client.payments || []) buckets[planIndexForPayment(p, plans)].push(p);

  const firstAdjustments = adjustmentsWithoutPlannedServices(client, plans);
  return plans.map((plan, i) => {
    const base = {
      ...client,
      invoiceAdjustments: firstAdjustments,
      planIndex: i,
      planCount: plans.length,
      planInvoiceId: String(plan.invoiceId),
      planInvoiceNumber: plan.invoiceNumber || "",
      // A view holds only its own plan, so plan-aware code treats it as single-plan.
      plans: [plan],
      payments: buckets[i],
    };
    if (i === 0) return base;
    return {
      ...base,
      invoiceTotal: Number(plan.total || 0),
      invoiceBaseTotal: undefined,
      initialPaymentAmount: 0,
      initialPaymentDate: NO_DOWN_PAYMENT,
      firstInstallmentDate: plan.startDate,
      expectedAnchor: null,
      installmentAmount: Number(plan.monthlyAmount || 0),
      installmentSchedule: planSchedule(plan),
      invoiceAdjustments: [],
      paymentPromise: null,
    };
  });
}

/* ------------------------------ combining results ------------------------------ */

// How a field combines across plans. Anything not listed comes from the plan that
// is furthest behind (most missed months, then largest amount due), so labels such
// as "60+ days past due" describe the worst plan.
const MAX = /missed|monthsbehind|aging|days|^months/i;
const ALL = /paidinfull|^iscurrent$|^current$/i;
const EARLIEST = /oldest|first/i;
const LATEST = /^last|latest/i;

function severity(s) {
  const missed = Number(s?.missedMonths ?? s?.computedMissedMonths ?? 0) || 0;
  const due = Number(s?.amountDue ?? s?.computedAmountDue ?? 0) || 0;
  return missed * 1e9 + due;
}

const dateValue = (v) => {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "object" && v.date) return dateValue(v.date);
  const t = typeof v === "string" ? Date.parse(v.length === 10 ? v + "T00:00:00" : v) : NaN;
  return Number.isNaN(t) ? null : t;
};

/** Combine per-plan results of the same calculation into one client-level result. */
export function mergeSnapshots(snaps) {
  const list = snaps.filter((s) => s && typeof s === "object");
  if (list.length <= 1) return list[0];
  const worst = list.reduce((w, s) => (severity(s) > severity(w) ? s : w), list[0]);
  const out = { ...worst };
  const keys = new Set(list.flatMap((s) => Object.keys(s)));
  for (const key of keys) {
    const vals = list.map((s) => s[key]).filter((v) => v !== undefined);
    if (!vals.length) continue;
    const sample = vals.find((v) => v !== null);
    if (typeof sample === "number") {
      const nums = vals.map(Number).filter((n) => !Number.isNaN(n));
      out[key] = MAX.test(key) ? Math.max(...nums) : nums.reduce((a, b) => a + b, 0);
    } else if (typeof sample === "boolean") {
      out[key] = ALL.test(key) ? vals.every(Boolean) : vals.some(Boolean);
    } else if (Array.isArray(sample)) {
      out[key] = [...new Set(vals.flat())].sort();
    } else if (EARLIEST.test(key) || LATEST.test(key)) {
      const dated = vals.map((v) => [v, dateValue(v)]).filter(([, t]) => t != null);
      if (dated.length) {
        dated.sort((a, b) => a[1] - b[1]);
        out[key] = (EARLIEST.test(key) ? dated[0] : dated[dated.length - 1])[0];
      }
    }
  }
  return out;
}

/**
 * Run a single-plan calculation for a client and combine across plans.
 * For a single-plan client this is exactly `fn(client)`.
 */
export function withPlans(client, fn) {
  const views = planViews(client);
  if (views.length === 1) return fn(views[0]);
  return mergeSnapshots(views.map((v) => fn(v)));
}

/* ---------------------------- plain-English schedule ---------------------------- */

const monthLabel = (ymd) => {
  const [y, m] = String(ymd).split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
};
const dollars = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/** "$350 Feb 2026 · $500 Mar 2026–Apr 2026 · $1,000 May 2026–Oct 2026 · $500 from Nov 2026" */
export function describeSchedule(schedule) {
  const list = (schedule || []).slice().sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return list.map((e, i) => {
    const from = monthLabel(e.start);
    if (i === list.length - 1) return `${dollars(e.amount)} from ${from}`;
    const to = monthLabel(e.end);
    return `${dollars(e.amount)} ${from === to ? from : `${from}–${to}`}`;
  }).join(" · ");
}
