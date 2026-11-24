// Run: node --test caseClosures.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { closureUpdate } = require("./caseClosures");
const NOW = "2026-11-20T15:00:00.000Z";

test("case closed in MyCase closes an open client, with a note", () => {
  const r = closureUpdate({ status: "active" }, { status: "closed", closedDate: "2026-11-18" }, NOW);
  assert.equal(r.update.status, "closed");
  assert.equal(r.update.closedBy, "MyCase sync");
  assert.equal(r.update.statusBeforeMyCaseClose, "active");
  assert.match(r.log, /closed in MyCase on 2026-11-18/);
});

test("already closed, or case open: nothing to do", () => {
  assert.equal(closureUpdate({ status: "closed" }, { status: "closed" }, NOW), null);
  assert.equal(closureUpdate({ status: "active" }, { status: "open" }, NOW), null);
});

test("reopened in MyCase: reopen only what the sync closed, back to its old status", () => {
  const r = closureUpdate({ status: "closed", closedBy: "MyCase sync", statusBeforeMyCaseClose: "paused" }, { status: "open" }, NOW);
  assert.equal(r.update.status, "paused");
  assert.equal(closureUpdate({ status: "closed", closedBy: "Arleen" }, { status: "open" }, NOW), null); // closed by hand stays closed
});

test("filedUpdate: case renamed A -> F in MyCase moves ACTIVE to FILED, never back, never over a hand-set status", () => {
  const { filedUpdate, isFiledName } = require("./caseClosures");
  const now = "2026-11-23T12:00:00.000Z";
  assert.equal(isFiledName("F (10-24) ALJIZAWE, ESSAM (SPOUSE I-360+AOS)"), true);
  assert.equal(isFiledName("F(10-24) X"), true);
  assert.equal(isFiledName("A (10-26) KURNIAWAN, NYOMAN"), false);
  assert.equal(isFiledName("FERNANDEZ (T-VISA)"), false);
  const up = filedUpdate({ status: "active", caseStatus: "ACTIVE" }, { name: "F (01-25) BHAGWANDAS, LEONARD" }, now);
  assert.equal(up.update.caseStatus, "FILED");
  assert.equal(filedUpdate({ status: "active", caseStatus: "" }, { name: "F (01-25) X" }, now).update.caseStatus, "FILED");
  assert.equal(filedUpdate({ status: "active", caseStatus: "APPROVED" }, { name: "F (01-25) X" }, now), null);
  assert.equal(filedUpdate({ status: "active", caseStatus: "FILED" }, { name: "A (01-25) X" }, now), null);
  assert.equal(filedUpdate({ status: "closed", caseStatus: "ACTIVE" }, { name: "F (01-25) X" }, now), null);
});
