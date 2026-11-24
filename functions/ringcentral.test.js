// Run: node --test ringcentral.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { toCall, logLine, callStats } = require("./ringcentral");

// Records in RingCentral's call-log shape (view=Simple).
const out = (over = {}) => ({
  id: "A1", telephonySessionId: "s-1", startTime: "2026-11-20T15:00:00.000Z", duration: 240, type: "Voice",
  direction: "Outbound", result: "Call connected",
  from: { phoneNumber: "+17164681651", extensionNumber: "99159", name: "Miguel Cañas" },
  to: { phoneNumber: "(555) 123-4567" },
  ...over,
});

test("toCall: a billing call becomes a call record with the client's number", () => {
  const c = toCall(out());
  assert.equal(c.by, "Miguel Cañas");
  assert.equal(c.phone, "+15551234567");
  assert.equal(c.direction, "outbound");
  assert.equal(c.connected, true);
  assert.equal(logLine(c), "Call (RingCentral): called the client, talked 4 min.");
});

test("toCall: matched by name when the extension number is missing", () => {
  assert.equal(toCall(out({ from: { phoneNumber: "+17164681651", name: "Arleen Francisco" } })).by, "Arleen Francisco");
});

test("toCall: calls by people outside billing, and non-voice records, are ignored", () => {
  assert.equal(toCall(out({ from: { phoneNumber: "+1", extensionNumber: "99125", name: "Aaron Mendez" } })), null);
  assert.equal(toCall(out({ type: "Fax" })), null);
});

test("toCall: no answer, voicemail, and a missed call from the client", () => {
  const na = toCall(out({ result: "No Answer", duration: 0 }));
  assert.equal(na.connected, false);
  assert.match(logLine(na), /no answer/);
  assert.match(logLine(toCall(out({ result: "Voicemail", duration: 20 }))), /voicemail/);
  const missed = toCall({ ...out(), direction: "Inbound", result: "Missed", duration: 0, from: { phoneNumber: "5551234567" }, to: { phoneNumber: "+17164681651", extensionNumber: "99159" } });
  assert.equal(missed.missed, true);
  assert.equal(missed.phone, "+15551234567");
});

test("toCall: a short 'connected' outbound call counts as likely voicemail, not a talk", () => {
  const c = toCall(out({ duration: 25 }));
  assert.equal(c.connected, false);
  assert.equal(c.voicemail, true);
  assert.equal(logLine(c), "Call (RingCentral): called, short call (25 sec, likely voicemail).");
  assert.equal(toCall(out({ duration: 40 })).connected, true);
});

test("toCall: a client call to the main number is credited to the team member who took it (legs)", () => {
  const rec = {
    id: "I1", startTime: "2026-11-20T15:00:00Z", duration: 230, type: "Voice", direction: "Inbound", result: "Accepted",
    from: { phoneNumber: "5551234567", name: "CLIENT" }, to: { phoneNumber: "+18005550000" },
    legs: [
      { direction: "Inbound", result: "Missed", duration: 0, to: { name: "Miguel Cañas", extensionNumber: "99159" } },
      { direction: "Inbound", result: "Accepted", duration: 225, to: { name: "Arianna Orantes - Billing & collection specialist." } },
    ],
  };
  const c = toCall(rec);
  assert.equal(c.by, "Arianna Orantes");
  assert.equal(c.direction, "inbound");
  assert.equal(c.connected, true);
  assert.equal(c.durationSec, 225);
  assert.equal(logLine(c), "Call (RingCentral): client called in, talked 4 min.");
  // Nobody on the team was on it: not ours.
  assert.equal(toCall({ ...rec, legs: [{ direction: "Inbound", result: "Accepted", duration: 200, to: { name: "Reception" } }] }), null);
});

test("callStats: last contacted, attempts this month, talk time, call back flag", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  const calls = [
    toCall(out({ id: "1", startTime: "2026-10-30T15:00:00Z", duration: 120 })),
    toCall(out({ id: "2", startTime: "2026-11-05T15:00:00Z", result: "No Answer", duration: 0 })),
    toCall(out({ id: "3", startTime: "2026-11-12T15:00:00Z", duration: 300 })),
    toCall({ ...out({ id: "4", startTime: "2026-11-20T15:00:00Z", result: "Missed", duration: 0 }), direction: "Inbound", from: { phoneNumber: "5551234567" }, to: { phoneNumber: "+1", extensionNumber: "99031" } }),
  ];
  const s = callStats(calls, now);
  assert.equal(s.lastContactAt, "2026-11-12T15:00:00Z");
  assert.equal(s.lastContactBy, "Miguel Cañas");
  assert.equal(s.callStats.attemptsThisMonth, 2);
  assert.equal(s.callStats.reachedThisMonth, 1);
  assert.equal(s.callStats.talkSecTotal, 420);
  assert.equal(s.callStats.missedCallback, true); // the client called last and nobody answered
});

test("followUpUpdate: calls after the 15th move a follow-up forward, never over the team's status", () => {
  const { followUpUpdate } = require("./ringcentral");
  const since = "2026-11-16T05:00:00.000Z";
  const noAnswer = toCall(out({ id: "n", startTime: "2026-11-17T15:00:00Z", result: "No Answer", duration: 0 }));
  const talked = toCall(out({ id: "t", startTime: "2026-11-18T15:00:00Z", duration: 300 }));
  const early = toCall(out({ id: "e", startTime: "2026-11-10T15:00:00Z", duration: 300 }));
  assert.equal(followUpUpdate({ status: "Pending" }, [early], since), null); // before the list
  assert.equal(followUpUpdate({ status: "Pending" }, [noAnswer], since).status, "Attempted-No-Contact");
  const up = followUpUpdate({ status: "Attempted-No-Contact" }, [noAnswer, talked], since);
  assert.equal(up.status, "Reached-Working");
  assert.equal(up.rcCalls, 2);
  assert.equal(up.lastContactBy, "Miguel Cañas");
  const promise = followUpUpdate({ status: "Promise" }, [talked], since);
  assert.equal(promise.status, undefined); // counts only
  assert.equal(promise.rcReached, 1);
});
