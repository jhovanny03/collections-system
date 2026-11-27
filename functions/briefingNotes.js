// functions/briefingNotes.js
// "AI notes" in the Monthly briefing (src/Reports/MonthlyBriefing.jsx): Claude reads the
// month's firm-level totals and writes what changed, what's unusual and what to do next.
//
// Privacy rule: only firm totals ever leave the system. The page sends numbers it already
// shows (amounts, counts, rates, month keys); sanitizeFacts() drops every other string, so
// no client name, case, phone or note can reach the AI service even by mistake.
// The notes are saved per month in briefingNotes/{YYYY-MM} (server only) with exactly what
// was sent, and are only rewritten when someone asks.
const MODEL = "claude-opus-5-5";
const MONTH_RE = /^\d{4}-\d{2}$/;
const KEY_RE = /^[A-Za-z0-9_]{1,40}$/;

/** Keep only numbers, booleans and YYYY-MM keys: anything else (any free text) is dropped. */
function sanitizeFacts(value, depth = 0) {
  if (depth > 4) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return MONTH_RE.test(value) ? value : undefined;
  if (Array.isArray(value)) {
    return value.slice(0, 24).map((v) => sanitizeFacts(v, depth + 1)).filter((v) => v !== undefined);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (!KEY_RE.test(k)) continue;
      const s = sanitizeFacts(v, depth + 1);
      if (s !== undefined && !(typeof s === "object" && !Array.isArray(s) && !Object.keys(s).length)) out[k] = s;
    }
    return out;
  }
  return undefined;
}

const SYSTEM = `You write the commentary for a monthly collections report at an immigration law firm.
Clients pay their legal fees on monthly payment plans; installments are due on the 15th.
The readers are the collections manager and the firm's partners. They know the business; they
want to know what moved, what looks off and what to do about it.

You get the month's firm-level totals as JSON. Field guide:
- month: the month of the report; asOfDay/daysInMonth: how far into the month the figures are
  (if asOfDay < daysInMonth the month is still in progress: compare to-date figures fairly).
- outstanding: money due by today and not paid (all clients). pastDue: clients who were up to
  date and missed this month's installment. planEnded: plans that ended with a balance.
- thisMonth.expected / collectedOnPlan / collectionRate: what clients who were current owed this
  month and what came in. months[]: the last 12 months (due, collected, rate), oldest first.
- plan: plan money received this month, split toward this month, older months and paid ahead;
  initialMtd: initial (intake) payments; ytd: everything collected this year.
- pace: plan money received through the same day this month vs last month, and last month's total.
- aging: today's buckets (0-30, 31-60, 61-90, 90+ days); agingTrend[]: month-end totals and 90+.
- health: plan counts by status; risk: clients 90+ days late who paid nothing in 6 months;
  forecast[]: what the plans schedule for the next 3 months and what is likely to come in.
- team: this month's follow-up list (clients who were current and missed the 15th) and how
  many the team called, reached and who paid since; promisesDue: payment promises dated this
  month (any client); kept / broken: those already decided (kept = paid by 3 days after the date).
- mycase: money MyCase received this month and items waiting on a person.

Rules:
- Use only the numbers given. Never invent a figure, a cause, a person or an event. When you
  suggest a reason, say it is a possibility ("may", "could").
- Write plain English for busy people: short sentences, no jargon, no hedging filler.
- Round money like a person would ($41.2k, $1.3M; exact dollars only under $1,000).
- Each item is one or two sentences and must contain at least one number from the data.
- Actions are concrete things the collections team can do this week, tied to a number.`;

const SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "One sentence: the single most important thing about this month." },
    changed: { type: "array", description: "2 to 4 things that moved compared with last month or the 12-month trend.", items: { type: "string" } },
    unusual: { type: "array", description: "1 to 3 things that look out of the ordinary or worth a closer look.", items: { type: "string" } },
    actions: {
      type: "array",
      description: "Exactly 3 suggested actions, most valuable first.",
      items: {
        type: "object",
        properties: { action: { type: "string" }, why: { type: "string", description: "The number behind it, in one sentence." } },
        required: ["action", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "changed", "unusual", "actions"],
  additionalProperties: false,
};

const clean = (s, max = 400) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);

/** Ask Claude for the notes. `client` is an Anthropic SDK client (a fake one in tests). */
async function writeNotes(client, facts) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // if this model declines, the API retries on a suitable fallback model
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: `Totals for ${facts.month}:\n${JSON.stringify(facts)}` }],
  });
  if (response.stop_reason === "refusal") throw new Error("The AI declined to write notes for these figures.");
  if (response.stop_reason === "max_tokens") throw new Error("The AI's answer was cut off. Try again.");
  const text = (response.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let out;
  try {
    out = JSON.parse(text);
  } catch (e) {
    throw new Error("The AI's answer could not be read. Try again.");
  }
  return {
    notes: {
      headline: clean(out.headline),
      changed: (out.changed || []).slice(0, 4).map((x) => clean(x)),
      unusual: (out.unusual || []).slice(0, 3).map((x) => clean(x)),
      actions: (out.actions || []).slice(0, 3).map((a) => ({ action: clean(a.action, 200), why: clean(a.why) })),
    },
    model: response.model || MODEL,
    usage: response.usage ? { input: response.usage.input_tokens || 0, output: response.usage.output_tokens || 0 } : null,
  };
}

/** The saved notes for a month; with regenerate (and facts), rewrite them first. */
async function briefingNotes(db, { month, facts, regenerate = false, by = null, client = null }) {
  if (!MONTH_RE.test(String(month || ""))) throw new Error("month (YYYY-MM) required.");
  const ref = db.collection("briefingNotes").doc(month);
  const saved = await ref.get();
  if (saved.exists && !regenerate) return { status: "ok", ...saved.data() };
  if (!regenerate) return { status: "none" };
  if (!client) return { status: "not-set-up" };
  const safe = sanitizeFacts({ ...(facts || {}), month });
  const { notes, model, usage } = await writeNotes(client, safe);
  const doc = { month, notes, model, usage, sent: safe, generatedAt: new Date().toISOString(), by };
  await ref.set(doc);
  return { status: "ok", ...doc };
}

module.exports = { MODEL, SYSTEM, SCHEMA, sanitizeFacts, writeNotes, briefingNotes };
