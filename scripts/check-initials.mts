// READ-ONLY (mycase-rebuild): how many initial payments are not completed?
import { createRequire } from "module";
import path from "path";
const L: any = await import("../src/billing/ledger.js");
const unpaidInitial = L.unpaidInitial || L.default.unpaidInitial;
const require = createRequire(path.resolve("functions/package.json"));
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { caseIdFromLink } = require("./mycasePayments.js");
const { isPotentialCase, looksClosed } = require("./mycaseSync.js");
admin.initializeApp({ credential: admin.credential.cert(require(path.join(process.env.USERPROFILE!, ".collections-secrets", "firebase-rebuild-writer.json"))) });
const db = getFirestore(admin.app(), "mycase-rebuild");
const plain = (v: any): any => (v && typeof v.toDate === "function" ? v.toDate().toISOString() : Array.isArray(v) ? v.map(plain) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v);
const money = (n: number) => "$" + Math.round(n).toLocaleString();
const clients = (await db.collection("clients").get()).docs.map((d: any) => ({ id: d.id, ...plain(d.data()) })).filter((c: any) => String(c.status || "active") !== "closed");
const invByCase = new Map<string, any[]>();
(await db.collection("mycaseInvoices").get()).docs.forEach((d: any) => { const i = d.data(); const k = String(i.caseId || ""); (invByCase.get(k) || invByCase.set(k, []).get(k))!.push(i); });
const cases = new Map((await db.collection("mycaseCases").get()).docs.map((d: any) => [d.id, d.data()]));

// A) Collections clients rebuilt from MyCase (invoice tagged "initial")
const a = clients.map((c: any) => ({ c, owed: unpaidInitial(c) })).filter((x: any) => x.owed > 0.5);
console.log(`A) Collections clients with the initial payment short (tagged invoices): ${a.length}, ${money(a.reduce((s: number, x: any) => s + x.owed, 0))}`);
a.slice(0, 6).forEach((x: any) => console.log(`   ${x.c.firstName} ${x.c.lastName}: owes ${money(x.owed)} of ${money(x.c.initialPaymentAmount)} (initial date ${x.c.initialPaymentDate})`));

// B) Hand-entered clients: MyCase invoice that looks like the initial one, still open
const hand = clients.filter((c: any) => !(c.invoiceRoles && Object.keys(c.invoiceRoles).length));
let bn = 0, bs = 0; const bx: string[] = [];
for (const c of hand) {
  const k = c.mycaseCaseId || caseIdFromLink(c.myCaseLink || "");
  const inv = (invByCase.get(String(k)) || []).filter((i: any) => i.status !== "draft" && Number(i.total) > 0 && Math.abs(Number(i.total) - Number(c.initialPaymentAmount || 0)) < 1);
  const open = inv.filter((i: any) => Number(i.total) - Number(i.paid) > 0.5);
  if (open.length) { bn++; const d = open.reduce((s: number, i: any) => s + Number(i.total) - Number(i.paid), 0); bs += d; if (bx.length < 4) bx.push(`${c.firstName} ${c.lastName} ${money(d)}`); }
}
console.log(`B) Hand-entered clients whose MyCase initial-amount invoice is still open: ${bn}, ${money(bs)}`, bx);

// C) MyCase cases not in Collections: an initial/intake invoice partly paid (they started paying)
const tracked = new Set(clients.map((c: any) => String(c.mycaseCaseId || caseIdFromLink(c.myCaseLink || ""))));
let cn = 0, cs = 0, cz = 0, czs = 0; const cx: string[] = [];
for (const [id, k] of cases as any) {
  if (tracked.has(id) || String(k.status) === "closed" || looksClosed(k)) continue;
  const inv = (invByCase.get(id) || []).filter((i: any) => i.status !== "draft" && Number(i.total) > 150);
  if (!inv.length) continue;
  const first = inv.sort((x: any, y: any) => String(x.invoiceDate).localeCompare(String(y.invoiceDate)))[0];
  const due = Number(first.total) - Number(first.paid);
  if (due <= 0.5) continue;
  if (Number(first.paid) > 0) { cn++; cs += due; if (cx.length < 5) cx.push(`${k.name.slice(0, 40)} paid ${money(first.paid)} of ${money(first.total)} (${first.invoiceDate})${isPotentialCase(k) ? " [potential]" : ""}`); }
  else if (!isPotentialCase(k)) { cz++; czs += due; }
}
console.log(`C) MyCase cases not in Collections, first invoice partly paid: ${cn}, ${money(cs)} still due`);
cx.forEach((x) => console.log("   ", x));
console.log(`   (and ${cz} non-potential cases whose first invoice has nothing paid yet: ${money(czs)})`);
process.exit(0);
