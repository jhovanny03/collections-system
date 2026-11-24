// GENERATED from src/billing/contact.js by scripts/build-shared.js. Do not edit here.
"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/billing/contact.js
// When we last reached a client, and how to call them.
//  - RingCentral calls (clients.lastContactAt, written by the call import) are the proof.
//  - Follow-up calls logged by hand count too, so the flag works before RingCentral is on.
var _dates = require('../utils/dates');

 const NO_CONTACT_DAYS = 30; exports.NO_CONTACT_DAYS = NO_CONTACT_DAYS;

/** { at: Date, by, source: "ringcentral" | "logged" } or null. */
 function lastContactOf(client) {
  let best = null;
  const rc = _dates.parseDate.call(void 0, client.lastContactAt);
  if (rc) best = { at: rc, by: client.lastContactBy || "", source: "ringcentral" };
  for (const log of [...(client.communicationLogs || []), ...(client.communicationLog || [])]) {
    const msg = String(log.message || "");
    const isCall = msg.startsWith("[Follow-Ups") || msg.startsWith("Client promised to pay");
    if (!isCall) continue;
    const d = _dates.parseDate.call(void 0, log.timestamp);
    if (d && (!best || d > best.at)) best = { at: d, by: log.user || "", source: "logged" };
  }
  return best;
} exports.lastContactOf = lastContactOf;

/** Days since the last contact (null = never). */
 function daysSinceContact(client, now = new Date()) {
  const lc = lastContactOf(client);
  return lc ? Math.floor((now - lc.at) / 864e5) : null;
} exports.daysSinceContact = daysSinceContact;

/** Owes money and nobody has reached them in 30+ days (or ever). */
 function needsContact(client, owed, now = new Date()) {
  if (!(owed > 0)) return false;
  const d = daysSinceContact(client, now);
  return d == null || d >= exports.NO_CONTACT_DAYS;
} exports.needsContact = needsContact;

/** Opens the RingCentral app ready to dial. */
 const callLink = (e164) => `rcapp://r/call?number=${encodeURIComponent(e164)}`; exports.callLink = callLink;

/** "(555) 123-4567" for US numbers. */
 function displayPhone(e164) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(String(e164 || ""));
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : String(e164 || "");
} exports.displayPhone = displayPhone;

 const ago = (d, now = new Date()) => {
  if (!d) return "never";
  const days = Math.floor((now - d) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const m = Math.floor(days / 30);
  return m < 12 ? `${m} month${m === 1 ? "" : "s"} ago` : `${Math.floor(m / 12)}+ year${m >= 24 ? "s" : ""} ago`;
}; exports.ago = ago;
