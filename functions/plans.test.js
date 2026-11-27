// Run: node --test functions/plans.test.js
// Mirrors the cases in src/billing/plans.test.js for the server-side copy.
const test = require("node:test");
const assert = require("node:assert/strict");
const { planViews, scheduleForPlan, viewForInvoice, plansWithNewInvoice } = require("./plans");
const { computeImport } = require("./mycasePayments");
const { buildSetupClient } = require("./mycaseSync");

const multi = {
  id: "m1", status: "active", invoiceTotal: 6000, initialPaymentAmount: 1500, initialPaymentDate: "2026-01-03",
  firstInstallmentDate: "2026-02-15", installmentAmount: 500,
  installmentSchedule: [{ amount: 500, start: "2026-02-01", end: "2046-02-01", note: "" }],
  invoiceRoles: { 601: "initial", 602: "installment", 902: "installment" },
  plans: [
    { invoiceId: "902", invoiceNumber: "902", total: 3000, monthlyAmount: 300, startDate: "2026-06-15" },
    { invoiceId: "602", invoiceNumber: "602", total: 4500, monthlyAmount: 500, startDate: "2026-02-15" },
  ],
  payments: [
    { amount: 1500, date: "2026-01-03", kind: "initial", invoiceId: "601" },
    { amount: 500, date: "2026-02-15", invoiceId: "602" },
    { amount: 300, date: "2026-06-15", invoiceId: "902" },
  ],
};

test("same split as the web app", () => {
  const [main, rd] = planViews(multi);
  assert.equal(main.planInvoiceId, "602");
  assert.equal(rd.planInvoiceId, "902");
  assert.equal(rd.initialPaymentDate, "1900-01-01");
  assert.deepEqual(rd.installmentSchedule, [{ amount: 300, start: "2026-06-01", end: "2046-06-01", note: "Plan for MyCase invoice 902" }]);
  assert.deepEqual(rd.payments.map((p) => p.amount), [300]);
  const single = { ...multi, plans: [multi.plans[1]] };
  assert.equal(planViews(single)[0], single);
  assert.equal(viewForInvoice(multi, "unknown").planInvoiceId, "602");
});

test("scheduleForPlan starts on the 1st so the first due date (15th) is covered", () => {
  assert.equal(scheduleForPlan({ startDate: "2026-09-20", monthlyAmount: 350, invoiceId: "9" })[0].start, "2026-09-01");
  assert.deepEqual(scheduleForPlan({ startDate: null }), []);
});

test("imported payments record their invoice and allocate to their own plan", () => {
  const feed = (o) => ({ id: "p", status: "success", amount: "300.00", payment_date: "2026-07-15", case_id: "500", ...o });
  const rdPay = computeImport(multi, feed({ invoice_id: "902" }));
  assert.equal(rdPay.clientPayment.invoiceId, "902");
  assert.equal(rdPay.allocationRows.length, 1);
  // Second removal-defense payment pays its 2nd month (July) at $300, not the main plan's $500.
  assert.equal(rdPay.allocationRows[0].dueMonthKey, "2026-07");
  assert.equal(rdPay.allocationRows[0].expectedInstallmentAmount, 300);
  assert.equal(rdPay.allocationRows[0].allocationStatus, "paid");
  assert.equal(rdPay.allocationRows[0].planInvoiceId, "902");
  const mainPay = computeImport(multi, feed({ invoice_id: "602", amount: "500.00", payment_date: "2026-03-15" }));
  assert.equal(mainPay.allocationRows[0].dueMonthKey, "2026-03");
  assert.equal(mainPay.allocationRows[0].planInvoiceId, "602");
});

test("Case Setup writes the monthly amount where the app reads it", () => {
  const doc = buildSetupClient({
    caseDoc: { id: "500", name: "X", status: "open", clientNames: ["A B"] },
    invoices: [{ id: "20", number: "20", status: "sent", total: 4500, paid: 0, dueDate: "2026-02-15" }],
    roles: { 20: "installment" }, plans: [{ invoiceId: "20", monthlyAmount: 350 }],
  });
  assert.deepEqual(doc.installmentSchedule, [{ amount: 350, start: "2026-02-01", end: "2046-02-01", note: "Plan for MyCase invoice 20" }]);
});

const feedRow = (o) => ({ id: "p", status: "success", amount: "300.00", payment_date: "2026-07-15", case_id: "500", ...o });

test("tagging a new invoice as Installment adds it as its own plan", () => {
  const one = { ...multi, plans: [multi.plans[1]], payments: multi.payments.slice(0, 2) };
  const inv = { id: "903", number: "903", total: 2400, dueDate: "2026-09-10" };
  const plans = plansWithNewInvoice(one, inv, { monthlyAmount: 200 });
  assert.equal(plans.length, 2);
  assert.deepEqual(plans[1], { invoiceId: "903", invoiceNumber: "903", total: 2400, monthlyAmount: 200, startDate: "2026-09-10" });
  // A payment on the new invoice lands in that plan, at its own monthly amount.
  const client = { ...one, plans };
  const r = computeImport(client, feedRow({ invoice_id: "903", amount: "200.00", payment_date: "2026-09-10" }));
  assert.equal(r.allocationRows[0].planInvoiceId, "903");
  assert.equal(r.allocationRows[0].dueMonthKey, "2026-09");
  assert.equal(r.allocationRows[0].allocationStatus, "paid");
  // The main plan is untouched.
  assert.equal(viewForInvoice(client, "602").installmentSchedule[0].amount, 500);
});

test("new plan: refuses what billing must fix", () => {
  const one = { ...multi, plans: [multi.plans[1]] };
  const inv = { id: "903", number: "903", total: 2400, dueDate: "" };
  assert.throws(() => plansWithNewInvoice({ plans: [] }, inv, { monthlyAmount: 200, startDate: "2026-09-10" }), /main plan is not set up/);
  assert.throws(() => plansWithNewInvoice(one, { ...inv, id: "602" }, { monthlyAmount: 200, startDate: "2026-09-10" }), /already a plan/);
  assert.throws(() => plansWithNewInvoice(one, inv, { monthlyAmount: 0, startDate: "2026-09-10" }), /monthly amount/);
  assert.throws(() => plansWithNewInvoice(one, inv, { monthlyAmount: 3000, startDate: "2026-09-10" }), /more than invoice/);
  assert.throws(() => plansWithNewInvoice(one, inv, { monthlyAmount: 200 }), /first installment date/);
  assert.equal(plansWithNewInvoice(one, inv, { monthlyAmount: "150", startDate: "2026-10-01" })[1].startDate, "2026-10-01");
});

test("a service with its own plan drops the hand-entered adjustment for it from plan 1", () => {
  const client = {
    invoiceTotal: 10350, initialPaymentAmount: 4350,
    invoiceAdjustments: [{ type: "REMOVAL_DEFENSE", amount: 17500, downPayment: 4000 }, { type: "OTHER", amount: 300 }],
    plans: [
      { invoiceId: "1", total: 6000, monthlyAmount: 500, startDate: "2025-04-15" },
      { invoiceId: "2", total: 13500, monthlyAmount: 500, startDate: "2026-06-15", service: "Removal defense" },
    ],
  };
  const [main, rd] = planViews(client);
  assert.deepEqual(main.invoiceAdjustments.map((a) => a.type), ["OTHER"]);
  assert.deepEqual(rd.invoiceAdjustments, []);
  assert.equal(client.invoiceAdjustments.length, 2);
});
