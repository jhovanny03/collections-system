// functions/ringcentral.js
// RingCentral (RingEX) call log -> proof of contact in Collections.
// Reads the company call log for the billing team's extensions, matches each call to a
// client by phone number (clients.mycasePhones), and records it:
//   ringcentralCalls/{callId}        one document per call (idempotent)
//   clients/{id}.lastCall / lastContactAt / callStats   (what the profile shows)
//   clients/{id}.communicationLogs   "Call (RingCentral): outbound, answered, 4 min · Arleen"
// Auth: private server-only app, JWT flow. Secrets RC_CLIENT_ID, RC_CLIENT_SECRET, RC_JWT.
// Pure helpers first (tested in ringcentral.test.js), then the network / Firestore parts.

const { normalizePhone } = require("./phones");

/** The billing team: RingCentral extension number -> how they appear in the app. */
const BILLING_EXTENSIONS = {
  "99159": "Miguel Cañas",
  "99140": "Arianna Orantes",
  "99211": "David Cuellar",
  "99088": "Francisco Jimenez",
  "99031": "Arleen Francisco",
};

/** Call results RingCentral uses for "the call connected". */
const CONNECTED = new Set(["Call connected", "Accepted", "Answered Not Accepted"]);

/**
 * RingCentral says "Call connected" for an outbound call that reached voicemail too. A
 * connected outbound call shorter than this is counted as "likely voicemail", not a talk.
 */
const TALK_MIN_SEC = 40;

const norm = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Which billing team member a call party is: extension number first, then name. */
function memberOf(party, extensions) {
  if (!party) return null;
  const byExt = extensions[String(party.extensionNumber || "")];
  if (byExt) return byExt;
  return Object.values(extensions).find((n) => party.name && norm(party.name).startsWith(norm(n))) || null;
}

/**
 * One call-log record (view=Detailed, or Simple) -> our call document, or null when it is
 * not a voice call made or taken by the billing team.
 * Client calls ring the main number / a queue, so on inbound calls the person who took it
 * is only on a leg: we use the leg that reached a team member (the answered one first).
 */
function toCall(rec, extensions = BILLING_EXTENSIONS) {
  if (!rec || rec.type !== "Voice") return null;
  const outbound = rec.direction === "Outbound";
  let ours = outbound ? rec.from : rec.to;
  const theirs = outbound ? rec.to : rec.from;
  let by = memberOf(ours, extensions);
  let result = String(rec.result || "");
  let duration = Number(rec.duration || 0);
  if (!by && !outbound) {
    const legs = (rec.legs || []).filter((l) => l.direction === "Inbound" && memberOf(l.to, extensions));
    const leg = legs.find((l) => CONNECTED.has(String(l.result || ""))) || legs[0];
    if (leg) {
      ours = leg.to;
      by = memberOf(leg.to, extensions);
      result = String(leg.result || result);
      duration = Number(leg.duration || duration);
    }
  }
  if (!by) return null;
  const phone = normalizePhone(theirs && theirs.phoneNumber);
  if (!phone) return null;
  const ext = String((ours && (ours.extensionNumber || ours.extensionId)) || "");
  const extNumber = String((ours && ours.extensionNumber) || "");
  const linked = CONNECTED.has(result) && duration > 0;
  const shortOut = outbound && linked && duration < TALK_MIN_SEC;
  const connected = linked && !shortOut;
  return {
    id: String(rec.id),
    sessionId: rec.telephonySessionId || rec.sessionId || null,
    at: rec.startTime,
    direction: outbound ? "outbound" : "inbound",
    phone,
    by,
    extension: extNumber || ext,
    durationSec: duration,
    result,
    connected,
    voicemail: shortOut || result === "Voicemail" || /voicemail/i.test(String(rec.reason || "")),
    missed: !outbound && !connected,
  };
}

const minutes = (sec) => (sec >= 60 ? `${Math.round(sec / 60)} min` : `${sec} sec`);

/** The line written to the client's communication log for a call. */
function logLine(call) {
  const what = call.direction === "outbound"
    ? call.connected
      ? `called the client, talked ${minutes(call.durationSec)}`
      : call.voicemail
        ? call.result === "Call connected" ? `called, short call (${minutes(call.durationSec)}, likely voicemail)` : "called, left a voicemail"
        : `called, no answer (${call.result || "not answered"})`
    : call.connected ? `client called in, talked ${minutes(call.durationSec)}` : "client called in, missed";
  return `Call (RingCentral): ${what}.`;
}

/**
 * Per-client summary from all of a client's calls (newest last is fine; we sort).
 * lastContactAt = last call that reached the client (talked, or a voicemail we left).
 */
function callStats(calls, now = new Date()) {
  const sorted = [...calls].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisMonth = sorted.filter((c) => c.at >= monthStart);
  const contact = sorted.filter((c) => c.connected || (c.direction === "outbound" && c.voicemail));
  const last = sorted[sorted.length - 1] || null;
  const lastContact = contact[contact.length - 1] || null;
  const missedIn = sorted.filter((c) => c.missed);
  return {
    lastCall: last && { at: last.at, direction: last.direction, connected: last.connected, voicemail: last.voicemail, durationSec: last.durationSec, by: last.by, result: last.result },
    lastContactAt: lastContact ? lastContact.at : null,
    lastContactBy: lastContact ? lastContact.by : null,
    callStats: {
      callsThisMonth: thisMonth.length,
      attemptsThisMonth: thisMonth.filter((c) => c.direction === "outbound").length,
      receivedThisMonth: thisMonth.filter((c) => c.direction === "inbound").length,
      // Calls this month where someone actually talked with the client (made or received).
      reachedThisMonth: thisMonth.filter((c) => c.connected).length,
      totalCalls: sorted.length,
      talkSecTotal: sorted.reduce((s, c) => s + (c.connected ? c.durationSec : 0), 0),
      // A client call nobody answered, after our last outbound call: call them back.
      missedCallback: !!(missedIn.length && (!last || last.missed)),
      lastMissedAt: missedIn.length ? missedIn[missedIn.length - 1].at : null,
    },
  };
}

/* --------------------------------- network --------------------------------- */

const SERVER = "https://platform.ringcentral.com";

async function getToken({ clientId, clientSecret, jwt, fetchImpl = fetch }) {
  const res = await fetchImpl(`${SERVER}/restapi/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }).toString(),
  });
  if (!res.ok) throw new Error(`RingCentral sign-in failed (${res.status})`);
  return (await res.json()).access_token;
}

/** Company call log since `dateFrom` (ISO), all pages. Heavy API: 10 requests/min. */
// The app may be shared with another integration, so a rate-limit answer waits and retries.
async function fetchCallLog({ token, dateFrom, dateTo = null, fetchImpl = fetch, perPage = 1000, maxPages = 20, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    // Detailed: inbound calls name the person who took them only on the call legs.
    const q = new URLSearchParams({ type: "Voice", view: "Detailed", dateFrom, perPage: String(perPage), page: String(page) });
    if (dateTo) q.set("dateTo", dateTo);
    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetchImpl(`${SERVER}/restapi/v1.0/account/~/call-log?${q}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status !== 429) break;
      const wait = Number(res.headers && res.headers.get && res.headers.get("retry-after")) || 60;
      await sleep(Math.min(wait, 90) * 1000);
    }
    if (res.status === 429) throw new Error("RingCentral rate limit: try again in a minute");
    if (!res.ok) throw new Error(`RingCentral call log failed (${res.status})`);
    const body = await res.json();
    out.push(...(body.records || []));
    if (!body.navigation || !body.navigation.nextPage) break;
  }
  return out;
}

/* -------------------------------- Firestore -------------------------------- */

/**
 * Import calls since the saved position (integrations/ringcentral.lastTo) or `since`.
 * Returns { read, billing, matched, unmatched, clientsUpdated }.
 */
async function importCalls(db, { token, since, now = new Date(), fetchImpl = fetch, admin, rescan = false }) {
  const posRef = db.doc("integrations/ringcentral");
  const pos = (await posRef.get()).data() || {};
  // Re-read 2 hours back each time: records can appear a little after the call ends.
  // rescan: ignore the saved position and read again from `since`.
  const from = pos.lastTo && !rescan ? new Date(new Date(pos.lastTo).getTime() - 2 * 3600e3).toISOString() : since;
  const records = await fetchCallLog({ token, dateFrom: from, dateTo: now.toISOString(), fetchImpl });
  const calls = records.map((r) => toCall(r)).filter(Boolean);

  // phone -> client ids (open clients only)
  const byPhone = new Map();
  (await db.collection("clients").where("mycasePhones", "!=", null).get()).forEach((d) => {
    const c = d.data();
    if (String(c.status || "active").toLowerCase() === "closed") return;
    for (const p of c.mycasePhones || []) {
      if (!byPhone.has(p)) byPhone.set(p, []);
      byPhone.get(p).push(d.id);
    }
  });

  let matched = 0;
  let unmatched = 0;
  const touched = new Set();
  const FieldValue = admin.firestore.FieldValue;
  for (const call of calls) {
    const ids = byPhone.get(call.phone) || [];
    const ref = db.collection("ringcentralCalls").doc(call.id);
    const existing = await ref.get();
    // One person, several cases (or relatives sharing a phone): the call counts for each record.
    await ref.set({ ...call, clientIds: ids, importedAt: existing.exists ? existing.data().importedAt : now.toISOString() }, { merge: true });
    if (!ids.length) {
      unmatched++;
      continue;
    }
    matched++;
    const entry = { message: logLine(call), timestamp: call.at, user: call.by, source: "ringcentral", callId: call.id };
    if (!existing.exists) {
      for (const id of ids) {
        await db.doc(`clients/${id}`).update({ communicationLogs: FieldValue.arrayUnion(entry) });
      }
    } else if (logLine(existing.data()) !== entry.message) {
      // The call was read differently than last time: rewrite only our own line for it.
      for (const id of ids) {
        const cref = db.doc(`clients/${id}`);
        const logs = ((await cref.get()).data() || {}).communicationLogs || [];
        if (!logs.some((l) => l && l.callId === call.id)) continue;
        await cref.update({ communicationLogs: logs.map((l) => (l && l.callId === call.id ? entry : l)) });
      }
    }
    ids.forEach((id) => touched.add(id));
  }

  // Refresh the summary on every client that had a call in this window, and their item on
  // this month's follow-up list (calls from the 16th on).
  const cohortId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const listFrom = new Date(now.getFullYear(), now.getMonth(), 16).toISOString();
  let followUps = 0;
  for (const id of touched) {
    const snap = await db.collection("ringcentralCalls").where("clientIds", "array-contains", id).get();
    const calls = snap.docs.map((d) => d.data());
    const stats = callStats(calls, now);
    await db.doc(`clients/${id}`).update(stats);
    if (now.toISOString() < listFrom) continue;
    const itemRef = db.doc(`followUpsCohorts/${cohortId}/items/${id}`);
    const item = await itemRef.get();
    if (!item.exists) continue;
    const upd = followUpUpdate(item.data(), calls, listFrom);
    if (upd) {
      await itemRef.update(upd);
      followUps++;
    }
  }
  await posRef.set({ lastTo: now.toISOString(), lastRunAt: now.toISOString(), lastRead: records.length }, { merge: true });
  return { read: records.length, billing: calls.length, matched, unmatched, clientsUpdated: touched.size, followUps };
}

/**
 * Follow-up item update from a client's calls since the list date (the 16th), or null.
 * Counts the calls, and moves a status nobody set by hand forward:
 *   Pending -> Attempted-No-Contact ("Called, no answer") once a call was made,
 *   Pending / Attempted -> Reached-Working ("Contacted") once a call reached the client.
 * A status the team chose (promise, partial payment, resolved) is never changed.
 */
function followUpUpdate(item, calls, sinceIso) {
  const since = calls.filter((c) => c.at >= sinceIso).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  if (!since.length) return null;
  const reached = since.filter((c) => c.connected);
  const last = since[since.length - 1];
  const lastReached = reached[reached.length - 1];
  const upd = {
    rcCalls: since.length,
    rcReached: reached.length,
    rcLastCallAt: last.at,
    rcLastCallBy: last.by,
  };
  const status = item.status || "Pending";
  if (reached.length && (status === "Pending" || status === "Attempted-No-Contact")) {
    Object.assign(upd, { status: "Reached-Working", statusSetBy: "RingCentral", lastContactAt: lastReached.at, lastContactBy: lastReached.by, lastContactSummary: logLine(lastReached) });
  } else if (status === "Pending") {
    Object.assign(upd, { status: "Attempted-No-Contact", statusSetBy: "RingCentral", lastContactAt: last.at, lastContactBy: last.by, lastContactSummary: logLine(last) });
  }
  const same = Object.keys(upd).every((k) => item[k] === upd[k]);
  return same ? null : upd;
}

module.exports = { BILLING_EXTENSIONS, toCall, logLine, callStats, followUpUpdate, getToken, fetchCallLog, importCalls };
