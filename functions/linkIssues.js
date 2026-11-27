// functions/linkIssues.js
//
// Collections records the MyCase sync cannot match to exactly one case:
//   - "unlinked": the client's myCaseLink is not a case link (often the MyCase contact
//     page, an invoice or a payment-plan page instead), so its payments never sync;
//   - "shared": several records point at the same case (usually a duplicate), so the
//     sync cannot tell which one gets the payments.
// For an unlinked record the case is suggested from what the link does point at.
// Results go to mycaseLinkIssues/{id} for the Case Setup "Link problems" tab.

const { caseIdFromLink } = require("./mycasePayments");

const ISSUES = "mycaseLinkIssues";
const MYCASE_CASE_URL = "https://law-firm-of-moumita-rahman-pllc.mycase.com/court_cases/";

/** What a non-case MyCase link points at: { contactId } | { invoiceId } | { caseId } | {}. */
function linkHint(link) {
  const s = String(link || "");
  let m = s.match(/mycase\.com\/contacts\/clients\/(\d+)/i);
  if (m) return { contactId: m[1] };
  m = s.match(/mycase\.com\/bills\/(\d+)/i);
  if (m) return { invoiceId: m[1] };
  m = s.match(/court_case_id=(\d+)/i);
  if (m) return { caseId: m[1] };
  return {};
}

const clientName = (c) => `${c.firstName || ""} ${c.lastName || ""}`.trim() || "(no name)";
const isClosed = (c) => String(c.status || "").toLowerCase() === "closed";
const caseSummary = (k, reason) => ({
  caseId: String(k.id), name: k.name || "", status: k.status || "", caseStage: k.caseStage || "",
  practiceArea: k.practiceArea || "", openedDate: k.openedDate || null, clientNames: k.clientNames || [], reason,
});

/**
 * What billing needs to compare a record with a case side by side: the case's invoices
 * (total, paid, balance), its first client's phone, and its last payment.
 */
async function withCaseFacts(db, summary) {
  try {
    const inv = (await db.collection("mycaseInvoices").where("caseId", "==", String(summary.caseId)).get()).docs
      .map((d) => d.data()).filter((i) => i.status !== "draft");
    const k = (await db.collection("mycaseCases").doc(String(summary.caseId)).get()).data() || {};
    let phone = null;
    const firstClient = (k.clientIds || [])[0];
    if (firstClient) {
      const cl = await db.collection("mycaseClients").doc(String(firstClient)).get();
      phone = cl.exists ? (cl.data().phones || [])[0] || null : null;
    }
    return {
      ...summary,
      invoiceTotal: inv.reduce((t, i) => t + Number(i.total || 0), 0),
      invoicePaid: inv.reduce((t, i) => t + Number(i.paid || 0), 0),
      invoiceCount: inv.length,
      openBalance: Number(k.openBalance || 0),
      lastPaymentDate: k.lastPaymentDate || null,
      phone,
    };
  } catch (e) {
    return summary;
  }
}

/** A Collections record's facts for the same comparison. */
function recordFacts(c) {
  const pays = (c.payments || []).filter((p) => Number(p.amount) > 0 && p.status !== "cancelled");
  return {
    invoiceTotal: Number(c.invoiceTotal || 0), initialPaymentAmount: Number(c.initialPaymentAmount || 0),
    startDate: c.initialPaymentDate || c.firstInstallmentDate || null, createdAt: c.createdAt || null,
    paid: pays.reduce((t, p) => t + Number(p.amount || 0), 0), payments: pays.length,
    lastPayment: pays.map((p) => String(p.date || "").slice(0, 10)).filter(Boolean).sort().pop() || null,
    phone: (c.mycasePhones || [])[0] || c.phone || null,
  };
}

/** Candidate cases for one unlinked client, best first. */
async function candidatesFor(db, client) {
  const hint = linkHint(client.myCaseLink);
  const out = new Map();
  const add = (k, reason) => { if (k && !out.has(String(k.id))) out.set(String(k.id), caseSummary(k, reason)); };
  const getCase = async (id) => { const s = await db.collection("mycaseCases").doc(String(id)).get(); return s.exists ? s.data() : null; };

  if (hint.caseId) add(await getCase(hint.caseId), "The link is a payment-plan page for this case.");
  if (hint.invoiceId) {
    const inv = await db.collection("mycaseInvoices").doc(hint.invoiceId).get();
    if (inv.exists && inv.data().caseId) add(await getCase(inv.data().caseId), "The link is an invoice on this case.");
  }
  if (hint.contactId) {
    const snap = await db.collection("mycaseCases").where("clientIds", "array-contains", hint.contactId).get();
    const list = snap.docs.map((d) => d.data())
      // Open cases first, then the most recently opened.
      .sort((a, b) => (a.status === "closed") - (b.status === "closed") || String(b.openedDate || "").localeCompare(String(a.openedDate || "")));
    for (const k of list) add(k, `The link is this client's MyCase contact page; ${list.length === 1 ? "it is their only case" : `one of their ${list.length} cases`}.`);
  }
  // The case title the team typed is usually the MyCase case name, word for word.
  const title = String(client.caseTitle || (hint.contactId || hint.invoiceId || hint.caseId ? "" : client.myCaseLink) || "").trim();
  if (title) {
    const snap = await db.collection("mycaseCases").where("name", "==", title).get();
    snap.docs.forEach((d) => add(d.data(), "The case title matches this MyCase case name exactly."));
  }
  return Promise.all([...out.values()].slice(0, 5).map((k) => withCaseFacts(db, k)));
}

/**
 * Rebuilds mycaseLinkIssues from scratch. clientsByCaseId is store.loadClientsByCaseId()
 * (records already excluded from MyCase matching are left out of it). Returns counts.
 */
async function refreshLinkIssues(db, clientsByCaseId) {
  const all = (await db.collection("clients").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const issues = [];
  for (const c of all) {
    if (isClosed(c) || c.mycaseExcluded) continue;
    if (c.mycaseCaseId || caseIdFromLink(c.myCaseLink)) continue;
    issues.push({
      id: `unlinked_${c.id}`, type: "unlinked", clientId: c.id, clientName: clientName(c),
      status: c.status || "active", caseStatus: c.caseStatus || "", caseTitle: c.caseTitle || "", caseType: c.caseType || "",
      link: c.myCaseLink || "", candidates: await candidatesFor(db, c), ...recordFacts(c),
    });
  }
  for (const [caseId, list] of clientsByCaseId) {
    if (list.length < 2) continue;
    const k = (await db.collection("mycaseCases").doc(String(caseId)).get()).data() || {};
    const facts = await withCaseFacts(db, caseSummary({ ...k, id: caseId }, ""));
    issues.push({
      id: `shared_${caseId}`, type: "shared", caseId: String(caseId), caseName: k.name || "", caseStatus: k.status || "", case: facts,
      clients: list.map((c) => ({
        clientId: c.id, clientName: clientName(c), status: c.status || "active", caseStatus: c.caseStatus || "",
        caseTitle: c.caseTitle || "", invoiceTotal: Number(c.invoiceTotal || 0), payments: (c.payments || []).length,
        paid: (c.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0),
        lastPayment: (c.payments || []).map((p) => p.date).filter(Boolean).sort().pop() || null,
        createdAt: c.createdAt || null, caseType: c.caseType || "", initialPaymentAmount: Number(c.initialPaymentAmount || 0),
        startDate: c.initialPaymentDate || c.firstInstallmentDate || null, source: c.invoiceRoles && Object.keys(c.invoiceRoles).length ? "rebuilt" : "typed",
      })),
    });
  }
  const at = new Date().toISOString();
  const keep = new Set(issues.map((i) => i.id));
  const existing = await db.collection(ISSUES).get();
  let batch = db.batch(); let n = 0;
  const flush = async () => { if (n) { await batch.commit(); batch = db.batch(); n = 0; } };
  for (const d of existing.docs) if (!keep.has(d.id)) { batch.delete(d.ref); if (++n >= 400) await flush(); }
  for (const i of issues) { batch.set(db.collection(ISSUES).doc(i.id), { ...i, refreshedAt: at }); if (++n >= 400) await flush(); }
  await flush();
  return {
    unlinked: issues.filter((i) => i.type === "unlinked").length,
    withSuggestion: issues.filter((i) => i.type === "unlinked" && i.candidates.length).length,
    shared: issues.filter((i) => i.type === "shared").length,
  };
}

/**
 * "Link to this case": point the record at the MyCase case. In the rebuild database the
 * record then goes to "Existing clients to tag", so its history is rebuilt from MyCase.
 */
async function linkClientToCase(db, { clientId, caseId, by }) {
  const caseRef = db.collection("mycaseCases").doc(String(caseId));
  const [clientSnap, caseSnap] = await Promise.all([db.collection("clients").doc(clientId).get(), caseRef.get()]);
  if (!clientSnap.exists) throw new Error("Client not found.");
  if (!caseSnap.exists) throw new Error("That case is not in the MyCase mirror.");
  const others = (await db.collection("clients").where("mycaseCaseId", "==", String(caseId)).get()).docs.filter((d) => d.id !== clientId);
  if (others.length) throw new Error("Another Collections record already uses this case. Resolve that first.");
  const at = new Date().toISOString();
  await clientSnap.ref.update({
    myCaseLink: MYCASE_CASE_URL + caseId, mycaseCaseId: String(caseId),
    previousMyCaseLink: clientSnap.data().myCaseLink || "", linkedBy: by || null, linkedAt: at,
  });
  await caseRef.set({ trackedClientId: clientId, needsSetup: false, needsTagging: db.databaseId === "mycase-rebuild" }, { merge: true });
  await db.collection(ISSUES).doc(`unlinked_${clientId}`).delete();
  return { clientId, caseId: String(caseId) };
}

/**
 * Several records on one case: billing keeps one for MyCase. The others stay in Collections
 * as they are, but are no longer matched to the case (mycaseExcluded), so they get no
 * MyCase payments and the sync can match the case again.
 */
async function keepRecordForCase(db, { caseId, clientId, by }) {
  const snap = await db.collection("clients").get();
  const onCase = snap.docs.filter((d) => {
    const c = d.data();
    return !c.mycaseExcluded && String(c.mycaseCaseId || caseIdFromLink(c.myCaseLink) || "") === String(caseId);
  });
  if (!onCase.some((d) => d.id === clientId)) throw new Error("That record is not on this case.");
  const at = new Date().toISOString();
  for (const d of onCase) {
    if (d.id === clientId) continue;
    await d.ref.update({ mycaseExcluded: true, mycaseExcludedReason: `Duplicate of ${clientId} on MyCase case ${caseId}`, mycaseExcludedBy: by || null, mycaseExcludedAt: at });
  }
  await db.collection("clients").doc(clientId).update({ mycaseCaseId: String(caseId) });
  await db.collection("mycaseCases").doc(String(caseId)).set({ trackedClientId: clientId }, { merge: true });
  await db.collection(ISSUES).doc(`shared_${caseId}`).delete();
  return { kept: clientId, excluded: onCase.length - 1 };
}

module.exports = { ISSUES, linkHint, candidatesFor, refreshLinkIssues, linkClientToCase, keepRecordForCase };
