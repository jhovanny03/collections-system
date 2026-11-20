// Run: node --test functions/reversals.test.js
// New refunds / voids / bounced e-checks arriving from MyCase after a client is set up.
const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyPayment, computeImport, planReversal, replayAllocations, runImport } = require("./mycasePayments");

const client = (over = {}) => ({
  id: "c1", firstName: "Ana", lastName: "Diaz", status: "active", mycaseCaseId: "500",
  myCaseLink: "https://law-firm-of-moumita-rahman-pllc.mycase.com/court_cases/500",
  invoiceTotal: 6000, initialPaymentAmount: 1500, initialPaymentDate: "2026-01-03", firstInstallmentDate: "2026-02-15",
  installmentSchedule: [{ amount: 500, start: "2026-02-01", end: "2046-02-01", note: "" }],
  invoiceRoles: { 10: "initial", 20: "installment", 30: "other" },
  payments: [], ...over,
});
const feed = (o) => ({ status: "success", transaction_type: "PURCHASE", case_id: "500", invoice_id: "20", amount: "500.00", payment_date: "2026-05-01", ...o });

/** Import a list of feed payments into a client the way the sync does, in order. */
function withHistory(c, feeds) {
  let cur = c;
  for (const f of feeds) {
    const plan = computeImport(cur, f, new Date(), { kind: cur.invoiceRoles[f.invoice_id] === "initial" ? "initial" : "installment" });
    cur = { ...cur, payments: [...cur.payments, plan.clientPayment], ...plan.clientUpdates };
  }
  return cur;
}

const history = [
  feed({ id: "1", invoice_id: "10", amount: "1500.00", payment_date: "2026-01-03" }),
  feed({ id: "2", payment_date: "2026-02-15" }),
  feed({ id: "3", payment_date: "2026-03-15", transaction_type: "ACH" }),
  feed({ id: "4", payment_date: "2026-04-15" }),
];

test("classify: reversals on counted invoices reverse; on 'other' invoices they change nothing", () => {
  const m = new Map([["500", [client()]]]);
  assert.equal(classifyPayment(feed({ id: "r", amount: "-500.00", transaction_type: "Rejection" }), m).action, "reverse");
  assert.equal(classifyPayment(feed({ id: "r", amount: "-45.00", transaction_type: "VOID" }), m).action, "reverse");
  assert.deepEqual(classifyPayment(feed({ id: "r", invoice_id: "30", amount: "-150.00", transaction_type: "CREDIT" }), m), { action: "ignore", reason: "other_invoice" });
  assert.equal(classifyPayment(feed({ id: "x", transaction_type: "Credit Card" }), m).action, "import");
});

test("planReversal: picks the latest matching MyCase payment, never a hand entry", () => {
  const c = withHistory(client(), history);
  const t = planReversal(c, feed({ id: "r", amount: "-500.00", payment_date: "2026-03-20", transaction_type: "Rejection" }));
  assert.equal(t.ledgerId, "mycase_3"); // the March ACH that bounced, not Feb, not April (after it)
  assert.equal(planReversal(c, feed({ id: "r", amount: "-499.00", payment_date: "2026-05-01" })), null); // amount must match
  assert.equal(planReversal(c, feed({ id: "r", invoice_id: "10", amount: "-500.00", payment_date: "2026-05-01" })), null); // invoice must match
  const hand = { ...client(), payments: [{ paymentId: "manual1", amount: 500, date: "2026-02-15", invoiceId: "20" }] };
  assert.equal(planReversal(hand, feed({ id: "r", amount: "-500.00", payment_date: "2026-03-01" })), null);
});

test("replayAllocations: after a bounce, later payments move back into the right months", () => {
  const c = withHistory(client(), history);
  const before = replayAllocations(c).map((r) => [r.doc.paymentId, r.doc.dueMonthKey]);
  assert.deepEqual(before, [["mycase_2", "2026-02"], ["mycase_3", "2026-03"], ["mycase_4", "2026-04"]]);
  const t = planReversal(c, feed({ id: "r", amount: "-500.00", payment_date: "2026-03-20", transaction_type: "Rejection" }));
  const after = replayAllocations({ ...c, payments: c.payments.filter((_, i) => i !== t.index) })
    .map((r) => [r.id, r.doc.dueMonthKey, r.doc.appliedAmount]);
  // March is open again; the April payment now covers March.
  assert.deepEqual(after, [["mycase_2_0", "2026-02", 500], ["mycase_4_0", "2026-03", 500]]);
});

test("runImport: a bounced payment is cancelled, not sent to review; unmatched reversals are", async () => {
  const state = { client: withHistory(client(), history), reviews: [], handled: new Set() };
  const store = {
    getCursor: async () => null, saveCursor: async () => {},
    loadClientsByCaseId: async () => new Map([["500", [state.client]]]),
    handledIds: async (ids) => new Set(ids.filter((id) => state.handled.has(String(id)))),
    importPayment: async () => "imported",
    reversePayment: async (c, r) => {
      const t = planReversal(state.client, r);
      if (!t) return "no_match";
      state.client = { ...state.client, payments: state.client.payments.filter((_, i) => i !== t.index) };
      state.handled.add(t.ledgerId.replace(/^mycase_/, "")); state.handled.add(String(r.id));
      return "cancelled";
    },
    addReview: async (p, reason) => state.reviews.push([p.id, reason]),
  };
  const page = {
    payments: [
      feed({ id: "r1", amount: "-500.00", payment_date: "2026-03-20", transaction_type: "Rejection" }),
      feed({ id: "r2", amount: "-750.00", payment_date: "2026-03-21", transaction_type: "CREDIT" }), // nothing of $750 to cancel
    ],
    next_cursor: { after_updated_at: "2026-03-21T00:00:00Z", after_id: "r2" }, has_more: false,
  };
  const stats = await runImport({ store, baseUrl: "http://x", token: "t", log: {}, fetchImpl: async () => ({ ok: true, json: async () => page }) });
  assert.equal(stats.reversed, 1);
  assert.equal(stats.review, 1);
  assert.deepEqual(state.reviews, [["r2", "refund_or_reversal"]]);
  assert.deepEqual(state.client.payments.map((p) => p.paymentId), ["mycase_1", "mycase_2", "mycase_4"]);
  // Next run: the same rejection (and the cancelled original) are already handled.
  const again = await runImport({ store, baseUrl: "http://x", token: "t", log: {}, fetchImpl: async () => ({ ok: true, json: async () => ({ ...page, payments: [page.payments[0], history[2]] }) }) });
  assert.equal(again.reversed, 0);
  assert.equal(again.ignored, 2);
});
