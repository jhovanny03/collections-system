// Run: node --test functions/rebuildClient.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { rebuildClient, netReversals, currentMonthly } = require("./rebuildClient");
const { autoTag } = require("./autoTag");

const client = {
  id: "c1", firstName: "Ana", lastName: "Diaz", status: "active", mycaseCaseId: "500",
  myCaseLink: "https://law-firm-of-moumita-rahman-pllc.mycase.com/court_cases/500",
  invoiceTotal: 6000, initialPaymentAmount: 1500, initialPaymentDate: "2026-01-03", firstInstallmentDate: "2026-02-15",
  installmentSchedule: [{ amount: 450, start: "2026-02-01", end: "2027-12-01", note: "" }],
  paymentPromise: { date: "2026-12-15", amount: "450" },
  // Hand-entered history: one lump sum, as staff often did.
  payments: [{ paymentId: "m1", amount: 1500, date: "2026-01-03", kind: "initial" }, { paymentId: "m2", amount: 1350, date: "2026-05-20" }],
};
const inv = (o) => ({ status: "sent", invoiceDate: "2026-01-02", dueDate: "2026-02-15", ...o });
const invoices = [
  inv({ id: "10", number: "10", total: 1500, invoiceDate: "2026-01-02" }),           // initial (matches initialPaymentAmount)
  inv({ id: "20", number: "20", total: 4500, invoiceDate: "2026-01-05" }),           // installment (6000 - 1500)
  inv({ id: "30", number: "30", total: 150, invoiceDate: "2025-12-01" }),            // consultation fee
  inv({ id: "40", number: "40", total: 3000, invoiceDate: "2026-06-01" }),           // removal defense (extra)
];
const pay = (o) => ({ status: "success", transaction_type: "PURCHASE", case_id: "500", ...o });
const payments = [
  pay({ id: "1", invoice_id: "30", amount: "150.00", payment_date: "2025-12-01" }),
  pay({ id: "2", invoice_id: "10", amount: "1500.00", payment_date: "2026-01-03" }),
  pay({ id: "3", invoice_id: "20", amount: "450.00", payment_date: "2026-02-15" }),
  pay({ id: "4", invoice_id: "20", amount: "450.00", payment_date: "2026-03-15", transaction_type: "ACH" }),
  pay({ id: "5", invoice_id: "20", amount: "-450.00", payment_date: "2026-03-20", transaction_type: "Rejection" }), // bounced e-check
  pay({ id: "6", invoice_id: "20", amount: "450.00", payment_date: "2026-03-25", transaction_type: "Credit Card" }), // re-paid by card
  pay({ id: "7", invoice_id: "20", amount: "450.00", payment_date: "2026-04-15" }),
  pay({ id: "8", invoice_id: "40", amount: "300.00", payment_date: "2026-06-15" }),
  pay({ id: "9", invoice_id: "20", amount: "450.00", payment_date: "2026-05-15", status: "error" }),
];

test("autoTag: amounts the app already holds pick initial, installment and the $150 fee", () => {
  const r = autoTag(client, invoices.map((i) => ({ ...i, invoice_date: i.invoiceDate })));
  assert.deepEqual(r.roles, { 10: "initial", 20: "installment", 30: "other" });
  assert.equal(r.status, "needs billing: extra invoices");
  assert.deepEqual(r.untagged, ["40"]);
  const simple = autoTag(client, invoices.slice(0, 3));
  assert.equal(simple.status, "fully tagged automatically");
  const unclear = autoTag({ ...client, invoiceTotal: 9999 }, invoices.slice(0, 3));
  assert.equal(unclear.status, "needs billing: no clear installment invoice");
  const whole = autoTag({ ...client, initialPaymentAmount: 0 }, [inv({ id: "99", total: 6000 })]);
  assert.deepEqual(whole.roles, { 99: "installment" }); // one invoice for the whole fee
});

test("autoTag: a down payment split over several invoices, only when unambiguous (real cases)", () => {
  // Case 19520149: initial $12,500 paid as #4656 $10,500 + #4323 $2,000; plan $1,500 = #6559037.
  const a = autoTag({ invoiceTotal: 14000, initialPaymentAmount: 12500 }, [
    inv({ id: "4187", total: 150 }), inv({ id: "4323", total: 2000 }), inv({ id: "6559037", total: 1500 }), inv({ id: "4656", total: 10500 }),
  ]);
  assert.deepEqual(a.roles, { 4187: "other", 4323: "initial", 4656: "initial", 6559037: "installment" });
  assert.equal(a.status, "fully tagged automatically");
  // Case 46053292: $13,350 = 4,500 + 8,850 but ALSO 2,500 + 2,000 + 8,850 -> ambiguous, billing decides.
  const b = autoTag({ invoiceTotal: 23350, initialPaymentAmount: 13350 }, [
    inv({ id: "a", total: 4500 }), inv({ id: "b", total: 2500 }), inv({ id: "c", total: 8850 }), inv({ id: "d", total: 10000 }), inv({ id: "e", total: 2000 }),
  ]);
  assert.equal(Object.values(b.roles).includes("initial"), false);
  assert.notEqual(b.status, "fully tagged automatically");
});

test("autoTag + rebuild: fee entered including the $150 consultation (real case 37716116)", () => {
  const leonard = {
    id: "lb", status: "active", invoiceTotal: 10500, initialPaymentAmount: 4500, initialPaymentDate: "2025-03-10",
    firstInstallmentDate: "2025-03-15", mycaseCaseId: "37716116",
    payments: [{ amount: 4500, date: "2025-03-10", kind: "initial" }, { amount: 6000, date: "2025-10-15" }],
  };
  const invs = [
    inv({ id: "a", number: "6443852", total: 150, invoiceDate: "2025-02-01" }),
    inv({ id: "b", number: "6444170", total: 4500, invoiceDate: "2025-02-10" }),
    inv({ id: "c", number: "6445105", total: 5850, invoiceDate: "2025-03-11" }),
  ];
  const tag = autoTag(leonard, invs);
  assert.equal(tag.status, "fully tagged automatically");
  assert.deepEqual(tag.roles, { a: "other", b: "initial", c: "installment" });
  assert.equal(tag.invoiceTotalAdjustment, -150);
  const pays = [
    pay({ id: "p1", case_id: "37716116", invoice_id: "a", amount: "150.00", payment_date: "2025-02-01" }),
    pay({ id: "p2", case_id: "37716116", invoice_id: "b", amount: "4500.00", payment_date: "2025-03-10" }),
    pay({ id: "p3", case_id: "37716116", invoice_id: "c", amount: "5850.00", payment_date: "2025-10-15" }),
  ];
  const { client: out } = rebuildClient({ client: leonard, roles: tag.roles, invoices: invs, payments: pays, invoiceTotalAdjustment: tag.invoiceTotalAdjustment });
  assert.equal(out.invoiceTotal, 10350);
  assert.deepEqual(out.rebuild.invoiceTotalAdjusted, { from: 10500, to: 10350, reason: "consultation fee billed as a separate MyCase invoice" });
  // Paid in full: counted payments ($4,500 + $5,850) equal the adjusted plan total.
  assert.equal(out.payments.reduce((s, p) => s + p.amount, 0), out.invoiceTotal);
  // Without a $150 invoice the rule does not apply.
  assert.notEqual(autoTag(leonard, invs.slice(1)).status, "fully tagged automatically");
});

test("netReversals: a rejection cancels the payment it reverses; 'Credit Card' is a real payment", () => {
  const { kept, reversedPairs, unmatched } = netReversals(payments.filter((p) => p.status === "success"));
  assert.equal(reversedPairs, 1);
  assert.deepEqual(unmatched, []);
  assert.ok(!kept.some((p) => p.id === "4"), "the bounced ACH payment is cancelled");
  assert.ok(kept.some((p) => p.id === "6"), "the Credit Card re-payment stays");
  const { cancelledIds } = netReversals(payments.filter((p) => p.status === "success"));
  assert.deepEqual(cancelledIds, ["4", "5"]); // both halves, so the hourly sync skips them
  const lone = netReversals([pay({ id: "x", invoice_id: "20", amount: "-99.00", transaction_type: "CREDIT" })]);
  assert.equal(lone.unmatched.length, 1);
});

test("currentMonthly reads the schedule, as the app does", () => {
  assert.equal(currentMonthly(client), 450);
  assert.equal(currentMonthly({ firstInstallmentDate: "2026-01-01" }), 500);
});

test("rebuildClient: MyCase history replaces hand entries, which are kept untouched", () => {
  const roles = { 10: "initial", 20: "installment", 30: "other" };
  const { client: out, ledger, allocations, reviews, stats } = rebuildClient({ client, roles, invoices, payments, now: new Date("2026-11-13T12:00:00Z") });
  assert.deepEqual(out.legacyPayments, client.payments);               // original kept as-is
  assert.deepEqual(out.payments.map((p) => [p.date, p.amount, p.kind || ""]), [
    ["2026-01-03", 1500, "initial"], ["2026-02-15", 450, ""], ["2026-03-25", 450, ""], ["2026-04-15", 450, ""],
  ]);
  assert.equal(stats.imported, 4);
  assert.equal(stats.reversedPairs, 1);
  assert.equal(stats.held, 1);           // removal-defense payment waits for billing's tag
  assert.equal(stats.ignored, 2);        // failed card attempt + $150 consultation fee
  assert.equal(reviews.length, 0);
  assert.equal(ledger.length, 4);
  assert.equal(allocations.length, 3);   // initial payment is not allocated to months
  assert.deepEqual(allocations.map((a) => a.doc.dueMonthKey), ["2026-02", "2026-03", "2026-04"]);
  assert.equal(allocations[0].doc.expectedInstallmentAmount, 450);
  assert.deepEqual(out.paymentPromise, client.paymentPromise);         // history never clears today's promise
  assert.equal(out.rebuild.status, "needs_tagging");
  assert.deepEqual(out.rebuild.untaggedInvoices, ["40"]);
  assert.equal(out.rebuild.legacyTotal, 2850);
  assert.equal(out.rebuild.mycaseTotal, 2850);
  assert.equal(out.plans[0].invoiceId, "20");
  assert.equal(out.plans[0].monthlyAmount, 450);
  assert.deepEqual(client.payments.length, 2, "input client object is not modified");
});

test("rebuildClient: removal defense tagged as a second plan counts toward its own plan", () => {
  const roles = { 10: "initial", 20: "installment", 30: "other", 40: "installment" };
  assert.throws(() => rebuildClient({ client, roles, invoices, payments }), /monthly amount for invoice 40/);
  const { client: out, allocations, stats } = rebuildClient({
    client, roles, invoices, payments, extraPlans: [{ invoiceId: "40", monthlyAmount: 300, startDate: "2026-06-15" }],
  });
  assert.deepEqual(out.plans.map((p) => [p.invoiceId, p.monthlyAmount, p.startDate]), [["20", 450, "2026-02-15"], ["40", 300, "2026-06-15"]]);
  assert.equal(stats.held, 0);
  assert.equal(out.rebuild.status, "rebuilt");
  const rd = allocations.filter((a) => a.doc.planInvoiceId === "40");
  assert.deepEqual(rd.map((a) => [a.doc.dueMonthKey, a.doc.appliedAmount, a.doc.expectedInstallmentAmount]), [["2026-06", 300, 300]]);
  // Re-tagging later rebuilds from scratch: legacy history is still the original hand entries.
  const again = rebuildClient({ client: out, roles, invoices, payments, extraPlans: [{ invoiceId: "40", monthlyAmount: 300 }] });
  assert.deepEqual(again.client.legacyPayments, client.payments);
  assert.equal(again.client.payments.length, out.payments.length);
});

test("rebuildClient refuses when no installment invoice is tagged", () => {
  assert.throws(() => rebuildClient({ client, roles: { 10: "initial" }, invoices, payments }), /No installment invoice/);
});
