// functions/portfolioSnapshot.js
// Prepared figures, so pages open in a second instead of downloading every client and
// recalculating in the browser. Same math as the app (functions/shared/billing/book.js,
// copied from src/billing by scripts/build-shared.js), run on the server after each MyCase
// sync and RingCentral import, and on demand ("Refresh" on Home).
//   portfolio/summary          Home and report totals, 12-month charts, latest payments
//   portfolioRows/{0..n}       one row per client (owed, aging, last contact...), in
//                              batches that stay well under Firestore's 1 MB per document
//   portfolio/insights         aging trend, forecast, write-off risk
//   portfolioHealth/{0..n}     plan health per client (Risk & plan health report)
// The app reads these (src/data/BookProvider.jsx); the client profile stays live.

const MAX_BATCH_BYTES = 700 * 1024;

const plain = (v) => JSON.parse(JSON.stringify(v)); // Dates -> ISO strings, undefined dropped

/** Payments around a client's promise (from 60 days before it), to judge it kept. */
function promisePayments(c) {
  const pr = c.paymentPromise;
  if (!pr || !pr.date) return undefined;
  const from = new Date(new Date(String(pr.date).slice(0, 10)).getTime() - 60 * 864e5).toISOString().slice(0, 10);
  return (c.payments || []).filter((p) => Number(p.amount) > 0 && String(p.date || "").slice(0, 10) >= from).map((p) => ({ date: String(p.date).slice(0, 10), amount: Number(p.amount) }));
}

/** Extra fields the pages need on a row beyond clientRows (search, calls, promises). */
function extras(c) {
  return {
    promisePayments: promisePayments(c),
    // (phones, promise and lastContact are already on the row: the app maps them back.)
    lastCall: c.lastCall || null,
    callStats: c.callStats || null,
    // Where the case is in MyCase (copied by the sync), e.g. "Prima Facie Received".
    mycaseStage: c.mycaseStage || null,
  };
}

/** Everything the snapshot holds, computed from client documents (pure, for tests). */
function computeSnapshot(clientDocs, now = new Date(), { listMonths = new Map(), calls = [], cases = new Map(), moneyBack = new Map(), aiTags = new Map() } = {}) {
  const { clientRows, summarize, allPayments, collectionRateByMonth, collectionsByMonth, planMoneyByDay } = require("./shared/billing/book");
  const { withMyCasePayments } = require("./shared/billing/mycaseOverlay");
  const clients = clientDocs.map((c) => withMyCasePayments(c));
  const rows = clientRows(clients, now);
  const byId = new Map(clients.map((c) => [c.id, c]));
  rows.forEach((r) => Object.assign(r, extras(byId.get(r.id) || {})));
  // Data quality page: steady payments that differ from the plan, and why ended plans owe.
  const { steadyPayment, planEndedReason, servicesMissingPlan } = require("./shared/billing/dataQuality");
  rows.forEach((r) => {
    const c = byId.get(r.id);
    if (!c || r.status === "closed") return;
    try {
      const sp = steadyPayment(c, now);
      if (sp) r.steadyPay = sp;
      if (r.planEnded) r.endedReason = planEndedReason(c, now);
      const missing = servicesMissingPlan(c);
      if (missing.length) r.servicesMissingPlan = missing;
    } catch (e) {
      /* a malformed plan is left for the other checks */
    }
  });
  // Follow-ups "who to call first": how likely each client who owes is to pay, and when to call.
  const { likelyToPay, answerTable, bestTime, promiseMonths } = require("./shared/billing/callPriority");
  const table = answerTable(calls);
  const callsBy = new Map();
  for (const c of calls) for (const id of c.clientIds || []) callsBy.set(id, [...(callsBy.get(id) || []), c]);
  rows.forEach((r) => {
    const c = byId.get(r.id);
    if (!c || r.status === "closed" || r.status === "paused") return;
    const missedNow = Number(r.expectedThisMonth || 0) - Number(r.collectedThisMonth || 0);
    if (!(r.amountDue > 0.005 || missedNow > 0.005)) return;
    try {
      const s = likelyToPay(c, { asOf: now, listMonths: listMonths.get(r.id) || [], now: { missedMonths: r.missedMonths, planEnded: r.planEnded, lastPaymentDate: r.lastPayment && r.lastPayment.date } });
      r.callPriority = { p: Math.round(s.p * 100) / 100, band: s.band, reasons: s.reasons, best: bestTime(callsBy.get(r.id), table) };
    } catch (e) {
      /* a malformed plan gets no score */
    }
  });
  // Data quality, "Termination & closing": signals from the MyCase case, refunds and notes.
  const { closeCheck, titleKey } = require("./shared/billing/closeCheck");
  const { caseIdOf } = require("./shared/billing/mycaseOverlay");
  rows.forEach((r) => {
    const c = byId.get(r.id);
    if (!c || r.status === "closed") return;
    try {
      const caseId = caseIdOf(c);
      const caseDoc = caseId ? cases.get(String(caseId)) || null : null;
      const title = (caseDoc && caseDoc.name) || c.caseTitle || "";
      const tag = aiTags.get(r.id);
      const ai = tag && tag.titleKey === titleKey(title) ? tag : null;
      const cc = closeCheck(c, { caseDoc, money: caseId ? moneyBack.get(String(caseId)) : null, ai, row: r, asOf: now });
      if (!cc) return;
      const seen = c.dataQuality && c.dataQuality.closeCheck;
      if (seen && seen.decision === "dismissed" && seen.signature === cc.signature) cc.dismissed = { by: seen.by || "", at: seen.at || "" };
      r.closeCheck = cc;
    } catch (e) {
      /* a malformed record is left for the other checks */
    }
  });
  const payments = allPayments(clients);
  const { agingTrend, collectionForecast, writeOffRisk, planHealth } = require("./shared/billing/insights");
  const rowsById = new Map(rows.map((r) => [r.id, r]));
  return {
    insights: plain({ agingTrend: agingTrend(clients, 12, now), forecast: collectionForecast(clients, 3, now), risk: writeOffRisk(clients, rowsById, 6, now) }),
    health: plain(planHealth(clients, rowsById, now)),
    rows: plain(rows),
    summary: plain(summarize(rows, payments, now)),
    months: plain(collectionRateByMonth(clients, 12, now)),
    byMonth: plain(collectionsByMonth(payments, 12, now)),
    // Home: plan money per day this month and last month (calendar + pace line).
    daily: plain(planMoneyByDay(clients, now)),
    recent: plain(payments.slice(0, 25)),
    // Follow-ups report and Monthly briefing: payment promises month by month (from notes).
    promiseMonths: plain(promiseMonths(clients, now, listMonths)),
  };
}

/** Split rows into batches that each stay under MAX_BATCH_BYTES of JSON. */
function batchRows(rows, maxBytes = MAX_BATCH_BYTES) {
  const out = [];
  let cur = [];
  let size = 0;
  for (const r of rows) {
    const n = JSON.stringify(r).length + 1;
    if (cur.length && size + n > maxBytes) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(r);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** This month in MyCase: money received, and what landed on cases not in Collections. */
async function mycaseMonth(db, docs, now) {
  const { isReceived, caseIdOf } = require("./shared/billing/mycaseOverlay");
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const tracked = new Set(docs.filter((c) => !c.mycaseExcluded).map(caseIdOf).filter(Boolean));
  const out = { ym, received: 0, count: 0, notInApp: 0, notInAppCount: 0 };
  const snap = await db.collection("mycasePayments").where("date", ">=", `${ym}-01`).select("caseId", "date", "amount", "status", "type").get();
  snap.forEach((d) => {
    const p = d.data();
    if (String(p.date || "").slice(0, 7) !== ym || !isReceived(p)) return;
    out.received += Number(p.amount);
    out.count++;
    if (!tracked.has(String(p.caseId || ""))) {
      out.notInApp += Number(p.amount);
      out.notInAppCount++;
    }
  });
  return out;
}

async function writeBatches(db, name, batches, generatedAt) {
  for (let i = 0; i < batches.length; i++) await db.collection(name).doc(String(i)).set({ i, generatedAt, rows: batches[i] });
  const old = await db.collection(name).get();
  for (const d of old.docs) if (Number(d.id) >= batches.length) await d.ref.delete();
}

/** Read every client, compute, and write the snapshot. Returns { clients, batches, ms }. */
async function refreshPortfolio(db, { now = new Date(), by = "system" } = {}) {
  const t0 = Date.now();
  const snap = await db.collection("clients").get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // Follow-up lists (who was on them, month by month) and RingCentral calls, for the
  // "who to call first" score.
  const listMonths = new Map();
  try {
    const cohorts = (await db.collection("followUpsCohorts").get()).docs.map((d) => d.id).filter((id) => /^\d{4}-\d{2}$/.test(id)).sort().slice(-13);
    for (const ym of cohorts) {
      const items = (await db.collection("followUpsCohorts").doc(ym).collection("items").get()).docs.map((d) => d.data());
      for (const i of items) {
        if ((i.section || "current") !== "current" || !i.clientId) continue;
        listMonths.set(i.clientId, [...(listMonths.get(i.clientId) || []), ym]);
      }
    }
  } catch (e) {
    console.warn("Follow-up history skipped:", e.message);
  }
  let calls = [];
  try {
    calls = (await db.collection("ringcentralCalls").get()).docs.map((d) => d.data());
  } catch (e) {
    console.warn("Call history skipped:", e.message);
  }
  // MyCase cases (current title, status, stage), refunds and returned payments, and the AI
  // reading of unclear titles: for Data quality "Termination & closing".
  const cases = new Map();
  const moneyBack = new Map();
  const aiTags = new Map();
  try {
    (await db.collection("mycaseCases").select("name", "status", "caseStage", "closedDate").get()).forEach((d) => cases.set(d.id, d.data()));
    const { moneyBackByCase } = require("./shared/billing/closeCheck");
    const neg = (await db.collection("mycasePayments").where("amount", "<", 0).select("caseId", "amount", "type", "status", "date").get()).docs.map((d) => d.data());
    moneyBackByCase(neg).forEach((v, k) => moneyBack.set(k, v));
    (await db.collection("closeChecks").get()).forEach((d) => aiTags.set(d.id, d.data()));
  } catch (e) {
    console.warn("Termination & closing inputs skipped:", e.message);
  }
  const data = computeSnapshot(docs, now, { listMonths, calls, cases, moneyBack, aiTags });
  const batches = batchRows(data.rows);
  const generatedAt = now.toISOString();
  const health = batchRows(data.health);
  // Rows first, summary last: a reader that sees the new summary finds its rows ready.
  await writeBatches(db, "portfolioRows", batches, generatedAt);
  await writeBatches(db, "portfolioHealth", health, generatedAt);
  await db.doc("portfolio/insights").set({ generatedAt, ...data.insights });
  let month = null;
  try {
    month = await mycaseMonth(db, docs, now);
  } catch (e) {
    console.warn("MyCase month total skipped:", e.message);
  }
  await db.doc("portfolio/summary").set({
    generatedAt, by, batches: batches.length, healthBatches: health.length, clients: docs.length,
    summary: data.summary, months: data.months, byMonth: data.byMonth, daily: data.daily, recent: data.recent, mycaseMonth: month,
    promiseMonths: data.promiseMonths,
  });
  return { clients: docs.length, batches: batches.length, ms: Date.now() - t0 };
}

module.exports = { computeSnapshot, batchRows, refreshPortfolio };
