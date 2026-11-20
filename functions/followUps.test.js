// Run: FUNCTIONS_UNIT_TEST=1 node --test followUps.test.js
process.env.FUNCTIONS_UNIT_TEST = "1";
const test = require("node:test");
const assert = require("node:assert/strict");
const { computeFollowUpItemForClient } = require("./index")._test;

const docOf = (id, data) => ({ id, data: () => data });
const anchor = new Date(2026, 6, 20); // July 2026 cohort (due 15 Jul)

// Main plan $500/month from Feb; removal-defense plan $300/month from June.
const base = {
  firstName: "ANA", lastName: "DIAZ", status: "active", myCaseLink: "https://x/court_cases/500",
  invoiceTotal: 6000, initialPaymentAmount: 1500, initialPaymentDate: "2026-01-03", firstInstallmentDate: "2026-02-15",
  installmentSchedule: [{ amount: 500, start: "2026-02-01", end: "2046-02-01" }],
  plans: [
    { invoiceId: "602", invoiceNumber: "602", total: 4500, monthlyAmount: 500, startDate: "2026-02-15" },
    { invoiceId: "902", invoiceNumber: "902", total: 3000, monthlyAmount: 300, startDate: "2026-06-15" },
  ],
};
const mainPaidThrough = (lastMonth) => {
  const out = [{ amount: 1500, date: "2026-01-03", kind: "initial", invoiceId: "601" }];
  for (let m = 2; m <= lastMonth; m++) out.push({ amount: 500, date: `2026-0${m}-15`, invoiceId: "602" });
  return out;
};

test("single-plan clients: same rule as before (missed this month only)", () => {
  const c = { ...base, plans: undefined, payments: mainPaidThrough(6) };
  const item = computeFollowUpItemForClient(docOf("c1", c), anchor);
  assert.equal(item.amountDueCurrentMonth, 500);
  assert.equal(computeFollowUpItemForClient(docOf("c1", { ...c, payments: mainPaidThrough(7) }), anchor), null);
  assert.equal(item.section, "current");
  const behind = computeFollowUpItemForClient(docOf("c1", { ...c, payments: mainPaidThrough(5) }), anchor);
  assert.equal(behind.section, "behind"); // >1 month: listed in its own section
  assert.equal(behind.monthsBehind, 2);
  assert.equal(behind.pastDueTotal, 1000);
  assert.equal(behind.amountDueCurrentMonth, 500);
});

test("main plan paid, removal-defense plan missed July: listed for the $300", () => {
  const payments = [...mainPaidThrough(7), { amount: 300, date: "2026-06-15", invoiceId: "902" }];
  const item = computeFollowUpItemForClient(docOf("c2", { ...base, payments }), anchor);
  assert.equal(item.amountDueCurrentMonth, 300);
  assert.deepEqual(item.plansMissed, [{ invoiceNumber: "902", amount: 300, monthsBehind: 1 }]);
  assert.equal(item.clientName, "ANA DIAZ");
});

test("both plans missed July: one row for the total", () => {
  const payments = [...mainPaidThrough(6), { amount: 300, date: "2026-06-15", invoiceId: "902" }];
  const item = computeFollowUpItemForClient(docOf("c3", { ...base, payments }), anchor);
  assert.equal(item.amountDueCurrentMonth, 800);
});

test("removal-defense payments no longer hide a missed main-plan month", () => {
  // Before: all payments were pooled, so $600 toward removal defense covered July's $500.
  const payments = [...mainPaidThrough(6), { amount: 300, date: "2026-06-15", invoiceId: "902" }, { amount: 300, date: "2026-07-15", invoiceId: "902" }];
  const item = computeFollowUpItemForClient(docOf("c4", { ...base, payments }), anchor);
  assert.equal(item.amountDueCurrentMonth, 500);
  assert.deepEqual(item.plansMissed, [{ invoiceNumber: "602", amount: 500, monthsBehind: 1 }]);
});

test("a plan more than one month behind puts the client in the behind section", () => {
  const payments = mainPaidThrough(7); // removal defense: June and July unpaid
  const item = computeFollowUpItemForClient(docOf("c5", { ...base, payments }), anchor);
  assert.equal(item.section, "behind");
  assert.equal(item.monthsBehind, 2);
  assert.equal(item.pastDueTotal, 600);
  assert.deepEqual(item.plansMissed, [{ invoiceNumber: "902", amount: 300, monthsBehind: 2 }]);
});

test("part paid this month: listed for what is left", () => {
  const payments = [...mainPaidThrough(6), { amount: 200, date: "2026-07-14", invoiceId: "602" }];
  const item = computeFollowUpItemForClient(docOf("c6", { ...base, plans: undefined, payments }), anchor);
  assert.equal(item.section, "current");
  assert.equal(item.amountDueCurrentMonth, 300);
});

test("resolutionFor: paid when a payment dated this month or later is on the client", () => {
  const { resolutionFor } = require("./index")._test;
  assert.deepEqual(resolutionFor({ payments: [{ amount: 500, date: "2026-06-15" }, { amount: 500, date: "2026-07-18" }] }, "2026-07"),
    { resolvedReason: "paid", paidDate: "2026-07-18" });
  assert.deepEqual(resolutionFor({ status: "closed", payments: [{ amount: 500, date: "2026-06-15" }] }, "2026-07"),
    { resolvedReason: "no_longer_due", paidDate: null });
  assert.deepEqual(resolutionFor(undefined, "2026-07"), { resolvedReason: "no_longer_due", paidDate: null });
});

test("applyMyCasePayments: hand-entered clients get credit for MyCase payments not typed in yet", () => {
  const { applyMyCasePayments } = require("./index")._test;
  const client = { myCaseLink: "https://x.mycase.com/court_cases/777/invoices", payments: [{ amount: 500, date: "2026-07-03" }] };
  const item = { clientId: "h1", section: "current", amountDueCurrentMonth: 500, pastDueTotal: 500 };
  const pays = (list) => new Map([["777", list]]);
  // typed already (same day and amount): no extra credit
  assert.equal(applyMyCasePayments(item, client, pays([{ date: "2026-07-03", amount: 500 }])), item);
  // paid in MyCase, not typed: kept as paid in MyCase
  const paid = applyMyCasePayments(item, client, pays([{ date: "2026-07-09", amount: 500 }]));
  assert.equal(paid.resolvedReason, "paid_mycase");
  assert.equal(paid.paidDate, "2026-07-09");
  // part paid
  const part = applyMyCasePayments(item, client, pays([{ date: "2026-07-09", amount: 200 }]));
  assert.equal(part.resolvedReason, undefined);
  assert.equal(part.amountDueCurrentMonth, 300);
  assert.equal(part.mycaseUnlogged, 200);
  // behind $1,500 (this month $500): a $600 payment covers older months first
  const behind = applyMyCasePayments({ ...item, section: "behind", pastDueTotal: 1500 }, client, pays([{ date: "2026-07-09", amount: 600 }]));
  assert.equal(behind.pastDueTotal, 900);
  assert.equal(behind.amountDueCurrentMonth, 500);
  // rebuilt clients already receive MyCase payments: untouched
  assert.equal(applyMyCasePayments(item, { ...client, invoiceRoles: { 1: "installment" } }, pays([{ date: "2026-07-09", amount: 500 }])), item);
});

test("plan ended but still short: listed as behind (plan ended), not dropped", () => {
  // $3,000 to collect at $500/month from Jan 2026 -> last installment Jun 2026. Paid 4 of 6.
  const c = {
    firstName: "END", lastName: "ED", status: "active", invoiceTotal: 4000, initialPaymentAmount: 1000, initialPaymentDate: "2025-12-03",
    firstInstallmentDate: "2026-01-15", installmentSchedule: [{ amount: 500, start: "2026-01-01", end: "2046-01-01" }],
    payments: [{ amount: 1000, date: "2025-12-03", kind: "initial" }, ...[1, 2, 3, 4].map((m) => ({ amount: 500, date: `2026-0${m}-15` }))],
  };
  const item = computeFollowUpItemForClient(docOf("e1", c), anchor); // July
  assert.equal(item.section, "behind");
  assert.equal(item.planEnded, true);
  assert.equal(item.pastDueTotal, 1000);
  assert.equal(item.amountDueCurrentMonth, 0);
  // fully paid: nothing
  const paid = { ...c, payments: [...c.payments, { amount: 1000, date: "2026-07-01" }] };
  assert.equal(computeFollowUpItemForClient(docOf("e1", paid), anchor), null);
});

test("last installment is the smaller remainder of the balance", () => {
  // $1,200 at $500/month: Jan 500, Feb 500, Mar 200.
  const c = {
    firstName: "REM", lastName: "AINDER", status: "active", invoiceTotal: 1200, initialPaymentAmount: 0,
    firstInstallmentDate: "2026-01-15", installmentSchedule: [{ amount: 500, start: "2026-01-01", end: "2046-01-01" }],
    payments: [{ amount: 500, date: "2026-01-15" }, { amount: 500, date: "2026-02-15" }],
  };
  const item = computeFollowUpItemForClient(docOf("r1", c), new Date(2026, 2, 20));
  assert.equal(item.section, "current");
  assert.equal(item.amountDueCurrentMonth, 200);
});

test("promiseOutcome: kept when paid in full by 3 days after the date, broken after that", () => {
  const { promiseOutcome } = require("./index")._test;
  const pr = { date: "2026-07-20", amount: 500, createdAt: "2026-07-10T15:00:00Z" };
  assert.deepEqual(promiseOutcome(pr, [{ amount: 500, date: "2026-07-22" }], "2026-07-22"), { status: "kept", paidAmount: 500 });
  assert.equal(promiseOutcome(pr, [{ amount: 200, date: "2026-07-21" }], "2026-07-22"), null); // still in grace
  assert.deepEqual(promiseOutcome(pr, [{ amount: 200, date: "2026-07-21" }], "2026-07-24"), { status: "broken", paidAmount: 200 });
  // a payment before the promise was made does not count
  assert.deepEqual(promiseOutcome(pr, [{ amount: 500, date: "2026-07-01" }], "2026-07-24"), { status: "broken", paidAmount: 0 });
});

test("a payment made on the initial date counts beyond the initial amount (whole plan paid on day one)", () => {
  const c = {
    firstName: "DAY", lastName: "ONE", status: "active", invoiceTotal: 6000, initialPaymentAmount: 1000, initialPaymentDate: "2026-01-04",
    firstInstallmentDate: "2026-02-15", installmentSchedule: [{ amount: 500, start: "2026-02-01", end: "2046-02-01" }],
    payments: [{ amount: 6000, date: "2026-01-04" }],
  };
  assert.equal(computeFollowUpItemForClient(docOf("d1", c), anchor), null);
});

test("an initial payment refunded in MyCase puts the client in behind", () => {
  const c = {
    firstName: "REF", lastName: "UND", status: "active", invoiceTotal: 6000, initialPaymentAmount: 1000, initialPaymentDate: "2026-01-04",
    firstInstallmentDate: "2026-02-15", installmentSchedule: [{ amount: 500, start: "2026-02-01", end: "2046-02-01" }],
    invoiceRoles: { 1: "initial", 2: "installment" },
    payments: [2, 3, 4, 5, 6, 7].map((m) => ({ amount: 500, date: `2026-0${m}-15`, invoiceId: 2 })),
  };
  const item = computeFollowUpItemForClient(docOf("r2", c), anchor);
  assert.equal(item.section, "behind");
  assert.equal(item.initialUnpaid, 1000);
  assert.equal(item.pastDueTotal, 1000); // installments Feb-Jul are paid; only the refunded initial is owed
});
