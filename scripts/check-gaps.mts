// READ-ONLY (mycase-rebuild): explain the gaps between Home's tiles.
import { createRequire } from "module";
import path from "path";
const P: any = await import("../src/billing/portfolio.js");
const pick = (k: string) => P[k] || P.default[k];
const require = createRequire(path.resolve("functions/package.json"));
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
admin.initializeApp({ credential: admin.credential.cert(require(path.join(process.env.USERPROFILE!, ".collections-secrets", "firebase-rebuild-writer.json"))) });
const db = getFirestore(admin.app(), "mycase-rebuild");
const plain = (v: any): any => (v && typeof v.toDate === "function" ? v.toDate().toISOString() : Array.isArray(v) ? v.map(plain) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v);
const clients = (await db.collection("clients").get()).docs.map((d: any) => ({ id: d.id, ...plain(d.data()) }));
const money = (n: number) => "$" + Math.round(n).toLocaleString();
const now = new Date();
const rows = pick("clientRows")(clients, now);
const pays = pick("allPayments")(clients);
const s = pick("summarize")(rows, pays, now);
const ym = now.toISOString().slice(0, 7);

// 1) Collected this month vs collection rate
const mtd = pays.filter((p: any) => p.ym === ym && p.amount > 0);
const initial = mtd.filter((p: any) => p.initial).reduce((t: number, p: any) => t + p.amount, 0);
const inst = mtd.filter((p: any) => !p.initial).reduce((t: number, p: any) => t + p.amount, 0);
console.log(`collected this month ${money(s.collected.mtd)} = initial payments ${money(initial)} + other payments ${money(inst)}`);
console.log(`  of which toward this month's installments (clients up to date going in): ${money(s.month.collectedOnPlan)} of ${money(s.month.expected)} due -> ${(100 * s.month.collectedOnPlan / s.month.expected).toFixed(0)}%`);
console.log(`  catch-up / paid ahead: ${money(inst - s.month.collectedOnPlan)}`);

// 2) Outstanding vs aging total
const open = rows.filter((r: any) => r.status !== "closed");
const paused = open.filter((r: any) => r.status === "paused").reduce((t: number, r: any) => t + r.aging.total, 0);
const activeNotPlan = open.filter((r: any) => r.status === "active" && !(r.inPlan && (r.balance > 0 || r.amountDue > 0))).filter((r: any) => r.aging.total > 0);
console.log(`\noutstanding ${money(s.outstanding)} (${s.outstandingClients}) vs aging ${money(s.receivable.amount)} (${s.receivable.clients}): diff ${money(s.receivable.amount - s.outstanding)}`);
console.log(`  paused clients' aging: ${money(paused)} | active clients outside "still paying": ${activeNotPlan.length} ${money(activeNotPlan.reduce((t: number, r: any) => t + r.aging.total, 0))}`, activeNotPlan.slice(0, 5).map((r: any) => `${r.name} ${money(r.aging.total)} inPlan=${r.inPlan} bal=${r.balance}`));
const notDue = open.filter((r: any) => r.status === "active").reduce((t: number, r: any) => t + r.aging.total - r.amountDue, 0);
console.log(`  this month not yet due (before the 15th): ${money(notDue)}`);

// 3) 0-30 vs past due this month
const b0 = s.buckets.find((b: any) => b.key === "b0");
console.log(`\n0-30 ${money(b0.amount)} (${b0.clients}) vs past due this month ${money(s.pastDue.amount)} (${s.pastDue.clients})`);
const odd = open.filter((r: any) => Math.abs(r.aging.b0 - (r.status === "active" && r.inPlan && (r.balance > 0 || r.amountDue > 0) ? r.dueThisMonth : 0)) > 0.5);
odd.slice(0, 8).forEach((r: any) => console.log(`  ${r.name}: 0-30 ${money(r.aging.b0)} vs this month ${money(r.dueThisMonth)} | status ${r.status} inPlan ${r.inPlan} bal ${r.balance}`));
process.exit(0);
