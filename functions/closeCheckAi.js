// functions/closeCheckAi.js
// Data quality, "Termination & closing": Claude reads the MyCase case titles that the rules
// in src/billing/closeCheck.js cannot settle ("withdrawal", "dismissed", "deceased"...).
// Only the title is sent, with the client's name taken out (redactTitle); a title that
// still contains any word of the name is not sent at all. The page shows the exact text
// before anything goes out. Answers are saved in closeChecks/{clientId} with the title they
// read, and show on the page as one more signal (a person still decides).
const { redactTitle, isRedacted, titleKey } = require("./shared/billing/closeCheck");

const MODEL = "claude-opus-5-5";
const TAGS = ["termination", "should_close", "not_ending"];

const SYSTEM = `You read case titles from an immigration law firm's case management system and say
whether a title shows that the firm's work for that client is ending.
The client's name has been replaced with [client]. Title conventions: "A (MM-YY)" = active,
opened that month; "F (MM-YY)" = filed with USCIS; "MCH" = master calendar hearing (court);
"QR" = qualifying relative; "AOS" = adjustment of status; "HOLD" = work paused.

Answer for each title:
- termination: the firm or the client is ending the representation (termination, client
  withdrew from the firm, fired the firm, moved to another lawyer, refund of fees).
- should_close: the case is over and should be closed (closed, completed, the client died,
  transferred out, application withdrawn by the client so nothing is left to do).
- not_ending: anything else, including legal wording about the proceedings: "cancellation of
  removal" (a form of relief), "motion to terminate" or "dismissed removal" (court outcomes),
  a relative (QR) who died, a deadline or hearing date.
Give a reason of at most 15 words, quoting the words in the title that decided it.`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { i: { type: "integer" }, tag: { type: "string", enum: TAGS }, reason: { type: "string" } },
        required: ["i", "tag", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

/** The unclear titles still waiting for a reading, with names taken out. */
async function titlesToRead(db) {
  const rows = [];
  (await db.collection("portfolioRows").get()).forEach((d) => (d.data().rows || []).forEach((r) => r.closeCheck && r.closeCheck.unclear && rows.push(r)));
  if (!rows.length) return { items: [], skipped: 0 };
  const clients = await db.getAll(...rows.map((r) => db.collection("clients").doc(r.id)));
  const caseIds = [...new Set(clients.map((s) => (s.exists ? String(s.data().mycaseCaseId || "") : "")).filter(Boolean))];
  const cases = new Map();
  for (let i = 0; i < caseIds.length; i += 300) {
    (await db.getAll(...caseIds.slice(i, i + 300).map((id) => db.collection("mycaseCases").doc(id)))).forEach((s) => s.exists && cases.set(s.id, s.data()));
  }
  const items = [];
  let skipped = 0;
  rows.forEach((r, k) => {
    const c = clients[k].exists ? clients[k].data() : {};
    const kase = cases.get(String(c.mycaseCaseId || "")) || {};
    const names = [c.firstName, c.lastName, r.name, ...(kase.clientNames || [])].filter(Boolean);
    const title = r.closeCheck.title;
    const text = redactTitle(title, names);
    if (!text || !isRedacted(text, names)) {
      skipped++;
      return;
    }
    items.push({ clientId: r.id, text, titleKey: titleKey(title) });
  });
  return { items, skipped };
}

/** Ask Claude about the titles (text only). Returns [{ tag, reason }] in the same order. */
async function readTitles(client, texts) {
  const list = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: `Case titles (number. title):\n${list}` }],
  });
  if (response.stop_reason === "refusal") throw new Error("The AI declined to read these titles.");
  if (response.stop_reason === "max_tokens") throw new Error("The AI's answer was cut off. Try again.");
  const text = (response.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let out;
  try {
    out = JSON.parse(text);
  } catch (e) {
    throw new Error("The AI's answer could not be read. Try again.");
  }
  const byI = new Map((out.items || []).map((x) => [Number(x.i), x]));
  return { model: response.model || MODEL, answers: texts.map((_, i) => {
    const a = byI.get(i + 1);
    return a && TAGS.includes(a.tag) ? { tag: a.tag, reason: String(a.reason || "").replace(/\s+/g, " ").trim().slice(0, 160) } : null;
  }) };
}

/**
 * preview (run=false): what would be sent. run: send, save the answers, return counts.
 */
async function checkCaseTitles(db, { run = false, client = null, by = null } = {}) {
  const { items, skipped } = await titlesToRead(db);
  if (!run) return { status: "preview", texts: items.map((x) => x.text), skipped };
  if (!items.length) return { status: "ok", read: 0, skipped };
  if (!client) return { status: "not-set-up" };
  const at = new Date().toISOString();
  let read = 0;
  const tags = { termination: 0, should_close: 0, not_ending: 0 };
  for (let i = 0; i < items.length; i += 60) {
    const chunk = items.slice(i, i + 60);
    const { model, answers } = await readTitles(client, chunk.map((x) => x.text));
    const batch = db.batch();
    for (let k = 0; k < chunk.length; k++) {
      const x = chunk[k];
      const a = answers[k];
      if (!a) continue;
      batch.set(db.collection("closeChecks").doc(x.clientId), { titleKey: x.titleKey, tag: a.tag, reason: a.reason, sent: x.text, model, at, by });
      tags[a.tag]++;
      read++;
    }
    await batch.commit();
  }
  return { status: "ok", read, skipped, tags };
}

module.exports = { MODEL, SYSTEM, SCHEMA, titlesToRead, readTitles, checkCaseTitles };
