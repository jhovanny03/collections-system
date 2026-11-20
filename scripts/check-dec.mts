// READ-ONLY: which clients make 90+ drop from Dec 2025 to Jan 2026?
import { createRequire } from "module";
import path from "path";
const L: any = await import("../src/billing/ledger.js");
const agingOf = L.agingOf || L.default.agingOf;
const require = createRequire(path.resolve("functions/package.json"));
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
admin.initializeApp({ credential: admin.credential.cert(require(path.join(process.env.USERPROFILE!, ".collections-secrets", "firebase-rebuild-writer.json"))) });
const db = getFirestore(admin.app(), "mycase-rebuild");
const plain = (v: any): any => (v && typeof v.toDate === "function" ? v.toDate().toISOString() : Array.isArray(v) ? v.map(plain) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v);
const clients = (await db.collection("clients").get()).docs.map((d: any) => ({ id: d.id, ...plain(d.data()) })).filter((c: any) => String(c.status || "active") !== "closed");
const dec = new Date(2025, 11, 31, 23, 59), jan = new Date(2026, 0, 31, 23, 59);
const diffs = clients.map((c: any) => ({ c, d: agingOf(c, dec).b90 - agingOf(c, jan).b90 })).filter((x: any) => x.d > 1).sort((a: any, b: any) => b.d - a.d);
console.log("clients whose 90+ fell Dec->Jan:", diffs.length, "total", Math.round(diffs.reduce((s: number, x: any) => s + x.d, 0)));
for (const x of diffs.slice(0, 6)) {
  const pays = (x.c.payments || []).filter((p: any) => String(p.date) >= "2025-12-01" && String(p.date) <= "2026-01-31").map((p: any) => `${String(p.date).slice(0, 10)}:${p.amount}`);
  console.log(`  ${x.c.firstName} ${x.c.lastName}: -${Math.round(x.d)} | first ${x.c.firstInstallmentDate} anchor ${x.c.expectedAnchor || "-"} skip ${JSON.stringify(x.c.skipMonths || [])} | Dec-Jan payments ${pays.join(" ")}`);
}
process.exit(0);
