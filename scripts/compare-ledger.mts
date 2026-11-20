// READ-ONLY diagnostic (mycase-rebuild): old Home numbers vs the installment ledger.
// Run from collections-system:  ../MyCase-Integration/node_modules/.bin/tsx scripts/compare-ledger.mts
import { createRequire } from "module";
import path from "path";
const P: any = await import("../src/billing/portfolio.js");
const L: any = await import("../src/billing/ledger.js");
const clientRows = P.clientRows || P.default.clientRows;
const clientPosition = L.clientPosition || L.default.clientPosition;
const monthDueCollected = L.monthDueCollected || L.default.monthDueCollected;

const require = createRequire(path.resolve("functions/package.json"));
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
admin.initializeApp({ credential: admin.credential.cert(require(path.join(process.env.USERPROFILE!, ".collections-secrets", "firebase-rebuild-writer.json"))) });
const db = getFirestore(admin.app(), "mycase-rebuild");
const plain = (v: any): any => (v && typeof v.toDate === "function" ? v.toDate().toISOString() : Array.isArray(v) ? v.map(plain) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v);
const clients = (await db.collection("clients").get()).docs.map((d: any) => ({ id: d.id, ...plain(d.data()) }));
const now = new Date();
const money = (n: number) => "$" + Math.round(n).toLocaleString();

const rows = clientRows(clients, now);
const active = clients.filter((c: any) => String(c.status || "active").toLowerCase() === "active");
let old = { due: 0, bal: 0, n: 0 };
for (const r of rows) if (r.status === "active" && r.inPlan && (r.balance > 0 || r.amountDue > 0)) { old.bal += r.balance; if (r.amountDue > 0) { old.due += r.amountDue; old.n++; } }
let L2 = { past: 0, pastN: 0, cur: 0, curN: 0, owed: 0, owedN: 0, bal: 0, ended: 0, endedN: 0, noInit: 0 };
for (const c of active) {
  const p = clientPosition(c, now);
  L2.bal += p.balance;
  if (p.pastDue > 0.005) { L2.past += p.pastDue; L2.pastN++; }
  if (p.thisMonth > 0.005) { L2.cur += p.thisMonth; L2.curN++; }
  if (p.owedNow > 0.005) { L2.owed += p.owedNow; L2.owedN++; }
  if (p.planEnded) { L2.ended += p.owedNow; L2.endedN++; }
  if (!c.initialPaymentDate && (c.payments || []).length) L2.noInit++;
}
console.log("OLD  past due (Home):", money(old.due), `(${old.n} clients) | outstanding balance: ${money(old.bal)}`);
console.log("NEW  owed now (all unpaid installments due by today):", money(L2.owed), `(${L2.owedN} clients)`);
console.log("       of which before November:", money(L2.past), `(${L2.pastN})`, "| November only:", money(L2.cur), `(${L2.curN})`);
console.log("       of which plans already ended:", money(L2.ended), `(${L2.endedN})`);
console.log("NEW  balance left on plans:", money(L2.bal), "| clients with payments but no initial date:", L2.noInit);

console.log("\nDue vs collected per month (clients up to date going into the month):");
for (let i = 5; i >= 0; i--) {
  const f = new Date(now.getFullYear(), now.getMonth() - i, 1);
  const ym = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}`;
  const cutoff = i === 0 ? now : new Date(f.getFullYear(), f.getMonth() + 1, 0, 23, 59, 59);
  let due = 0, col = 0, n = 0;
  for (const c of clients) {
    if (String(c.status || "active").toLowerCase() === "closed") continue;
    const r = monthDueCollected(c, ym, cutoff);
    due += r.due; col += r.collected; n += r.clients;
  }
  console.log(`  ${ym}: due ${money(due)} from ${n} clients | collected ${money(col)} | ${(100 * col / (due || 1)).toFixed(0)}%`);
}
process.exit(0);
