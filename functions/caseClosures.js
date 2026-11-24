// functions/caseClosures.js
// Collections follows MyCase on whether a case is closed:
//  - case closed in MyCase  -> client closed here (status "closed"), with a log note
//  - case reopened in MyCase -> client reopened, ONLY if this sync is what closed it
//    (a client the team closed by hand stays closed)
//  - case name starts with "F" in MyCase (the team renames "A (..)" to "F (..)" once the
//    case is filed) -> case status ACTIVE becomes FILED here, with a log note. Never
//    goes back, and FILED / APPROVED set by hand are left alone.
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

/** "F (10-24) NAME ..." / "F(10-24) ..." -> true. */
const isFiledName = (name) => /^\s*F\s*\(/i.test(String(name || ""));

/** Case status update when MyCase shows the case as filed, or null. Pure, for tests. */
function filedUpdate(client, caseDoc, nowIso) {
  if (!client || !caseDoc || String(client.status || "active").toLowerCase() === "closed") return null;
  const now = String(client.caseStatus || "").toUpperCase();
  if (!isFiledName(caseDoc.name) || (now && now !== "ACTIVE")) return null;
  return {
    update: { caseStatus: "FILED", caseStatusSetBy: BY, caseStatusSetAt: nowIso },
    log: "Case status set to Filed: the case name in MyCase now starts with F.",
  };
}

/**
 * Apply closures for the given case ids (or every tracked case with all=true).
 * Returns { closed, reopened, names: [...] }.
 */
async function syncCaseClosures(db, { caseIds = [], clientsByCaseId, all = false, admin = null, dryRun = false } = {}) {
  const ids = all ? [...clientsByCaseId.keys()] : caseIds.filter((id) => clientsByCaseId.has(String(id)));
  const nowIso = new Date().toISOString();
  const out = { closed: 0, reopened: 0, filed: 0, names: [] };
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300).map(String);
    const snaps = await db.getAll(...chunk.map((id) => db.collection("mycaseCases").doc(id)));
    const batch = db.batch();
    let writes = 0;
    snaps.forEach((s) => {
      if (!s.exists) return;
      for (const client of clientsByCaseId.get(s.id) || []) {
        const arrayUnion = admin ? admin.firestore.FieldValue.arrayUnion : require("firebase-admin").firestore.FieldValue.arrayUnion;
        const f = filedUpdate(client, s.data(), nowIso);
        if (f) {
          out.filed++;
          if (!dryRun) {
            batch.update(db.collection("clients").doc(client.id), { ...f.update, communicationLogs: arrayUnion({ message: f.log, timestamp: nowIso, user: BY }) });
            writes++;
          }
        }
        const r = closureUpdate(client, s.data(), nowIso);
        if (!r) continue;
        if (r.update.status === "closed") out.closed++;
        else out.reopened++;
        if (out.names.length < 50) out.names.push(`${client.firstName || ""} ${client.lastName || ""}`.trim() + (r.update.status === "closed" ? "" : " (reopened)"));
        if (dryRun) continue;
        const logEntry = { message: r.log, timestamp: nowIso, user: BY };
        batch.update(db.collection("clients").doc(client.id), { ...r.update, communicationLogs: arrayUnion(logEntry) });
        writes++;
      }
    });
    if (writes) await batch.commit();
    // (A client can get both a filed and a closure update: two updates to one doc in a
    // batch are applied in order, which is fine.)
  }
  return out;
}

module.exports = { closureUpdate, filedUpdate, isFiledName, syncCaseClosures, CLOSED_BY: BY };
