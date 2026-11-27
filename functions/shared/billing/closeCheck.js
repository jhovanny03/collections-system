// GENERATED from src/billing/closeCheck.js by scripts/build-shared.js. Do not edit here.
"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/billing/closeCheck.js
// Data quality, "Termination & closing": open clients that look like possible terminations
// (the firm or the client is ending the representation) or that should already be closed.
// Pure rules over what the system already has: the MyCase case title, status and stage,
// refunds and returned payments in MyCase, and the client's notes. Titles a rule cannot
// settle ("withdrawal", "transfer", "terminate" next to court wording...) can be read by
// Claude on request, with the client's name removed (functions/closeCheckAi.js); its
// answer is one more signal here, never a decision.
// Computed on the server with the prepared figures (functions/portfolioSnapshot.js).
var _dates = require('../utils/dates');

 const REFUND_LIMIT = 1000; exports.REFUND_LIMIT = REFUND_LIMIT; // refunds above this suggest the case is ending
const DAY = 864e5;

// Wording that is about a court proceeding, not about ending the representation.
const LEGAL_TERMINATE = /motion\s+to\s+(re-?open\s*(and|&|\+)\s*)?terminat|terminat\w*\s+(of\s+)?(the\s+)?(removal|proceeding|case\s+in\s+court|court)|\b(court|judge|ij|eoir)\b[^()]*terminat|terminat[^()]*\b(court|judge|ij|eoir)\b/i;
const TERMINATION_IN_PROCESS = /terminat\w*\s*(is\s*)?(in\s*)?(process|proc\b|progress|pending)|\btip\b|(to\s+be|being|was|been)\s+terminated|termination\s+(of\s+)?(rep|representation|contract|services|agreement|retainer)/i;
const HOLD_UNPAID = /hold\s*[-–:]?\s*(for\s+)?(outstanding|non-?payment|unpaid|missed|payment)/i;
const CLOSED_WORD = /\bclosed\b/i;
const REOPENED = /re-?opened|not\s+closed/i;
// Words a rule cannot settle: worth a second read.
const UNCLEAR = /terminat|withdr[ae]w|cancel(?!l?ation\s+of\s+removal)|transferr?(ed)?\b|deceas|passed\s+away|dismiss|deport|fired|no\s+longer|refund|another\s+(attorney|lawyer)|new\s+(attorney|lawyer)/i;
// Notes (communication log) that mention the representation ending.
const NOTE_WORDS = /terminat|cancel+(ed|ing)?\s+(the\s+|my\s+|his\s+|her\s+|their\s+)?(case|contract|services|representation|agreement)|wants?\s+(to\s+)?(a\s+)?(full\s+)?refund|request(ed|s)?\s+(a\s+)?(full\s+)?refund|another\s+(attorney|lawyer)|new\s+(attorney|lawyer)|withdraw\s+from|no\s+longer\s+(wants|interested)/i;
const SYSTEM_NOTE = /^(Closed automatically|Reopened automatically|Case status set to|Monthly amount|Payment imported|MyCase)/i;

/** Small stable hash (FNV-1a): ties an AI answer to the exact title it read. */
 function titleKey(title) {
  let h = 0x811c9dc5;
  for (const ch of String(title || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
} exports.titleKey = titleKey;

/** What the title says, by rule. unclear = a word a rule cannot settle. */
 function titleSignals(title) {
  const t = String(title || "");
  const out = [];
  const legal = LEGAL_TERMINATE.test(t);
  if (TERMINATION_IN_PROCESS.test(t) && !legal) out.push({ key: "titleTermination", kind: "termination", strength: 3, label: "Title says termination in process" });
  if (HOLD_UNPAID.test(t)) out.push({ key: "titleHold", kind: "termination", strength: 2, label: "Title says on hold for outstanding payment" });
  if (CLOSED_WORD.test(t) && !REOPENED.test(t)) out.push({ key: "titleClosed", kind: "close", strength: 3, label: "Title says CLOSED" });
  const ruled = out.some((s) => s.key === "titleTermination" || s.key === "titleClosed");
  const unclear = !ruled && (UNCLEAR.test(t) || REOPENED.test(t));
  return { signals: out, unclear, legal };
} exports.titleSignals = titleSignals;

/** The title with the client's name taken out, for the AI (nothing else is sent). */
 function redactTitle(title, names = []) {
  let t = String(title || "");
  const words = [...new Set(names.join(" ").split(/[\s,()]+/).map((w) => w.replace(/[^A-Za-zÀ-ÿ'-]/g, "")).filter((w) => w.length >= 2))];
  for (const w of words.sort((a, b) => b.length - a.length)) t = t.replace(new RegExp(`(^|[^A-Za-zÀ-ÿ])${w.replace(/[-']/g, "\\$&")}(?=$|[^A-Za-zÀ-ÿ])`, "gi"), "$1[client]");
  // "LAST, FIRST" written in the title, even if spelled unlike the record.
  t = t.replace(/\b[A-ZÀ-Ý][A-Za-zÀ-ÿ'.-]+(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'.-]+)*\s*,\s*[A-ZÀ-Ý][A-Za-zÀ-ÿ'.-]+(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'.-]*)*/g, "[client]");
  t = t.replace(/(\[client\][\s,]*)+/g, "[client] ").replace(/\s+/g, " ").trim();
  return t;
} exports.redactTitle = redactTitle;

/** True when no word of the client's name is left in the redacted title. */
 function isRedacted(text, names = []) {
  const words = names.join(" ").split(/[\s,()]+/).map((w) => w.replace(/[^A-Za-zÀ-ÿ'-]/g, "")).filter((w) => w.length >= 3);
  return !words.some((w) => new RegExp(`(^|[^A-Za-zÀ-ÿ])${w.replace(/[-']/g, "\\$&")}($|[^A-Za-zÀ-ÿ])`, "i").test(text));
} exports.isRedacted = isRedacted;

/** Notes from the last 12 months that mention the representation ending (newest first). */
 function noteSignals(client, asOf = new Date()) {
  const since = new Date(asOf.getTime() - 365 * DAY);
  const hits = [];
  for (const log of [...(client.communicationLogs || []), ...(client.communicationLog || [])]) {
    const msg = String(log.message || "");
    const at = _dates.parseDate.call(void 0, log.timestamp && log.timestamp.toDate ? log.timestamp.toDate() : log.timestamp);
    if (!at || at < since || at > asOf || SYSTEM_NOTE.test(msg) || !NOTE_WORDS.test(msg)) continue;
    hits.push(at);
  }
  hits.sort((a, b) => b - a);
  return hits;
} exports.noteSignals = noteSignals;

/**
 * Signals for one client, or null when nothing points to closing or termination.
 *   caseDoc: the MyCase case ({ name, status, caseStage, closedDate })
 *   money:   { refunds, refundCount, lastRefund, returned, returnedCount } from MyCase
 *   ai:      { tag: "termination" | "should_close" | "not_ending", reason } for this title
 *   row:     the prepared row (balance, amountDue, lastPayment)
 * Returns { kind: "close" | "termination", score, signals: [...], title, unclear, signature }.
 */
 function closeCheck(client, { caseDoc = null, money = null, ai = null, row = {}, asOf = new Date() } = {}) {
  if (!client || String(client.status || "").toLowerCase() === "closed") return null;
  const title = (caseDoc && caseDoc.name) || client.caseTitle || "";
  const signals = [];
  const t = titleSignals(title);
  signals.push(...t.signals);

  const mcStatus = String((caseDoc && caseDoc.status) || client.mycaseCaseStatus || "").toLowerCase();
  const stage = String((caseDoc && caseDoc.caseStage) || client.mycaseStage || "");
  if (mcStatus === "closed") {
    const d = (caseDoc && caseDoc.closedDate) || client.mycaseClosedDate;
    signals.push({ key: "mycaseClosed", kind: "close", strength: 3, label: `Case is closed in MyCase${d ? ` (${String(d).slice(0, 10)})` : ""}` });
  }
  if (/^closed$/i.test(stage.trim())) signals.push({ key: "stageClosed", kind: "close", strength: 3, label: "MyCase stage is Closed" });
  if (/payment\s*hold/i.test(stage)) signals.push({ key: "stageHold", kind: "termination", strength: 2, label: "MyCase stage is Payment Hold" });

  if (money && money.refunds > exports.REFUND_LIMIT) {
    signals.push({ key: "refunds", kind: "termination", strength: 3, label: `Refunded $${Math.round(money.refunds).toLocaleString()} in MyCase${money.refundCount > 1 ? ` (${money.refundCount} refunds)` : ""}${money.lastRefund ? `, last ${money.lastRefund}` : ""}` });
  }
  if (money && money.returnedCount > 0) {
    signals.push({ key: "returned", kind: "termination", strength: 1, label: `${money.returnedCount} payment${money.returnedCount === 1 ? "" : "s"} returned or charged back ($${Math.round(money.returned).toLocaleString()})` });
  }
  const notes = noteSignals(client, asOf);
  if (notes.length) {
    signals.push({ key: "notes", kind: "termination", strength: 2, label: `Notes mention termination, a refund or another lawyer (${notes[0].toISOString().slice(0, 10)}${notes.length > 1 ? `, ${notes.length} notes` : ""})` });
  }
  if (ai && ai.tag === "termination") signals.push({ key: "aiTermination", kind: "termination", strength: 2, label: `Claude reads the title as a termination: ${ai.reason}`, ai: true });
  if (ai && ai.tag === "should_close") signals.push({ key: "aiClose", kind: "close", strength: 2, label: `Claude reads the title as closed or over: ${ai.reason}`, ai: true });

  const lastPay = _dates.parseDate.call(void 0, row.lastPayment && row.lastPayment.date);
  const owes = Number(row.amountDue || 0) > 0.005;
  const left = Number(row.balance || 0);
  const approved = String(client.caseStatus || "").toUpperCase() === "APPROVED" || /^approved$/i.test(stage.trim());
  if (approved && left <= 0.005 && !owes) signals.push({ key: "paidApproved", kind: "close", strength: 2, label: "Paid in full and the case is approved" });

  // A returned payment alone is not enough; an unclear title still shows, to be read.
  const hasMain = signals.some((s) => s.strength >= 2);
  if (!hasMain && (!t.unclear || ai)) return null;
  // Supporting facts (never enough on their own).
  if (owes && (!lastPay || asOf - lastPay > 180 * DAY)) signals.push({ key: "quiet", kind: "termination", strength: 1, label: lastPay ? `No payment since ${lastPay.toISOString().slice(0, 10)} and owes $${Math.round(row.amountDue).toLocaleString()}` : "Never paid and owes" });

  const closeScore = signals.filter((s) => s.kind === "close").reduce((a, s) => a + s.strength, 0);
  const termScore = signals.filter((s) => s.kind === "termination").reduce((a, s) => a + s.strength, 0);
  const strongClose = signals.some((s) => s.kind === "close" && s.strength >= 3);
  const kind = !hasMain ? "unclear" : strongClose || closeScore > termScore ? "close" : "termination";
  // Group on the page: closing; termination (title, refunds, notes, Claude); on hold for
  // unpaid payments only (the step before termination); or a title to read.
  const ending = signals.some((s) => ["titleTermination", "refunds", "notes", "aiTermination"].includes(s.key));
  const group = kind === "close" ? "close" : kind === "unclear" ? "unclear" : ending ? "termination" : "hold";
  const signature = signals.filter((s) => s.strength >= 2).map((s) => s.key).sort().join("+") || "unclear";
  return {
    kind, group, score: closeScore + termScore + (money && money.refunds > exports.REFUND_LIMIT ? Math.min(3, money.refunds / 5000) : 0),
    signals: signals.sort((a, b) => b.strength - a.strength), title, unclear: t.unclear && !ai, signature,
    refunds: money ? money.refunds || 0 : 0,
  };
} exports.closeCheck = closeCheck;

/** MyCase payments with a negative amount, per case: refunds vs returned / charged back. */
 function moneyBackByCase(payments) {
  const out = new Map();
  for (const p of payments) {
    const amt = Number(p.amount || 0);
    if (!(amt < 0) || String(p.status || "").toLowerCase() !== "success") continue;
    const type = String(p.type || "");
    const id = String(p.caseId || "");
    if (!id) continue;
    const x = out.get(id) || { refunds: 0, refundCount: 0, lastRefund: null, returned: 0, returnedCount: 0 };
    if (/credit|refund/i.test(type)) {
      x.refunds += -amt;
      x.refundCount++;
      const d = String(p.date || "").slice(0, 10);
      if (d && (!x.lastRefund || d > x.lastRefund)) x.lastRefund = d;
    } else if (/reject|chargeback|return/i.test(type)) {
      x.returned += -amt;
      x.returnedCount++;
    } else continue; // VOID: a corrected entry, not money back
    out.set(id, x);
  }
  return out;
} exports.moneyBackByCase = moneyBackByCase;
