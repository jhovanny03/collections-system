// functions/caseClosures.js
// Collections follows MyCase on whether a case is closed:
//  - case closed in MyCase  -> client closed here (status "closed"), with a log note
//  - case reopened in MyCase -> client reopened, ONLY if this sync is what closed it
//    (a client the team closed by hand stays closed)
// Runs on every MyCase sync for the cases that changed; `all: true` sweeps every case.

const BY = "MyCase sync";

/** What to write on a client given its MyCase case, or null for nothing. Pure, for tests. */
function closureUpdate(client, caseDoc, nowIso) {
  if (!client || !caseDoc) return null;
  const caseStatus = String(caseDoc.status || "").toLowerCase();
  const status = String(client.status || "active").toLowerCase();
  if (caseStatus === "closed" && status !== "closed") {
    const when = caseDoc.closedDate || nowIso.slice(0, 10);
    return {
      update: { status: "closed", closedAt: nowIso, closedBy: BY, closedReason: "Closed in MyCase", mycaseClosedDate: caseDoc.closedDate || null, statusBeforeMyCaseClose: status },
      log: `Closed automatically: the case was closed in MyCase${caseDoc.closedDate ? ` on ${when}` : ""}.`,
    };
  }
  if (caseStatus === "open" && status === "closed" && client.closedBy === BY) {
    return {
      update: { status: client.statusBeforeMyCaseClose === "paused" ? "paused" : "active", closedAt: null, closedBy: null, closedReason: null, mycaseClosedDate: null, statusBeforeMyCaseClose: null, reopenedAt: nowIso, reopenedBy: BY },
      log: "Reopened automatically: the case was reopened in MyCase.",
    };
  }
  return null;
}

/**
 * Apply closures for the given case ids (or every tracked case with all=true).
 * Returns { closed, reopened, names: [...] }.
 */
async function syncCaseClosures(db, { caseIds = [], clientsByCaseId, all = false, admin = null, dryRun = false } = {}) {
  const ids = all ? [...clientsByCaseId.keys()] : caseIds.filter((id) => clientsByCaseId.has(String(id)));
  const nowIso = new Date().toISOString();
  const out = { closed: 0, reopened: 0, names: [] };
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300).map(String);
    const snaps = await db.getAll(...chunk.map((id) => db.collection("mycaseCases").doc(id)));
    const batch = db.batch();
    let writes = 0;
    snaps.forEach((s) => {
      if (!s.exists) return;
      for (const client of clientsByCaseId.get(s.id) || []) {
        const r = closureUpdate(client, s.data(), nowIso);
        if (!r) continue;
        if (r.update.status === "closed") out.closed++;
        else out.reopened++;
        if (out.names.length < 50) out.names.push(`${client.firstName || ""} ${client.lastName || ""}`.trim() + (r.update.status === "closed" ? "" : " (reopened)"));
        if (dryRun) continue;
        const logEntry = { message: r.log, timestamp: nowIso, user: BY };
        const arrayUnion = admin ? admin.firestore.FieldValue.arrayUnion : require("firebase-admin").firestore.FieldValue.arrayUnion;
        batch.update(db.collection("clients").doc(client.id), { ...r.update, communicationLogs: arrayUnion(logEntry) });
        writes++;
      }
    });
    if (writes) await batch.commit();
  }
  return out;
}

module.exports = { closureUpdate, syncCaseClosures, CLOSED_BY: BY };
