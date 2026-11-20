// READ-ONLY data audit (mycase-rebuild): does the app agree with MyCase and with itself?
// Run from collections-system:  ../MyCase-Integration/node_modules/.bin/tsx scripts/audit.mts
import { createRequire } from "module";
import path from "path";
const L: any = await import("../src/billing/ledger.js");
const planLedger = L.planLedger || L.default.planLedger;
const clientPosition = L.clientPosition || L.default.clientPosition;

const require = createRequire(path.resolve("functions/package.json"));
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { caseIdFromLink } = require("./mycasePayments.js");
admin.initializeApp({ credential: admin.credential.cert(require(path.join(process.env.USERPROFILE!, ".collections-secrets", "firebase-rebuild-writer.json"))) });
const db = getFirestore(admin.app(), "mycase-rebuild");
const plain = (v: any): any => (v && typeof v.toDate === "function" ? v.toDate().toISOString() : Array.isArray(v) ? v.map(plain) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v);
const money = (n: number) => "$" + Math.round(n).toLocaleString();
const name = (c: any) => `${c.firstName || ""} ${c.lastName || ""}`.trim();
const now = new Date();

const clients = (await db.collection("clients").get()).docs.map((d: any) => ({ id: d.id, ...plain(d.data()) }));
const cases = new Map((await db.collection("mycaseCases").get()).docs.map((d: any) => [d.id, d.data()]));
const invByCase = new Map<string, any[]>();
(await db.collection("mycaseInvoices").get()).docs.forEach((d: any) => {
  const i = d.data();
  const k = String(i.caseId || "");
  if (!invByCase.has(k)) invByCase.set(k, []);
  invByCase.get(k)!.push(i);
});
const open = clients.filter((c: any) => String(c.status || "active").toLowerCase() !== "closed");
const rebuilt = (c: any) => c.invoiceRoles && Object.keys(c.invoiceRoles).length;
const report = (title: string, list: any[], fmt: (x: any) => string, n = 8) => {
  console.log(`\n## ${title}: ${list.length}`);
  list.slice(0, n).forEach((x) => console.log("   ", fmt(x)));
};

// 1) Old rule (payments up to the initial date never count) vs the new one.
const oldRule = (c: any) => ({ ...c, payments: (c.payments || []).filter((p: any) => !c.initialPaymentDate || String(p.date).slice(0, 10) > String(c.initialPaymentDate).slice(0, 10)), invoiceRoles: undefined, initialPaymentAmount: c.initialPaymentAmount });
const changed: any[] = [];
for (const c of open) {
  const a = clientPosition(oldRule(c), now).owedNow;
  const b = clientPosition(c, now).owedNow;
  if (a - b > 1) changed.push({ c, before: a, after: b });
}
report("Owed less after the initial-payment fix (payments on the initial date now count)", changed.sort((x, y) => y.before - y.after - (x.before - x.after)), (x) => `${name(x.c)}: ${money(x.before)} -> ${money(x.after)}`);
console.log("    total owed removed:", money(changed.reduce((s, x) => s + x.before - x.after, 0)));

// 2) Rebuilt clients: app balance vs MyCase balance on the same invoices.
const mism: any[] = [];
for (const c of open.filter((x: any) => rebuilt(x) && !x.awaitingPlan)) {
  const caseId = c.mycaseCaseId || caseIdFromLink(c.myCaseLink || "");
  const inv = invByCase.get(String(caseId)) || [];
  const roles = c.invoiceRoles || {};
  const tagged = inv.filter((i: any) => ["installment", "initial"].includes(roles[String(i.id)]));
  if (!tagged.length) continue;
  const mcDue = tagged.reduce((s: number, i: any) => s + Math.max(0, Number(i.total || 0) - Number(i.paid ?? i.paidAmount ?? 0)), 0);
  const app = clientPosition(c, now).balance;
  if (Math.abs(app - mcDue) > 5) mism.push({ c, app, mcDue });
}
report("Rebuilt clients whose balance differs from MyCase's tagged invoices", mism.sort((a, b) => Math.abs(b.app - b.mcDue) - Math.abs(a.app - a.mcDue)), (x) => `${name(x.c)}: app ${money(x.app)} vs MyCase ${money(x.mcDue)}`);

// 3) App says they owe, but every MyCase invoice on the case is paid and nothing is left to invoice.
const paidInMyCase: any[] = [];
for (const c of open) {
  const pos = clientPosition(c, now);
  if (pos.owedNow <= 1) continue;
  const caseId = c.mycaseCaseId || caseIdFromLink(c.myCaseLink || "");
  const k: any = cases.get(String(caseId));
  const inv = invByCase.get(String(caseId)) || [];
  if (!k || !inv.length) continue;
  const due = inv.filter((i: any) => i.status !== "draft").reduce((s: number, i: any) => s + Math.max(0, Number(i.total || 0) - Number(i.paid ?? i.paidAmount ?? 0)), 0);
  if (due <= 1 && Number(k.uninvoicedFee || 0) <= 1) paidInMyCase.push({ c, owed: pos.owedNow, src: rebuilt(c) ? "rebuilt" : "hand-entered" });
}
report("App says they owe, MyCase says paid in full (all invoices paid, nothing left to invoice)", paidInMyCase.sort((a, b) => b.owed - a.owed), (x) => `${name(x.c)} [${x.src}]: app owes ${money(x.owed)}`, 12);
console.log("    by source:", JSON.stringify(paidInMyCase.reduce((a: any, x) => ((a[x.src] = (a[x.src] || 0) + 1), a), {})), "| owed:", money(paidInMyCase.reduce((s, x) => s + x.owed, 0)));

// 4) Payments that look wrong.
const bad: any[] = [];
for (const c of clients) {
  const seen = new Map();
  for (const p of c.payments || []) {
    const d = String(p.date || "");
    const y = Number(d.slice(0, 4));
    if (!d || y < 2015 || d.slice(0, 10) > now.toISOString().slice(0, 10)) bad.push({ c, why: `date "${d}"`, p });
    if (Number(p.amount) <= 0) bad.push({ c, why: `amount ${p.amount}`, p });
    const key = `${d.slice(0, 10)}|${p.amount}|${p.invoiceId || ""}|${p.paymentId || ""}`;
    if (p.paymentId && seen.has(p.paymentId)) bad.push({ c, why: `same payment twice (${p.paymentId})`, p });
    seen.set(p.paymentId || key + Math.random(), 1);
  }
}
report("Payments with a bad date, zero/negative amount, or recorded twice", bad, (x) => `${name(x.c)}: ${x.why} $${x.p.amount}`, 12);

// 5) Paid more than the plan.
const over: any[] = [];
for (const c of open) {
  for (const v of [c]) {
    const l = planLedger(v, now);
    const cap = l.paidTotal - l.balance; // what the plan says is collectible after the initial payment
    const plan = Number(v.invoiceTotal || 0) - Number(v.initialPaymentAmount || 0) + (v.invoiceAdjustments || []).reduce((s: number, a: any) => s + (String(a.applyTo || "balance") === "balance" ? Math.max(0, Number(a.amount || 0) - Math.max(0, Number(a.downPayment || 0))) : 0), 0);
    if (l.paidTotal - plan > 50) over.push({ c, extra: l.paidTotal - plan, cap });
  }
}
report("Paid more than the plan total (overpaid or plan total too low)", over.sort((a, b) => b.extra - a.extra), (x) => `${name(x.c)}: ${money(x.extra)} over`);

// 6) Open clients with money left but no plan start.
const noPlan = open.filter((c: any) => !c.firstInstallmentDate && !(c.plans || []).length && !c.awaitingPlan && Number(c.invoiceTotal || 0) - Number(c.initialPaymentAmount || 0) - (c.payments || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0) > 1);
report("Open clients with a balance but no plan start date (never billed)", noPlan, (x) => `${name(x)}: total ${money(Number(x.invoiceTotal || 0))}`);

// 7) Month amount falls back to $500 (no schedule entry covers the month).
const fallback: any[] = [];
for (const c of open) {
  const sched = c.installmentSchedule || [];
  if (!c.firstInstallmentDate || (c.plans || []).length > 1) continue;
  const covers = (d: Date) => sched.some((s: any) => new Date(s.start) <= d && d <= new Date(s.end));
  const l = planLedger(c, now);
  const miss = l.months.filter((m: any) => !covers(m.due)).length;
  if (miss && sched.length) fallback.push({ c, miss, of: l.months.length, inst: c.installmentAmount });
}
report("Schedules that stop early (months billed at the $500 default)", fallback.sort((a, b) => b.miss - a.miss), (x) => `${name(x.c)}: ${x.miss}/${x.of} months at default${x.inst ? ` (plan amount ${x.inst})` : ""}`);

// 8) Clients linked to the same MyCase case / not linked.
const byCase = new Map<string, any[]>();
open.forEach((c: any) => {
  const k = c.mycaseCaseId || caseIdFromLink(c.myCaseLink || "");
  if (!k) return;
  if (!byCase.has(k)) byCase.set(k, []);
  byCase.get(k)!.push(c);
});
console.log(`\n## Open clients not linked to a MyCase case: ${open.filter((c: any) => !(c.mycaseCaseId || caseIdFromLink(c.myCaseLink || ""))).length}`);
console.log(`## MyCase cases with more than one open client record: ${[...byCase.values()].filter((l) => l.length > 1 && !l.some((c: any) => c.mycaseExcluded)).length}`);
// 9) Active in the app, closed in MyCase (should be 0 after the closures sync)
console.log(`## Active in the app but closed in MyCase: ${open.filter((c: any) => { const k: any = cases.get(String(c.mycaseCaseId || caseIdFromLink(c.myCaseLink || ""))); return k && String(k.status).toLowerCase() === "closed" && !c.mycaseExcluded; }).length}`);
process.exit(0);
