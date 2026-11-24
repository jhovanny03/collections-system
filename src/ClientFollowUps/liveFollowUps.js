// src/ClientFollowUps/liveFollowUps.js
// The current month's follow-up list, live from the same numbers as Home (src/billing/
// portfolio.js), with what the team saved on each client's item (status, notes, next
// date, reason) kept on top. So "Still owe" always equals Home's "Past due this month":
//   current  clients who were up to date going into the month and have not paid all of it
//   behind   clients who already owed earlier months
//   paid     clients on the saved list who no longer owe (paid, closed or paused)
// A client who catches up during the month moves into "current" at once (roll-over).
import { FOLLOW_UP_STATUS } from "./followUps.types";

/** The 16th of the list's month: calls from then on count as follow-up calls. */
export const followUpStart = (cohortId) => {
  const [y, m] = cohortId.split("-").map(Number);
  return new Date(y, m - 1, 16);
};

const NOT_STARTED = new Set([FOLLOW_UP_STATUS.PENDING, FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT, "", undefined, null]);

/**
 * Status from RingCentral when nobody set one by hand: a call that reached the client
 * after the 15th -> "Contacted" (Reached-Working); a call that did not -> "Called, no
 * answer" (Attempted-No-Contact). A status the team chose (promise, partial...) stays.
 */
export function autoStatus(item, client, cohortId) {
  const stored = item.status || FOLLOW_UP_STATUS.PENDING;
  if (!client || !NOT_STARTED.has(stored)) return { status: stored, auto: false };
  const since = followUpStart(cohortId).toISOString();
  // rcCalls / rcReached: RingCentral calls since the 16th, written on the item by the call
  // import (functions/ringcentral.js); the client's last call covers anything newer.
  const last = client.lastCall && client.lastCall.at >= since ? client.lastCall : null;
  const reached = (item.rcReached || 0) > 0 || !!(last && last.connected);
  const called = (item.rcCalls || 0) > 0 || !!last;
  if (reached) return { status: FOLLOW_UP_STATUS.REACHED_WORKING, auto: stored !== FOLLOW_UP_STATUS.REACHED_WORKING };
  if (called && stored === FOLLOW_UP_STATUS.PENDING) return { status: FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT, auto: true };
  return { status: stored, auto: false };
}

export function liveItems(stored, rows, byId, cohortId) {
  const saved = new Map((stored || []).map((i) => [i.clientId || i.id, i]));
  const out = [];
  const listed = new Set();
  for (const r of rows) {
    if (r.status === "closed") continue;
    const missed = r.expectedThisMonth - r.collectedThisMonth;
    // Same rule as Home's Past due this month: no older month owed on any plan.
    const section = r.pastMonthsDue <= 0.005 && missed > 0.005 ? "current" : r.amountDue > 0.005 && r.pastMonthsDue > 0.005 ? "behind" : null;
    if (!section) continue;
    const s = saved.get(r.id) || {};
    const client = byId.get(r.id);
    listed.add(r.id);
    const it = {
      ...s,
      id: r.id,
      clientId: r.id,
      clientName: s.clientName || r.name,
      myCaseLink: r.myCaseLink || s.myCaseLink || "",
      section,
      planEnded: r.planEnded,
      monthsBehind: r.missedMonths,
      pastDueTotal: r.amountDue,
      amountDueCurrentMonth: section === "current" ? missed : r.dueThisMonth,
      resolvedReason: null,
      paidDate: null,
      saved: !!saved.get(r.id),
    };
    const st = autoStatus(it, client, cohortId);
    out.push({ ...it, status: st.status, autoStatus: st.auto });
  }
  // On the saved list but no longer owing: paid (or closed / paused / plan changed).
  for (const s of stored || []) {
    const id = s.clientId || s.id;
    if (listed.has(id)) continue;
    const r = rows.find((x) => x.id === id);
    const gone = !r || r.status === "closed" || r.status === "paused";

    out.push({
      ...s,
      id,
      clientId: id,
      // Payments come from MyCase now, so "paid in MyCase, type it in" no longer applies.
      resolvedReason: gone ? "no_longer_due" : "paid",
      paidDate: r?.lastPayment?.date || s.paidDate || null,
      saved: true,
      status: s.status || FOLLOW_UP_STATUS.PENDING,
    });
  }
  return out;
}
