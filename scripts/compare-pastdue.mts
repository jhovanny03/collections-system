// READ-ONLY diagnostic (mycase-rebuild): why Home's past-due count differs from the follow-up list.
// Run from collections-system:  ../MyCase-Integration/node_modules/.bin/tsx scripts/compare-pastdue.mts
import { createRequire } from "module";
import path from "path";
const mod: any = await import("../src/billing/portfolio.js");
const clientRows = mod.clientRows || mod.default.clientRows;

const require = createRequire(path.resolve("functions/package.json"));
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
admin.initializeApp({ credential: admin.credential.cert(require(path.join(process.env.USERPROFILE!, ".collections-secrets", "firebase-rebuild-writer.json"))) });
const db = getFirestore(admin.app(), "mycase-rebuild");

const toPlain = (v: any): any => {
  if (v && typeof v.toDate === "function") return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(toPlain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)]));
  return v;
};

const clients = (await db.collection("clients").get()).docs.map((d: any) => ({ id: d.id, ...toPlain(d.data()) }));
const items = new Map((await db.collection("followUpsCohorts/2026-11/items").get()).docs.map((d: any) => [d.id, d.data()]));
const rows = clientRows(clients, new Date());
const plan = rows.filter((r: any) => r.status !== "closed" && r.inPlan && r.status !== "paused");
const pd = plan.filter((r: any) => r.amountDue > 0);
const buckets: Record<string, number> = {};
const ex: Record<string, string[]> = {};
for (const r of pd) {
  const it: any = items.get(r.id);
  const k = !it ? `not on list (${r.source})` : it.resolvedReason ? `on list, ${it.resolvedReason}` : `on list, open ${it.section}`;
  buckets[k] = (buckets[k] || 0) + 1;
  (ex[k] = ex[k] || []).length < 3 && ex[k].push(`${r.name} due ${r.amountDue} missed ${r.missedMonths}`);
}
console.log("plan:", plan.length, "| paid in full in plan:", plan.filter((r: any) => r.balance <= 0 && r.amountDue <= 0).length, "| past due:", pd.length);
console.log(JSON.stringify(buckets, null, 1));
console.log(JSON.stringify(ex, null, 1));
// Why are some missing from the follow-up list? Run the server rule on them.
process.env.FUNCTIONS_UNIT_TEST = "1";
const { computeFollowUpItemForClient } = require("./index.js")._test;
const missing = pd.filter((r: any) => !items.get(r.id));
const why: Record<string, number> = {};
const whyEx: Record<string, string[]> = {};
for (const r of missing) {
  const c: any = clients.find((x: any) => x.id === r.id);
  const doc = { id: c.id, data: () => (db as any) && c };
  const it = computeFollowUpItemForClient(doc, new Date(2026, 10, 19, 12));
  let k = it ? "server WOULD list now (list built before data changed)" : "server says nothing due";
  if (!it) {
    const months = (c.plans || []).length ? "plans" : "legacy";
    const anchor = c.expectedAnchor || c.firstInstallmentDate;
    k += anchor ? ` (${months})` : " (no first installment date)";
  }
  why[k] = (why[k] || 0) + 1;
  (whyEx[k] = whyEx[k] || []).length < 4 && whyEx[k].push(`${r.name} due ${r.amountDue} missed ${r.missedMonths} bal ${Math.round(r.balance)} first ${c.firstInstallmentDate} total ${c.invoiceTotal} init ${c.initialPaymentAmount}`);
}
console.log(JSON.stringify(why, null, 1));
console.log(JSON.stringify(whyEx, null, 1));
process.exit(0);
