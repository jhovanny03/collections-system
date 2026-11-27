// Run: node --test functions/briefingNotes.test.js
// Monthly briefing "AI notes": only firm totals go out, and the answer is read safely.
const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeFacts, writeNotes, briefingNotes } = require("./briefingNotes");

test("only numbers, booleans and month keys are sent: any text (a name, a note) is dropped", () => {
  const out = sanitizeFacts({
    month: "2026-11",
    outstanding: { amount: 412345.678, clients: 301 },
    topClient: "Maria Lopez",
    team: { listed: 160, note: "called Jose at 555-1234", ok: true },
    months: [{ key: "2026-10", rate: 0.81234, who: "John" }],
    "bad key!": 5,
    nested: { a: { b: { c: { d: { e: 1 } } } } },
  });
  assert.deepEqual(out.outstanding, { amount: 412345.678, clients: 301 });
  assert.equal(out.topClient, undefined);
  assert.deepEqual(out.team, { listed: 160, ok: true });
  assert.deepEqual(out.months, [{ key: "2026-10", rate: 0.812 }]);
  assert.equal(out["bad key!"], undefined);
  assert.ok(!JSON.stringify(out).includes("Maria") && !JSON.stringify(out).includes("555"));
});

const fakeClient = (reply, extra = {}) => {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (req) => { calls.push(req); return { stop_reason: "end_turn", model: "claude-opus-5-5", usage: { input_tokens: 900, output_tokens: 300 }, content: [{ type: "text", text: JSON.stringify(reply) }], ...extra }; } } },
  };
};
const REPLY = {
  headline: "Collection rate fell to 72%.",
  changed: ["Rate 72% vs 81% in October.", "Outstanding up $12k."],
  unusual: ["Paid-ahead money doubled to $8k."],
  actions: [{ action: "Call the 40 Maybe clients first", why: "They paid 44% of the time." }, { action: "b", why: "c" }, { action: "d", why: "e" }, { action: "x", why: "y" }],
};

test("writes notes with structured output and keeps at most 3 actions", async () => {
  const c = fakeClient(REPLY);
  const r = await writeNotes(c, { month: "2026-11", outstanding: { amount: 1 } });
  assert.equal(r.notes.headline, "Collection rate fell to 72%.");
  assert.equal(r.notes.actions.length, 3);
  assert.equal(c.calls[0].model, "claude-opus-5-5");
  assert.equal(c.calls[0].output_config.format.type, "json_schema");
  assert.ok(c.calls[0].messages[0].content.includes("2026-11"));
});

test("a declined or cut-off answer is an error, not empty notes", async () => {
  await assert.rejects(writeNotes(fakeClient(REPLY, { stop_reason: "refusal" }), { month: "2026-11" }), /declined/);
  await assert.rejects(writeNotes(fakeClient(REPLY, { stop_reason: "max_tokens" }), { month: "2026-11" }), /cut off/);
});

test("notes are saved per month and only rewritten when asked", async () => {
  const store = new Map();
  const db = { collection: () => ({ doc: (id) => ({ get: async () => ({ exists: store.has(id), data: () => store.get(id) }), set: async (d) => store.set(id, d) }) }) };
  assert.equal((await briefingNotes(db, { month: "2026-11" })).status, "none");
  assert.equal((await briefingNotes(db, { month: "2026-11", regenerate: true })).status, "not-set-up");
  const c = fakeClient(REPLY);
  const made = await briefingNotes(db, { month: "2026-11", regenerate: true, client: c, facts: { outstanding: { amount: 5 }, name: "Ana" }, by: "a@b.c" });
  assert.equal(made.status, "ok");
  assert.equal(made.sent.name, undefined);
  const again = await briefingNotes(db, { month: "2026-11", client: c });
  assert.equal(again.notes.headline, REPLY.headline);
  assert.equal(c.calls.length, 1);
});
