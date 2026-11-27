// Run: node --test functions/closeCheck.test.js
// Data quality "Termination & closing" rules (src/billing/closeCheck.js, shared copy) and
// the AI reading of unclear titles (functions/closeCheckAi.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const { titleSignals, redactTitle, isRedacted, closeCheck, moneyBackByCase, titleKey } = require("./shared/billing/closeCheck");
const { readTitles } = require("./closeCheckAi");

const keys = (title) => titleSignals(title).signals.map((s) => s.key);

test("title rules: termination in process, hold, closed; court wording is not a termination", () => {
  assert.deepEqual(keys("A (12-25) GURU, NABIN (SPOUSE I-360 + AOS) Atlanta - TERMINATION IN PROCESS"), ["titleTermination"]);
  assert.deepEqual(keys("F(01-24) ROCHA, KAIO (AOS) Lawrence - (HOLD - Outstanding payments)"), ["titleHold"]);
  assert.deepEqual(keys("F (07-24) JONES, KYAN (Labor T-VISA) OKL [CLOSED]"), ["titleClosed"]);
  assert.deepEqual(keys("CLOSED(06-21) REDDY, SANDEEP (Motion to Terminate in Court)"), ["titleClosed"]);
  const legal = titleSignals("F(05-22) SINGH, BALJINDER (MARRIAGE AOS+ MOTION TO REOPEN AND TERMINATE)");
  assert.deepEqual(legal.signals, []);
  assert.equal(legal.legal, true);
  assert.equal(titleSignals("A (06-26) WALTERS, M (VAWA CANCELATION OF REMOVAL) MCH").unclear, false);
  assert.equal(titleSignals("A(04-26)VAKKALA,SUDHA(SPOUSE I-360+AOS) QR Deceased on 4/23/2026").unclear, true);
});

test("names are taken out of a title before it can be sent", () => {
  const names = ["Sudha", "Vakkala", "VAKKALA, SUDHA"];
  const out = redactTitle("A(04-26)VAKKALA,SUDHA(SPOUSE I-360+AOS)(ILLINOIS) QR Deceased", names);
  assert.ok(!/vakkala|sudha/i.test(out), out);
  assert.ok(isRedacted(out, names));
  assert.equal(redactTitle("CLOSED - Keskin, Pelin", []), "CLOSED - [client]");
  assert.equal(isRedacted("F (01-24) Lopez case", ["Maria Lopez"]), false);
});

test("refunds vs returned payments; voids ignored", () => {
  const m = moneyBackByCase([
    { caseId: "1", amount: -800, type: "CREDIT", status: "success", date: "2026-05-01" },
    { caseId: "1", amount: -700, type: "CREDIT", status: "success", date: "2026-06-01" },
    { caseId: "1", amount: -500, type: "Rejection", status: "success" },
    { caseId: "1", amount: -300, type: "VOID", status: "success" },
    { caseId: "1", amount: -900, type: "CREDIT", status: "error" },
  ]).get("1");
  assert.deepEqual(m, { refunds: 1500, refundCount: 2, lastRefund: "2026-06-01", returned: 500, returnedCount: 1 });
});

test("groups: close beats termination; hold alone is its own group; refunds over $1k count", () => {
  const open = { status: "active", caseStatus: "FILED" };
  const asOf = new Date(2026, 10, 27);
  const close = closeCheck(open, { caseDoc: { name: "A (05-25) X, Y (T-VISA) termination in process", status: "open", caseStage: "Closed" }, asOf });
  assert.equal(close.group, "close");
  const term = closeCheck(open, { caseDoc: { name: "A (05-25) X, Y (T-VISA)", status: "open" }, money: { refunds: 1200, refundCount: 1, returned: 0, returnedCount: 0 }, asOf });
  assert.equal(term.group, "termination");
  assert.equal(closeCheck(open, { caseDoc: { name: "A (05-25) X, Y (T-VISA)", status: "open" }, money: { refunds: 900, refundCount: 1, returned: 0, returnedCount: 0 }, asOf }), null);
  const hold = closeCheck(open, { caseDoc: { name: "F (01-24) X, Y (AOS) (HOLD - Outstanding payments)", status: "open" }, row: { amountDue: 900, lastPayment: { date: "2026-01-02" } }, asOf });
  assert.equal(hold.group, "hold");
  assert.ok(hold.signals.some((s) => s.key === "quiet"));
  assert.equal(closeCheck({ ...open, status: "closed" }, { caseDoc: { name: "CLOSED", status: "closed" } }), null);
  const paid = closeCheck({ status: "active", caseStatus: "APPROVED" }, { caseDoc: { name: "Approved (03-26) X, Y (AOS)", status: "open" }, row: { balance: 0, amountDue: 0 }, asOf });
  assert.equal(paid.group, "close");
});

test("an unclear title is to read until Claude answers for that exact title", () => {
  const c = { status: "active" };
  const title = "A(04-26) X, Y (AOS) QR Deceased on 4/23/2026";
  const caseDoc = { name: title, status: "open" };
  assert.equal(closeCheck(c, { caseDoc }).group, "unclear");
  assert.equal(closeCheck(c, { caseDoc, ai: { tag: "not_ending", reason: "QR deceased" } }), null);
  assert.equal(closeCheck(c, { caseDoc, ai: { tag: "should_close", reason: "client deceased" } }).group, "close");
  assert.notEqual(titleKey(title), titleKey(`${title} `));
});

test("Claude's answers are matched back by number; bad tags are dropped", async () => {
  const fake = { beta: { messages: { create: async (req) => {
    assert.equal(req.output_config.format.type, "json_schema");
    assert.ok(req.messages[0].content.includes("1. A [client] QR Deceased"));
    return { stop_reason: "end_turn", model: "claude-opus-5-5", content: [{ type: "text", text: JSON.stringify({ items: [{ i: 2, tag: "termination", reason: "client fired firm" }, { i: 1, tag: "bogus", reason: "x" }] }) }] };
  } } } };
  const out = await readTitles(fake, ["A [client] QR Deceased", "F [client] fired the firm"]);
  assert.equal(out.answers[0], null);
  assert.deepEqual(out.answers[1], { tag: "termination", reason: "client fired firm" });
});
