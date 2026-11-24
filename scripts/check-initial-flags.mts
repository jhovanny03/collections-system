// READ-ONLY: do the sync's initial flags cover the clients the ledger says are short?
import { createRequire } from "module";
import path from "path";
const L: any = await import("../src/billing/ledger.js");
const unpaidInitial = L.unpaidInitial || L.default.unpaidInitial;
const require = createRequire(path.resolve("functions/package.json"));
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { caseIdFromLink } = require("./mycasePayments.js");
admin.initializeApp({ credential: admin.credential.cert(require(path.join(process.env.USERPROFILE!, ".collections-secrets", "firebase-rebuild-writer.json"))) });
const db = getFirestore(admin.app(), "mycase-rebuild");
const plain = (v: any): any => (v && typeof v.toDate === "function" ? v.toDate().toISOString() : Array.isArray(v) ? v.map(plain) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v);
const clients = (await db.collection("clients").get()).docs.map((d: any) => ({ id: d.id, ...plain(d.data()) })).filter((c: any) => String(c.status || "active") !== "closed");
const flagged = new Map((await db.collection("mycaseCases").where("initialState", "==", "client").get()).docs.map((d: any) => [d.id, d.data()]));
const short = clients.filter((c: any) => unpaidInitial(c) > 0.5);
const missing = short.filter((c: any) => !flagged.has(String(c.mycaseCaseId || caseIdFromLink(c.myCaseLink || ""))));
console.log(`ledger says ${short.length} rebuilt clients are short; ${short.length - missing.length} are on the page`);
for (const c of missing.slice(0, 8)) {
  const k = String(c.mycaseCaseId || caseIdFromLink(c.myCaseLink || ""));
  const kd = (await db.doc(`mycaseCases/${k}`).get()).data() || {};
  console.log(`  missing: ${c.firstName} ${c.lastName} owes ${unpaidInitial(c)} | case ${k} status ${kd.status} tracked ${kd.trackedClientId} state ${kd.initialState}`);
}
const byState: any = {};
for (const [, k] of flagged as any) { const c = clients.find((x: any) => x.id === k.trackedClientId); const src = c && c.invoiceRoles && Object.keys(c.invoiceRoles).length ? "rebuilt" : "hand"; byState[src] = (byState[src] || 0) + 1; }
console.log("on the page by source:", JSON.stringify(byState));
process.exit(0);
