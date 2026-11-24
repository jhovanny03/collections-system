// src/billing/dataQuality.js
// Data quality checks for the clean-up list (Data quality page). Pure; the server runs the
// same code when it prepares the figures (functions/portfolioSnapshot.js).
//
// Decided with the firm (2026-11-24): $500 is the standard monthly amount; payment
// schedule entries are temporary changes. So a month no schedule entry covers is $500.
// A client who steadily pays a DIFFERENT amount on such months may have agreed to it
// without anyone recording it, or may simply be underpaying: billing confirms each one.
import { installmentPayments, planLedger } from "./ledger";
import { planViews } from "./plans";
import { parseDate } from "../utils/dates";

export const STANDARD_MONTHLY = 500;
const pad2 = (n) => String(n).padStart(2, "0");
const ymOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const addMonths = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  return ymOf(new Date(y, m - 1 + n, 1));
};

/** The monthly amount the plan expects for month `ym`, and whether it is the $500 default. */
export function expectedAmount(c, ym) {
  const [y, m] = ym.split("-").map(Number);
  const due = new Date(y, m - 1, 15);
  for (const s of c.installmentSchedule || []) {
    const a = parseDate(s.start);
    const b = parseDate(s.end);
    if (a && b && due >= a && due <= b) return { amount: Number(s.amount || 0), isDefault: false };
  }
  const amt = Number(c.installmentAmount || 0);
  return amt > 0 ? { amount: amt, isDefault: false } : { amount: STANDARD_MONTHLY, isDefault: true };
}

/**
 * A client whose plan expects the $500 default this month but who has steadily paid a
 * different amount: at least 3 of the last 6 months with payments, and the same monthly
 * total (to the nearest $5) in at least 60% of them. Single-plan clients only.
 * Returns { amount, expected, since, fromYm, months } or null.
 *   since   first month of their current run of paying that amount
 *   fromYm  where a confirmed amount would start (never inside an existing schedule entry)
 */
export function steadyPayment(c, asOf = new Date()) {
  if (!c || String(c.status || "active").toLowerCase() === "closed") return null;
  if (c.dataQuality && c.dataQuality.monthly) return null; // billing already decided
  const views = planViews(c);
  if (views.length !== 1) return null;
  const cur = ymOf(asOf);
  const exp = expectedAmount(c, cur);
  if (!exp.isDefault) return null;
  // Monthly totals of installment payments over the last 12 months.
  const totals = new Map();
  for (const p of installmentPayments(c, asOf)) {
    const k = ymOf(p.date);
    if (k < addMonths(cur, -11)) continue;
    totals.set(k, (totals.get(k) || 0) + p.amount);
  }
  const recent = [];
  for (let i = 5; i >= 0; i--) {
    const k = addMonths(cur, -i);
    if (totals.has(k)) recent.push(Math.round(totals.get(k) / 5) * 5);
  }
  if (recent.length < 3) return null;
  const freq = new Map();
  recent.forEach((a) => freq.set(a, (freq.get(a) || 0) + 1));
  const [mode, n] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  if (n / recent.length < 0.6 || mode <= 0 || Math.abs(mode - exp.amount) < 5) return null;
  // Start of the current run of months paying `mode` (months with no payment break it).
  let since = null;
  for (let i = 0; i < 12; i++) {
    const k = addMonths(cur, -i);
    const t = totals.has(k) ? Math.round(totals.get(k) / 5) * 5 : null;
    if (t === mode) since = k;
    else if (since) break;
  }
  since = since || cur;
  // Never start inside an existing schedule entry (those are deliberate changes).
  const lastEnd = (c.installmentSchedule || []).map((s) => parseDate(s.end)).filter(Boolean).sort((a, b) => b - a)[0];
  const afterSchedule = lastEnd ? addMonths(ymOf(lastEnd), 1) : null;
  const fromYm = afterSchedule && afterSchedule > since ? afterSchedule : since;
  return { amount: mode, expected: exp.amount, since, fromYm, months: n };
}

/**
 * Why a client whose plan has ended still owes:
 *   quiet    no installment payment in 6+ months (write-off review)
 *   default  the plan runs on the $500 standard for some months (check the agreed amount)
 *   ranOut   keeps paying but every month of the plan has passed (check the invoice total)
 */
export function planEndedReason(c, asOf = new Date()) {
  const last = installmentPayments(c, asOf).slice(-1)[0];
  const sixAgo = new Date(asOf.getFullYear(), asOf.getMonth() - 6, 1);
  if (!last || last.date < sixAgo) return "quiet";
  const months = planViews(c).flatMap((v) => planLedger(v, asOf).months);
  if (months.some((m) => expectedAmount(c, m.ym).isDefault)) return "default";
  return "ranOut";
}

/** The schedule entry that records a confirmed monthly amount from `fromYm` on. */
export const confirmedEntry = (amount, fromYm, by) => ({
  amount: Number(amount),
  start: `${fromYm}-15`,
  end: "2046-12-15",
  note: `Confirmed in Data quality${by ? ` by ${by}` : ""}`,
});
