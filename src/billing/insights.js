// src/billing/insights.js
// Aging trend, collection forecast, write-off risk and plan health, all from the
// installment ledger (src/billing/ledger.js) so they agree with every other number.
import { clientAging, clientPosition, planProjection, lastPaymentDate, monthDueCollected, planLedger } from "./ledger";
import { planViews } from "./plans";
import { parseDate } from "../utils/dates";

const pad2 = (n) => String(n).padStart(2, "0");
const ymOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const isClosed = (c) => String(c.status || "active").toLowerCase() === "closed";
const statusOf = (c) => String(c.status || "active").toLowerCase();
const nameOf = (c) => `${c.firstName || ""} ${c.lastName || ""}`.trim() || "Unnamed client";
const endOfMonth = (y, m) => new Date(y, m + 1, 0, 23, 59, 59);

/**
 * Aging buckets at the end of each of the last `n` months (current month: as of today),
 * rebuilt from payment history. Clients closed since then are left out, so older months
 * can read a little low; months saved by the nightly snapshot replace these.
 */
export function agingTrend(clients, n = 12, asOf = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const first = new Date(asOf.getFullYear(), asOf.getMonth() - i, 1);
    const at = i === 0 ? asOf : endOfMonth(first.getFullYear(), first.getMonth());
    const t = { key: ymOf(first), b0: 0, b30: 0, b60: 0, b90: 0, total: 0, clients: 0, source: "history" };
    for (const c of clients) {
      // (No "created after" filter: rebuilt records carry the rebuild date, not when the
      // client started. A plan that had not started yet simply owes nothing that month.)
      if (isClosed(c)) continue;
      let a;
      try {
        a = clientAging(c, at);
      } catch (e) {
        continue;
      }
      if (a.total <= 0.005) continue;
      t.b0 += a.b0;
      t.b30 += a.b30;
      t.b60 += a.b60;
      t.b90 += a.b90;
      t.total += a.total;
      t.clients++;
    }
    out.push(t);
  }
  return out;
}

/** Share of installments paid by clients up to date going into each of the last `k` full months. */
function currentClientRate(clients, k, asOf) {
  let due = 0;
  let paid = 0;
  for (let i = k; i >= 1; i--) {
    const first = new Date(asOf.getFullYear(), asOf.getMonth() - i, 1);
    const ym = ymOf(first);
    const cutoff = endOfMonth(first.getFullYear(), first.getMonth());
    for (const c of clients) {
      if (isClosed(c)) continue;
      try {
        const r = monthDueCollected(c, ym, cutoff);
        due += r.due;
        paid += r.collected;
      } catch (e) {
        /* skip */
      }
    }
  }
  return due ? paid / due : 0;
}

/**
 * How much clients who were BEHIND going into each of the last `k` full months paid that
 * month, compared with their regular installment. Used to estimate what behind clients
 * will pay going forward.
 */
function behindClientRate(clients, k, asOf) {
  let scheduled = 0;
  let paid = 0;
  for (let i = k; i >= 1; i--) {
    const first = new Date(asOf.getFullYear(), asOf.getMonth() - i, 1);
    const ym = ymOf(first);
    const before = new Date(first.getFullYear(), first.getMonth(), 0, 23, 59, 59);
    const end = endOfMonth(first.getFullYear(), first.getMonth());
    for (const c of clients) {
      if (statusOf(c) !== "active") continue;
      try {
        if (clientPosition(c, before).owedNow <= 0.005) continue;
        // their installment for that month (as scheduled), and what they paid during it
        const inst = planViews(c).reduce((s, v) => s + (planLedger(v, end, end).months.find((m) => m.ym === ym)?.amount || 0), 0);
        if (inst <= 0) continue;
        const got = (c.payments || []).reduce((s, p) => {
          const d = parseDate(p.date);
          return d && d >= first && d <= end ? s + Number(p.amount || 0) : s;
        }, 0);
        scheduled += inst;
        paid += Math.min(got, inst * 3); // a big catch-up counts, but not unlimited
      } catch (e) {
        /* skip */
      }
    }
  }
  return scheduled ? Math.min(1, paid / scheduled) : 0;
}

/**
 * Collection forecast for the next `n` months: what the plans schedule (minus anything
 * already paid ahead), split by clients up to date today vs behind, and a likely figure
 * using the last 6 months' payment habits of each group.
 */
export function collectionForecast(clients, n = 3, asOf = new Date()) {
  const keys = [];
  for (let i = 1; i <= n; i++) keys.push(ymOf(new Date(asOf.getFullYear(), asOf.getMonth() + i, 1)));
  const months = keys.map((key) => ({ key, scheduled: 0, upToDate: 0, behind: 0, clients: 0 }));
  let restThisMonth = 0;
  const cur = ymOf(asOf);
  for (const c of clients) {
    if (statusOf(c) !== "active") continue;
    let proj;
    let pos;
    try {
      proj = planProjection(c, asOf);
      pos = clientPosition(c, asOf);
    } catch (e) {
      continue;
    }
    const behind = pos.owedNow > 0.005;
    months.forEach((m) => {
      const amt = proj.future[m.key] || 0;
      if (amt <= 0) return;
      m.scheduled += amt;
      m.clients++;
      if (behind) m.behind += amt;
      else m.upToDate += amt;
    });
    // This month's installments not paid yet and not yet due (before the 15th).
    if (asOf.getDate() < 15) {
      for (const v of planViews(c)) {
        const end = endOfMonth(asOf.getFullYear(), asOf.getMonth());
        const m = planLedger(v, end, asOf).months.find((x) => x.ym === cur);
        if (m) restThisMonth += Math.max(0, m.amount - m.paid);
      }
    }
  }
  const currentRate = currentClientRate(clients, 6, asOf);
  const behindRate = behindClientRate(clients, 3, asOf);
  months.forEach((m) => {
    m.likely = m.upToDate * currentRate + m.behind * behindRate;
  });
  return { months, currentRate, behindRate, restThisMonth };
}

/**
 * Clients to consider for write-off or outside collections: owe money that is 90+ days
 * old and have paid nothing for at least `quietMonths` months.
 */
export function writeOffRisk(clients, rowsById, quietMonths = 6, asOf = new Date()) {
  const cutoff = new Date(asOf.getFullYear(), asOf.getMonth() - quietMonths, asOf.getDate());
  const out = [];
  for (const c of clients) {
    if (isClosed(c)) continue;
    const row = rowsById.get(c.id);
    if (!row || row.aging.b90 <= 0.005) continue;
    const last = lastPaymentDate(c);
    if (last && last > cutoff) continue;
    const months = last ? Math.floor((asOf - last) / (30.44 * 864e5)) : null;
    out.push({
      id: c.id,
      name: nameOf(c),
      caseType: c.caseType || "—",
      caseTitle: c.caseTitle || "",
      status: statusOf(c),
      onHold: !!c.paymentHold?.active,
      owed: row.aging.total,
      over90: row.aging.b90,
      balance: row.balance,
      lastPayment: last,
      monthsQuiet: months,
      tier: !last ? "never" : months >= 12 ? "12+" : "6-12",
      myCaseLink: c.myCaseLink || "",
      source: row.source,
    });
  }
  return out.sort((a, b) => b.owed - a.owed);
}

export const HEALTH = [
  { key: "ended", label: "Plan ended, still owes", tone: "error", help: "Every month of the plan has passed and money is still owed." },
  { key: "endsOwing", label: "Will end owing", tone: "error", help: "Behind by as many installments as are left: the plan ends before they can catch up at the normal pace." },
  { key: "behind", label: "Behind, can catch up", tone: "warning", help: "Owes installments but has more months left than missed; paying a little extra each month gets them back on track." },
  { key: "endingSoon", label: "Finishing soon", tone: "info", help: "Up to date and 3 or fewer installments left." },
  { key: "onTrack", label: "On track", tone: "success", help: "Up to date with more than 3 installments left." },
];

/** Plan health for every active client on a plan. */
export function planHealth(clients, rowsById, asOf = new Date()) {
  const out = [];
  for (const c of clients) {
    if (statusOf(c) !== "active") continue;
    const row = rowsById.get(c.id);
    if (!row || !row.inPlan || (row.balance <= 0.005 && row.amountDue <= 0.005)) continue;
    let proj;
    let pos;
    try {
      proj = planProjection(c, asOf);
      pos = clientPosition(c, asOf);
    } catch (e) {
      continue;
    }
    const owed = pos.owedNow;
    let key;
    if (owed > 0.005 && proj.monthsLeft === 0) key = "ended";
    else if (owed > 0.005 && pos.monthsBehind >= proj.monthsLeft) key = "endsOwing";
    else if (owed > 0.005) key = "behind";
    else if (proj.monthsLeft <= 3) key = "endingSoon";
    else key = "onTrack";
    const regular = proj.monthsLeft ? proj.scheduledLeft / proj.monthsLeft : 0;
    out.push({
      id: c.id,
      name: nameOf(c),
      caseType: c.caseType || "—",
      key,
      owed,
      monthsBehind: pos.monthsBehind,
      monthsLeft: proj.monthsLeft,
      endYm: proj.endYm,
      balance: row.balance,
      regular,
      // What they would need to pay each month to finish on the plan's end date.
      neededMonthly: proj.monthsLeft ? (proj.scheduledLeft + owed) / proj.monthsLeft : owed,
    });
  }
  return out;
}
