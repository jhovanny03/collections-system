// Run: node --test functions/mycasePayments.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  caseIdFromLink, etMidnight, classifyPayment, computeImport, runImport,
} = require("./mycasePayments");

const LINK = "https://law-firm-of-moumita-rahman-pllc.mycase.com/court_cases/45403519";

const client = (over = {}) => ({
  id: "c1", firstName: "Ana", lastName: "Diaz", myCaseLink: LINK,
  firstInstallmentDate: "2026-01-10", invoiceTotal: 3000, installmentAmount: 500,
  // Tagged, as every client that receives MyCase payments must be.
  invoiceRoles: { 1001: "installment" },
  payments: [], ...over,
});
const pay = (over = {}) => ({
  id: "9001", amount: "500.00", payment_date: "2026-02-14", status: "success",
  transaction_type: "payment", case_id: "45403519", client_id: "7", invoice_id: "1001", ...over,
});
const mapOf = (...clients) => {
  const m = new Map();
  for (const c of clients) {
    const k = caseIdFromLink(c.myCaseLink);
    m.set(k, [...(m.get(k) || []), c]);
  }
  return m;
};

test("caseIdFromLink reads the court_cases id and rejects other links", () => {
  assert.equal(caseIdFromLink(LINK), "45403519");
  assert.equal(caseIdFromLink(LINK + "/overview?x=1"), "45403519");
  assert.equal(caseIdFromLink("https://x.mycase.com/contacts/123"), null);
  assert.equal(caseIdFromLink(""), null);
  assert.equal(caseIdFromLink(undefined), null);
});

test("etMidnight is midnight Eastern in both EST and EDT", () => {
  assert.equal(etMidnight("2026-01-15").toISOString(), "2026-01-15T05:00:00.000Z");
  assert.equal(etMidnight("2026-07-15").toISOString(), "2026-07-15T04:00:00.000Z");
});

test("classify: only successful positive payments for exactly one client import", () => {
  const m = mapOf(client());
  assert.equal(classifyPayment(pay(), m).action, "import");
  assert.equal(classifyPayment(pay({ status: "pending" }), m).action, "ignore");
  assert.equal(classifyPayment(pay({ amount: "0.00" }), m).action, "ignore");
  // Untracked cases wait in the mirror for Case Setup; they are not review items.
  assert.deepEqual(classifyPayment(pay({ case_id: "1" }), m), { action: "ignore", reason: "case_not_tracked" });
  assert.equal(classifyPayment(pay({ case_id: null }), m).reason, "case_not_tracked");
  assert.equal(classifyPayment(pay({ case_id: "1", amount: "-50.00", transaction_type: "CREDIT" }), m).reason, "case_not_tracked");
  // Refunds/bounces on a counted invoice are reversed automatically (see reversals.test.js).
  assert.equal(classifyPayment(pay({ transaction_type: "Refund" }), m).action, "reverse");
  assert.equal(classifyPayment(pay({ amount: "-50.00" }), m).action, "reverse");
  assert.equal(classifyPayment(pay({ transaction_type: "Credit Card" }), m).action, "import");
  assert.equal(classifyPayment(pay({ payment_date: null }), m).reason, "invalid_date");
  const two = mapOf(client(), client({ id: "c2" }));
  assert.equal(classifyPayment(pay(), two).reason, "multiple_matching_clients");
});

test("computeImport builds ledger, client entry and allocations", () => {
  const plan = computeImport(client(), pay());
  assert.equal(plan.ledgerId, "mycase_9001");
  assert.equal(plan.ledgerDoc.source, "mycase");
  assert.equal(plan.ledgerDoc.amount, 500);
  assert.equal(plan.clientPayment.paymentId, "mycase_9001");
  assert.equal(plan.allocationRows.length, 1);
  assert.equal(plan.allocationRows[0].appliedAmount, 500);
  assert.equal(plan.allocationRows[0].allocationStatus, "paid");
});

test("computeImport holds a payment that matches a manual entry", () => {
  const c = client({ payments: [{ paymentId: "abc", amount: 500, date: "2026-02-14" }] });
  assert.deepEqual(computeImport(c, pay()), { skip: "possible_duplicate" });
  // A previously imported MyCase entry is not a "manual" duplicate.
  const c2 = client({ payments: [{ paymentId: "mycase_1", amount: 500, date: "2026-02-14" }] });
  assert.ok(computeImport(c2, pay({ id: "2" })).ledgerId);
});

test("computeImport clears a kept promise, keeps a missed one", () => {
  const kept = client({ paymentPromise: { date: "2026-02-20", amount: "500" } });
  assert.equal(computeImport(kept, pay()).clearPromise, true);
  const late = client({ paymentPromise: { date: "2026-02-01", amount: "500" } });
  assert.equal(computeImport(late, pay()).clearPromise, false);
});

// ---- runImport against an in-memory store and a paged fake feed ----
function memoryStore(clients) {
  const s = {
    cursor: null, ledger: new Map(), reviews: new Map(), clients: new Map(clients.map((c) => [c.id, c])),
    getCursor: async () => s.cursor,
    saveCursor: async (c) => { s.cursor = c; },
    loadClientsByCaseId: async () => mapOf(...s.clients.values()),
    importPayment: async (c, p, opts) => {
      const id = `mycase_${p.id}`;
      if (s.ledger.has(id)) return "exists";
      const fresh = s.clients.get(c.id);
      const plan = computeImport(fresh, p, new Date(), opts);
      if (plan.skip) return plan.skip;
      s.ledger.set(id, plan.ledgerDoc);
      fresh.payments = [...(fresh.payments || []), plan.clientPayment];
      return "imported";
    },
    addReview: async (p, reason) => { s.reviews.set(`${p.id}_${reason}`, p); },
  };
  return s;
}

function fakeFeed(pages) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    assert.equal(init.headers["x-feed-token"], "tok");
    const u = new URL(url);
    seen.push(u.searchParams.get("after_id"));
    const i = seen.length - 1;
    const page = pages[i] || { payments: [], next_cursor: null, has_more: false };
    return { ok: true, status: 200, json: async () => page };
  };
  return { fetchImpl, seen };
}

test("runImport pages through, imports once, and is safe to re-run", async () => {
  const store = memoryStore([client()]);
  const pages = [
    { payments: [pay({ id: "1", amount: "500.00" }), pay({ id: "2", status: "pending" })],
      next_cursor: { after_updated_at: "2026-02-14T00:00:00.000Z", after_id: "2" }, has_more: true },
    { payments: [pay({ id: "3", payment_date: "2026-03-14" }), pay({ id: "4", case_id: "999" })],
      next_cursor: { after_updated_at: "2026-03-14T00:00:00.000Z", after_id: "4" }, has_more: false },
  ];
  const feed = fakeFeed(pages);
  const run = () => runImport({ store, baseUrl: "http://x", token: "tok", fetchImpl: feed.fetchImpl, log: {} });

  const first = await run();
  assert.deepEqual(first, { pages: 2, imported: 2, alreadyImported: 0, ignored: 2, review: 0, reversed: 0 });
  assert.equal(store.ledger.size, 2);
  assert.equal(store.clients.get("c1").payments.length, 2);
  assert.deepEqual(store.cursor, { after_updated_at: "2026-03-14T00:00:00.000Z", after_id: "4" });
  assert.equal(feed.seen[1], "2"); // second request resumed from the first page's cursor

  // Re-fetching the same rows (e.g. after a crash before the cursor saved) adds nothing.
  store.cursor = null;
  const feed2 = fakeFeed(pages);
  const second = await runImport({ store, baseUrl: "http://x", token: "tok", fetchImpl: feed2.fetchImpl, log: {} });
  assert.equal(second.imported, 0);
  assert.equal(second.alreadyImported, 2);
  assert.equal(store.ledger.size, 2);
  assert.equal(store.clients.get("c1").payments.length, 2);
});

test("runImport skips payments the rebuild already settled", async () => {
  const store = memoryStore([client()]);
  store.handledIds = async (ids) => new Set(ids.filter((id) => id === "1"));
  const feed = fakeFeed([{ payments: [pay({ id: "1" }), pay({ id: "2", payment_date: "2026-03-14" })], next_cursor: { after_updated_at: "2026-03-14T00:00:00.000Z", after_id: "2" }, has_more: false }]);
  const s = await runImport({ store, baseUrl: "http://x", token: "tok", fetchImpl: feed.fetchImpl, log: {} });
  assert.equal(s.imported, 1);
  assert.equal(s.ignored, 1);
  assert.ok(!store.ledger.has("mycase_1"));
});

test("runImport surfaces a feed failure instead of swallowing it", async () => {
  const store = memoryStore([client()]);
  await assert.rejects(
    runImport({
      store, baseUrl: "http://x", token: "bad", log: {},
      fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    }),
    /feed responded 404/
  );
  assert.equal(store.cursor, null);
});

test("classify: tagged clients route payments by invoice role", () => {
  const c = client({ invoiceRoles: { "11": "initial", "22": "installment", "33": "other" } });
  const m = mapOf(c);
  const pick = ({ action, kind }) => ({ action, kind });
  assert.deepEqual(pick(classifyPayment(pay({ invoice_id: "11" }), m)), { action: "import", kind: "initial" });
  assert.equal(classifyPayment(pay({ invoice_id: "22" }), m).kind, "installment");
  assert.deepEqual(classifyPayment(pay({ invoice_id: "33" }), m), { action: "ignore", reason: "other_invoice" });
  assert.equal(classifyPayment(pay({ invoice_id: "44" }), m).reason, "untagged_invoice");
  // Hand-entered clients without tags never receive MyCase payments (would double count).
  assert.deepEqual(classifyPayment(pay(), mapOf(client({ invoiceRoles: undefined }))), { action: "ignore", reason: "client_not_rebuilt" });
  assert.deepEqual(classifyPayment(pay(), mapOf(client({ invoiceRoles: {} }))), { action: "ignore", reason: "client_not_rebuilt" });
  // A case waiting for billing's tags holds untagged payments quietly instead of flooding review.
  const waiting = client({ invoiceRoles: { 11: "initial" }, rebuild: { status: "needs_tagging" } });
  assert.deepEqual(classifyPayment(pay({ invoice_id: "44" }), mapOf(waiting)), { action: "ignore", reason: "awaiting_tagging" });
  assert.equal(classifyPayment(pay({ invoice_id: "11" }), mapOf(waiting)).kind, "initial");
});

test("computeImport: initial payments are marked, not allocated, and move the down-payment date", () => {
  const c = client({ initialPaymentDate: "2026-01-05" });
  const plan = computeImport(c, pay({ payment_date: "2026-01-20" }), new Date(), { kind: "initial" });
  assert.equal(plan.clientPayment.kind, "initial");
  assert.equal(plan.ledgerDoc.kind, "initial");
  assert.equal(plan.allocationRows.length, 0);
  assert.deepEqual(plan.clientUpdates, { initialPaymentDate: "2026-01-20" });
  // ...but not past an installment already recorded after the old date.
  const c2 = client({ initialPaymentDate: "2026-01-05", payments: [{ paymentId: "mycase_1", amount: 500, date: "2026-01-15" }] });
  assert.deepEqual(computeImport(c2, pay({ payment_date: "2026-01-20" }), new Date(), { kind: "initial" }).clientUpdates, {});
});
