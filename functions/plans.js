// functions/plans.js
// Server-side copy of src/billing/plans.js (planViews / scheduleForPlan). The web app
// and Cloud Functions are built separately, so the logic is duplicated; keep them in
// step. functions/plans.test.js checks the same cases as src/billing/plans.test.js.

const NO_DOWN_PAYMENT = "1900-01-01";

function sortedPlans(client) {
  const plans = Array.isArray(client && client.plans) ? client.plans.filter(Boolean) : [];
  return plans.slice().sort((a, b) => String(a.startDate || "").localeCompare(String(b.startDate || "")));
}

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

function scheduleForPlan(plan) {
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
function cleanAdjustment(plan, { amount, start, months, note = "", by = "" } = {}) {
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
function withAdjustment(plan, adjustment) {
  return { ...plan, adjustments: [...((plan && plan.adjustments) || []), cleanAdjustment(plan, adjustment)] };
}

/** The plan without its adjustment number `index`. */
function withoutAdjustment(plan, index) {
  return { ...plan, adjustments: ((plan && plan.adjustments) || []).filter((_, i) => i !== index) };
}

/** A plan's schedule (adjustments included). */
function planSchedule(plan) {
  // An older saved schedule is used only until the plan has adjustments of its own.
  if (Array.isArray(plan && plan.schedule) && plan.schedule.length && !((plan.adjustments || []).length)) return plan.schedule;
  return scheduleForPlan(plan);
}

function planIndexForPayment(payment, plans) {
  if (payment && payment.kind === "initial") return 0;
  const id = String((payment && payment.invoiceId) ?? "");
  const i = plans.findIndex((p) => String(p.invoiceId) === id);
  return i >= 0 ? i : 0;
}

function planViews(client) {
  const plans = sortedPlans(client);
  if (plans.length <= 1) return [client];
  const buckets = plans.map(() => []);
  for (const p of client.payments || []) buckets[planIndexForPayment(p, plans)].push(p);
  return plans.map((plan, i) => {
    const base = {
      ...client, planIndex: i, planCount: plans.length,
      planInvoiceId: String(plan.invoiceId), planInvoiceNumber: plan.invoiceNumber || "",
      plans: [plan], // a view is single-plan
      payments: buckets[i],
    };
    if (i === 0) return base;
    return {
      ...base,
      invoiceTotal: Number(plan.total || 0), invoiceBaseTotal: undefined,
      initialPaymentAmount: 0, initialPaymentDate: NO_DOWN_PAYMENT,
      firstInstallmentDate: plan.startDate, expectedAnchor: null,
      installmentAmount: Number(plan.monthlyAmount || 0), installmentSchedule: planSchedule(plan),
      invoiceAdjustments: [], paymentPromise: null,
    };
  });
}

/** The plan view a payment to `invoiceId` belongs to (first plan when unknown). */
function viewForInvoice(client, invoiceId) {
  const views = planViews(client);
  return views.find((v) => v.planInvoiceId === String(invoiceId)) || views[0];
}

/**
 * Billing tagged a NEW invoice (added in MyCase after setup) as an installment invoice:
 * it becomes its own plan next to the client's existing one(s).
 * invoice: mirror invoice { id, number, total, dueDate }. Returns the new plans array.
 * Throws with a message billing can act on.
 */
function plansWithNewInvoice(client, invoice, { monthlyAmount, startDate } = {}) {
  const existing = Array.isArray(client.plans) ? client.plans.filter(Boolean) : [];
  // A client created from intake has no plan yet: this invoice becomes its first one.
  // So is one marked "paid in full, no plan needed" that later gets an installment invoice.
  if (!existing.length && !client.awaitingPlan && !client.noPlanNeeded) throw new Error("This client's main plan is not set up yet.");
  if (existing.some((p) => String(p.invoiceId) === String(invoice.id))) {
    throw new Error(`Invoice ${invoice.number || invoice.id} is already a plan.`);
  }
  const monthly = Number(monthlyAmount);
  if (!Number.isFinite(monthly) || monthly <= 0) throw new Error(`Enter the monthly amount for invoice ${invoice.number || invoice.id}.`);
  if (Number(invoice.total) > 0 && monthly > Number(invoice.total)) {
    throw new Error(`The monthly amount is more than invoice ${invoice.number || invoice.id}'s total.`);
  }
  const start = startDate || invoice.dueDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || "")) throw new Error(`Enter a first installment date for invoice ${invoice.number || invoice.id}.`);
  return [...existing, {
    invoiceId: String(invoice.id), invoiceNumber: invoice.number || "", total: Number(invoice.total || 0),
    monthlyAmount: monthly, startDate: start,
  }];
}

/**
 * The first plan of a client created from intake also fills the single-plan fields the
 * rest of the app reads (total, first installment, monthly amount via the schedule).
 */
function firstPlanFields(client, plan) {
  return {
    invoiceTotal: Number(client.initialPaymentAmount || 0) + Number(plan.total || 0),
    firstInstallmentDate: plan.startDate,
    installmentAmount: Number(plan.monthlyAmount),
    installmentSchedule: scheduleForPlan(plan),
    awaitingPlan: false,
    noPlanNeeded: false,
  };
}

module.exports = { cleanAdjustment, withAdjustment, withoutAdjustment, planSchedule, firstPlanFields, sortedPlans, scheduleForPlan, planIndexForPayment, planViews, viewForInvoice, plansWithNewInvoice };
