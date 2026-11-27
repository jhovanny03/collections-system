// Run: node --test functions/callPriority.test.js
// The "who to call first" score (src/billing/callPriority.js, shared copy).
const test = require("node:test");
const assert = require("node:assert/strict");
const { likelyToPay, bestTime, answerTable, bandOf, promiseRecord, promiseMonths } = require("./shared/billing/callPriority");

const plan = (payDays) => ({
  id: "c1", status: "active", invoiceTotal: 12000, initialPaymentAmount: 0, initialPaymentDate: "2025-01-01",
  firstInstallmentDate: "2025-11-15", installmentAmount: 500,
  payments: payDays.map((d) => ({ date: d, amount: 500 })),
});

test("a client who always paid on time scores higher than one who never paid", () => {
  const asOf = new Date(2026, 10, 16, 12);
  const good = plan(["2025-11-14", "2025-12-15", "2026-01-15", "2026-02-13", "2026-03-15", "2026-04-15", "2026-05-15", "2026-06-15", "2026-07-15", "2026-08-15", "2026-09-15", "2026-10-15"]);
  const bad = plan([]);
  const g = likelyToPay(good, { asOf, now: { missedMonths: 0, lastPaymentDate: "2026-10-15" } });
  const b = likelyToPay(bad, { asOf, now: { missedMonths: 8, lastPaymentDate: null } });
  assert.ok(g.p > b.p);
  assert.ok(g.p > 0.8 && g.band !== "low");
  assert.equal(b.band, "low");
  assert.ok(g.reasons[0].text.startsWith("Paid on time 12 of the last 12"));
  assert.ok(b.reasons.some((r) => /behind|unpaid|No payment/.test(r.text)));
});

test("a promise is kept when the amount is paid by 3 days after its date", () => {
  const c = {
    payments: [{ date: "2026-10-20", amount: 500 }],
    communicationLogs: [
      { message: "Client promised to pay $500 on 2026-10-18. Notes: None", timestamp: "2026-10-10T15:00:00Z" },
      { message: "Client promised to pay $1,000 on 2026-09-05. Notes: None", timestamp: "2026-09-01T15:00:00Z" },
    ],
  };
  assert.deepEqual(promiseRecord(c, new Date(2026, 10, 1)), { kept: 1, broken: 1 });
});

test("best time: the client's own answered calls first, else when clients answer most", () => {
  const calls = [
    { at: "2026-11-03T22:10:00Z", direction: "outbound", connected: true }, // 5:10 PM New York
    { at: "2026-11-10T22:30:00Z", direction: "outbound", connected: true },
    { at: "2026-11-11T14:00:00Z", direction: "outbound", connected: false }, // 9 AM
  ];
  const own = bestTime(calls, {});
  assert.equal(own.slot, "5–7 PM");
  assert.equal(own.own, true);
  const firm = answerTable(Array.from({ length: 10 }, (_, i) => ({ at: "2026-11-12T16:30:00Z", direction: "outbound", connected: i < 7 })));
  const general = bestTime([], firm);
  assert.equal(general.own, false);
  assert.equal(general.slot, null);
  assert.equal(general.firmSlot, "11 AM–1 PM");
  assert.equal(general.firmRate, 70);
});

test("bands", () => {
  assert.equal(bandOf(0.95), "high");
  assert.equal(bandOf(0.6), "medium");
  assert.equal(bandOf(0.2), "low");
});

test("promises month by month: from the notes and the current promise, each once", () => {
  const c = {
    id: "c1",
    payments: [{ date: "2026-10-20", amount: 500 }],
    communicationLogs: [
      { message: "Client promised to pay $500 on 2026-10-18. Notes: None", timestamp: "2026-10-10T15:00:00Z" },
      { message: "Client promised to pay $1,000 on 2026-11-05. Notes: None", timestamp: "2026-10-25T15:00:00Z" },
    ],
    paymentPromise: { date: "2026-11-05", amount: 1000 }, // same as the note: counted once
  };
  const other = { id: "c2", payments: [], paymentPromise: { date: "2026-11-30", amount: 200 } };
  const m = promiseMonths([c, other], new Date(2026, 10, 27, 12), new Map([["c1", ["2026-10"]]]));
  assert.deepEqual(m["2026-10"], { due: 1, kept: 1, broken: 0, open: 0, keptAmount: 500, made: 2, listMade: 2 });
  assert.equal(m["2026-11"].due, 2);
  assert.equal(m["2026-11"].broken, 1);
  assert.equal(m["2026-11"].open, 1);
});
