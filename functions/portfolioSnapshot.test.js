// Run: node --test portfolioSnapshot.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { computeSnapshot, batchRows } = require("./portfolioSnapshot");

const client = (id, payments) => ({
  id, firstName: "Ana", lastName: id, status: "active", invoiceTotal: 7000, initialPaymentAmount: 1000,
  initialPaymentDate: "2026-07-01", firstInstallmentDate: "2026-08-15",
  installmentSchedule: [{ amount: 500, start: "2026-08-01", end: "2046-08-01" }], payments,
  lastContactAt: "2026-11-20T15:00:00Z", mycasePhones: ["+15551234567"],
});

test("snapshot rows and totals match the app's math", () => {
  const now = new Date(2026, 10, 20, 12);
  const pay = (date) => ({ date, amount: 500 });
  const s = computeSnapshot([
    client("up", [pay("2026-08-15"), pay("2026-09-15"), pay("2026-10-15"), pay("2026-11-16")]),
    client("missed", [pay("2026-08-15"), pay("2026-09-15"), pay("2026-10-15")]),
  ], now);
  assert.equal(s.rows.length, 2);
  const missed = s.rows.find((r) => r.id === "missed");
  assert.equal(missed.amountDue, 500);
  assert.deepEqual(missed.phones, ["+15551234567"]);
  assert.equal(typeof missed.lastContact.at, "string"); // Dates stored as ISO text
  assert.equal(s.summary.pastDue.amount, 500);
  assert.equal(s.summary.pastDue.clients, 1);
  assert.equal(s.months.length, 12);
});

test("batches stay under the size limit and keep every row", () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: String(i), pad: "x".repeat(100) }));
  const b = batchRows(rows, 1200);
  assert.ok(b.length > 1);
  assert.equal(b.flat().length, 50);
  b.forEach((x) => assert.ok(JSON.stringify(x).length <= 1300));
});

test("removal-defense initial payments are told apart (case type, practice area or service)", () => {
  const { isRemovalDefense } = require("./shared/billing/book");
  assert.equal(isRemovalDefense({ caseType: "REMOVAL DEFENSE" }, {}), true);
  assert.equal(isRemovalDefense({ caseType: "", mycasePracticeArea: "Removal Defense - Asylum" }, {}), true);
  assert.equal(isRemovalDefense({ caseType: "VAWA SPOUSE", invoiceServices: { 77: "Removal defense" } }, { invoiceId: "77" }), true);
  assert.equal(isRemovalDefense({ caseType: "VAWA SPOUSE", invoiceServices: { 77: "Removal defense" } }, { invoiceId: "78" }), false);
  assert.equal(isRemovalDefense({ caseType: "MARRIAGE AOS", mycasePracticeArea: "Marriage AOS During Removal" }, {}), false);
});
