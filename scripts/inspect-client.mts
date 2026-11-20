// READ-ONLY (mycase-rebuild): everything about one client vs MyCase, to explain a balance.
// Run from collections-system:  ../MyCase-Integration/node_modules/.bin/tsx scripts/inspect-client.mts "OKOLO"
import { createRequire } from "module";
import path from "path";
const L: any = await import("../src/billing/ledger.js");
const P: any = await import("../src/billing/plans.js");
const planLedger = L.planLedger || L.default.planLedger;
const clientPosition = L.clientPosition || L.default.clientPosition;
const planViews = P.planViews || P.default.planViews;

const require = createRequire(path.resolve("functions/package.json"));
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
admin.initializeApp({ credential: admin.credential.cert(require(path.join(process.env.USERPROFILE!, ".collections-secrets", "firebase-rebuild-writer.json"))) });
const db = getFirestore(admin.app(), "mycase-rebuild");
const plain = (v: any): any => (v && typeof v.toDate === "function" ? v.toDate().toISOString() : Array.isArray(v) ? v.map(plain) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v);
const { caseIdFromLink } = require("./mycasePayments.js");

const q = (process.argv[2] || "").toUpperCase();
const all = (await db.collection("clients").get()).docs.map((d: any) => ({ id: d.id, ...plain(d.data()) }));
const hits = all.filter((c: any) => `${c.firstName} ${c.lastName} ${c.caseTitle}`.toUpperCase().includes(q));
for (const c of hits) {
  console.log("==", c.id, c.firstName, c.lastName, "|", c.caseTitle, "| status", c.status, "| source", c.source || (c.invoiceRoles ? "rebuilt" : "hand"));
  const fields = ["invoiceTotal", "initialPaymentAmount", "initialPaymentDate", "firstInstallmentDate", "expectedAnchor", "installmentAmount", "skipMonths", "invoiceAdjustments", "invoiceRoles", "plans", "installmentSchedule", "rebuild"];
  for (const f of fields) if (c[f] !== undefined) console.log(`  ${f}:`, JSON.stringify(c[f]).slice(0, 400));
  const pays = (c.payments || []).map((p: any) => `${p.date}:${p.amount}${p.kind ? "(" + p.kind + ")" : ""}#${p.invoiceId || ""}`);
  console.log(`  payments (${pays.length}), sum ${(c.payments || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0)}:`, pays.join(" "));
  console.log("  position:", JSON.stringify(clientPosition(c, new Date())));
  for (const v of planViews(c)) {
    const l = planLedger(v, new Date());
    console.log("  ledger:", l.months.map((m: any) => `${m.ym}:${m.amount}/${m.paid}`).join(" "), "| bal", l.balance, "paid", l.paidTotal);
  }
  const caseId = c.mycaseCaseId || caseIdFromLink(c.myCaseLink || "");
  if (caseId) {
    const k = (await db.doc(`mycaseCases/${caseId}`).get()).data() || {};
    console.log("  MyCase case", caseId, "| status", k.status, "| flatFee", k.flatFee, "| outstanding", k.outstandingBalance, "| uninvoiced", k.uninvoicedFee);
    const inv = (await db.collection("mycaseInvoices").where("caseId", "==", caseId).get()).docs.map((d: any) => d.data());
    inv.forEach((i: any) => console.log(`    invoice ${i.id} #${i.number || i.invoiceNumber} ${i.status} total ${i.total} paid ${i.paid ?? i.paidAmount} due ${i.balance ?? i.due}`));
    const mp = (await db.collection("mycasePayments").where("caseId", "==", caseId).get()).docs.map((d: any) => d.data()).filter((p: any) => p.status === "success");
    console.log(`    MyCase payments (${mp.length}) sum ${mp.reduce((s: number, p: any) => s + Number(p.amount), 0)}:`, mp.sort((a: any, b: any) => String(a.date).localeCompare(b.date)).map((p: any) => `${p.date}:${p.amount}#${p.invoiceId}`).join(" "));
  }
}
process.exit(0);
