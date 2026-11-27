// src/Reports/MonthlyBriefing.jsx
// Monthly briefing: the month as one readable report, top to bottom. A cover sums it up in
// one paragraph; each section starts with a sentence saying what happened, then the
// numbers and a chart, and links to its full report. A frozen "On this page" list jumps
// between sections; "Download PDF" prints it without the app around it.
// Figures are the same prepared numbers as Home (src/data/BookProvider.jsx) plus this
// month's follow-up list, promises and MyCase status.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Card, GlobalStyles, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { collection, doc, getCountFromServer, getDoc, getDocs, query, where } from "firebase/firestore";
import db from "../firebase";
import { useBook, useInsights } from "../data/BookProvider";
import { money, pct, monthLabel } from "../billing/portfolio";
import { HEALTH } from "../billing/insights";
import { chartColors, FONT_HEADING } from "../theme/brand";
import { AgingPanel, DueCollectedChart, MonthCalendar, growX, kfmt } from "../Dashboard/homeCharts";
import BriefingNotes, { briefingFacts } from "./BriefingNotes";

const isPaid = (it) => ["paid", "paid_mycase"].includes(it.resolvedReason) || (it.status || "").toLowerCase() === "resolved";
const contacted = (it) => (it.attemptCount || 0) > 0 || (it.rcCalls || 0) > 0 || !!it.lastContactAt;
const reached = (it) => ["Reached-Working", "Promise", "Partial-Payment", "Resolved"].includes(it.status) || (it.rcReached || 0) > 0;

function Kpi({ label, value, sub, color }) {
  return (
    <Card sx={{ p: 1.75, borderTop: 3, borderTopColor: color || "primary.main" }}>
      <Typography variant="caption" fontWeight={800} color="text.secondary">{label}</Typography>
      <Typography sx={{ font: `700 22px ${FONT_HEADING}`, lineHeight: 1.25 }}>{value}</Typography>
      {sub && <Typography variant="caption" color="text.secondary" fontWeight={700}>{sub}</Typography>}
    </Card>
  );
}
const Kpis = ({ children }) => <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", mb: 2 }}>{children}</Box>;
const Panel = ({ title, children, sx }) => (
  <Card sx={{ p: 2, mb: 2, breakInside: "avoid", ...sx }}>
    {title && <Typography variant="body2" fontWeight={800} color="text.secondary" sx={{ mb: 1.5 }}>{title}</Typography>}
    {children}
  </Card>
);
function StackBar({ parts }) {
  const total = parts.reduce((t, p) => t + p.value, 0) || 1;
  return (
    <Box sx={{ display: "flex", height: 32, borderRadius: 2.5, overflow: "hidden", gap: "3px" }}>
      {parts.filter((p) => p.value > 0).map((p, i) => (
        <Tooltip key={p.label} title={`${p.label}: ${p.text || p.value}`}>
          <Box sx={{ flex: p.value, bgcolor: p.color, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800, overflow: "hidden", whiteSpace: "nowrap", transformOrigin: "left", animation: `${growX} .8s cubic-bezier(.2,.8,.2,1) both`, animationDelay: `${i * 60}ms` }}>
            {p.value / total > 0.12 ? p.label : ""}
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}

export default function MonthlyBriefing({ openReport }) {
  const theme = useTheme();
  const colors = chartColors(theme.palette.mode);
  const { summaryReady, summary: s, months, daily, mycaseMonth, generatedAt, promiseMonths } = useBook();
  const insights = useInsights();
  const [list, setList] = useState(null);
  const [sys, setSys] = useState(null);
  const [active, setActive] = useState("money");
  const refs = useRef({});
  const monthKey = s.month.key;
  const monthName = monthLabel(monthKey, "long");
  const shortMonth = monthName.split(" ")[0];

  // This month's follow-up list.
  useEffect(() => {
    if (!monthKey) return undefined;
    let alive = true;
    (async () => {
      const items = (await getDocs(collection(db, "followUpsCohorts", monthKey, "items")).catch(() => ({ docs: [] }))).docs.map((d) => d.data());
      const main = items.filter((i) => (i.section || "current") === "current" && i.resolvedReason !== "no_longer_due");
      if (alive) setList({ listed: main.length, contacted: main.filter(contacted).length, reached: main.filter(reached).length, paid: main.filter(isPaid).length });
    })();
    return () => { alive = false; };
  }, [monthKey]);

  // Promises due this month (every promise in the client notes, prepared on the server:
  // kept = paid the amount by 3 days after its date).
  const team = useMemo(() => {
    if (!list) return null;
    const p = (promiseMonths && promiseMonths[monthKey]) || { due: 0, kept: 0, broken: 0, open: 0, keptAmount: 0 };
    return { ...list, promisesDue: p.due, kept: p.kept, broken: p.broken, promisesOpen: p.open, keptAmount: p.keptAmount };
  }, [list, promiseMonths, monthKey]);

  // MyCase: last sync, what is waiting on a person.
  useEffect(() => {
    let alive = true;
    const count = (q) => getCountFromServer(q).then((x) => x.data().count).catch(() => null);
    Promise.all([
      getDoc(doc(db, "integrations", "mycasePayments")).catch(() => null),
      count(query(collection(db, "mycasePaymentReview"), where("status", "==", "open"))),
      count(query(collection(db, "mycaseCases"), where("needsSetup", "==", true))),
      count(query(collection(db, "mycaseCases"), where("needsTagging", "==", true))),
    ]).then(([integ, review, setup, tag]) => {
      if (!alive) return;
      const at = integ && integ.exists() ? integ.data().updatedAt : null;
      setSys({ lastSync: at ? new Date(at.toDate ? at.toDate() : at) : null, review, setup, tag });
    });
    return () => { alive = false; };
  }, []);

  const b90 = (s.buckets || []).find((b) => b.key === "b90");
  const share90 = b90 && s.receivable.amount ? b90.amount / s.receivable.amount : null;
  const avgRate = useMemo(() => {
    const due = (months || []).reduce((t, m) => t + (m.expected || 0), 0);
    return due ? (months || []).reduce((t, m) => t + (m.collected || 0), 0) / due : null;
  }, [months]);
  const health = useMemo(() => {
    const list = (insights && insights.health) || [];
    return Object.fromEntries(HEALTH.map((h) => [h.key, list.filter((r) => r.key === h.key).length]));
  }, [insights]);
  const risk = useMemo(() => (insights && insights.risk) || [], [insights]);
  const fc = insights && insights.forecast;
  const fcScheduled = fc ? fc.months.reduce((t, m) => t + m.scheduled, 0) : null;
  const fcLikely = fc ? fc.months.reduce((t, m) => t + m.likely, 0) : null;
  const keptRate = team && team.kept + team.broken ? team.kept / (team.kept + team.broken) : null;
  // Firm totals for the AI notes (numbers only: see BriefingNotes.jsx).
  const facts = useMemo(() => (summaryReady ? briefingFacts({ s, months, daily, insights, team, sys, mycaseMonth, generatedAt, health, risk }) : null), [summaryReady, s, months, daily, insights, team, sys, mycaseMonth, generatedAt, health, risk]);

  const SECTIONS = [
    { id: "money", title: "Where the money stands", report: "overview" },
    { id: "aging", title: "How old it is", report: "aging" },
    { id: "collection", title: "Collection this month", report: "collected" },
    { id: "payments", title: "What came in", report: "payments" },
    { id: "risk", title: "Risk and the next 3 months", report: "risk" },
    { id: "team", title: "Follow-ups and promises", report: "followups" },
    { id: "mycase", title: "MyCase", report: "mycase" },
  ];
  const NAV = [{ id: "notes", title: "AI notes" }, ...SECTIONS];
  useEffect(() => {
    const obs = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: "-35% 0px -60% 0px" });
    Object.values(refs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [summaryReady]);

  const sec = (id, lede, children) => {
    const meta = SECTIONS.find((x) => x.id === id);
    return (
      <Box key={id} id={id} ref={(el) => (refs.current[id] = el)} sx={{ scrollMarginTop: 110, mb: 3.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1} sx={{ borderBottom: 2, borderColor: "text.primary", pb: 0.75, mb: 1.25 }}>
          <Typography variant="h5">{meta.title}</Typography>
          <Button size="small" onClick={() => openReport(meta.report)} sx={{ displayPrint: "none" }}>Open the full report →</Button>
        </Stack>
        <Typography sx={{ fontSize: 15, mb: 2, maxWidth: 860, lineHeight: 1.6, "& b": { color: "primary.main" } }}>{lede}</Typography>
        {children}
      </Box>
    );
  };

  if (!summaryReady) return <LinearProgress />;
  const split = [
    { label: `Toward ${shortMonth}`, value: s.plan.thisMonth, color: theme.palette.primary.main, text: money(s.plan.thisMonth) },
    { label: "Older months", value: s.plan.catchUp, color: theme.palette.secondary.main, text: money(s.plan.catchUp) },
    { label: "Paid ahead", value: s.plan.ahead, color: theme.palette.success.main, text: money(s.plan.ahead) },
  ];

  return (
    <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 230px" }, alignItems: "start" }}>
      <GlobalStyles styles={{ "@media print": { ".MuiAppBar-root, .MuiDrawer-root, [data-noprint]": { display: "none !important" }, body: { background: "#fff" } } }} />
      <Box sx={{ minWidth: 0 }}>
        {/* Cover */}
        <Box sx={{ p: { xs: 2.5, md: 3.5 }, mb: 3, borderRadius: 5, color: "#fff", background: "radial-gradient(70% 120% at 100% 0%, rgba(23,163,152,.35), transparent 60%), linear-gradient(135deg, #000C66, #0A1470)", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
          <Typography variant="overline" sx={{ color: "rgba(255,255,255,.7)", fontWeight: 800 }}>Collections report</Typography>
          <Typography sx={{ font: `700 36px ${FONT_HEADING}`, lineHeight: 1.1, my: 0.5 }}>{monthName}</Typography>
          <Typography sx={{ color: "rgba(255,255,255,.85)", maxWidth: 760, fontSize: 15 }}>
            Clients who were up to date paid <b>{pct(s.month.collectionRate, 1)}</b> of what they owed for {shortMonth}
            {avgRate != null ? ` (the 12-month average is ${pct(avgRate)})` : ""}. What's outstanding is <b>{kfmt(s.outstanding)}</b>
            {share90 != null ? `, and ${pct(share90)} of it is 90+ days old` : ""}. <b>{s.planEnded.clients.toLocaleString()}</b> plans have ended with a balance ({kfmt(s.planEnded.amount)}); they're the biggest risk.
          </Typography>
          <Stack direction="row" spacing={3.5} useFlexGap flexWrap="wrap" sx={{ mt: 2.25 }}>
            {[[money(s.plan.mtd), "collected on plans"], [pct(s.month.collectionRate, 1), "collection rate"], [kfmt(s.outstanding), "outstanding"], [keptRate == null ? "—" : pct(keptRate), "promises kept"]].map(([v, l]) => (
              <Box key={l}>
                <Typography sx={{ font: `700 26px ${FONT_HEADING}` }}>{v}</Typography>
                <Typography variant="caption" sx={{ color: "rgba(255,255,255,.72)", fontWeight: 700 }}>{l}</Typography>
              </Box>
            ))}
          </Stack>
          <Typography variant="caption" sx={{ display: "block", mt: 2, color: "rgba(255,255,255,.6)" }}>
            Figures as of {generatedAt ? generatedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "now"} · the same numbers as Home
          </Typography>
        </Box>

        <Box id="notes" ref={(el) => (refs.current.notes = el)} sx={{ scrollMarginTop: 110 }}>
          <BriefingNotes month={monthKey} facts={facts} ready={!!(facts && team && sys)} />
        </Box>

        {sec("money", <>Clients owe <b>{money(s.outstanding)}</b> that was due by today ({s.outstandingClients.toLocaleString()} clients). <b>{kfmt(s.leftOnPlans)}</b> is still to come on plans, including installments not due yet.</>, <>
          <Kpis>
            <Kpi label="Outstanding" value={money(s.outstanding)} sub={`${s.outstandingClients.toLocaleString()} clients`} />
            <Kpi label="Past due this month" value={money(s.pastDue.amount)} sub={`${s.pastDue.clients} were current`} color="secondary.main" />
            <Kpi label="Left to collect on plans" value={kfmt(s.leftOnPlans)} sub={`${s.clients.inPlan.toLocaleString()} clients paying`} />
            <Kpi label="Plan ended, still owes" value={kfmt(s.planEnded.amount)} sub={`${s.planEnded.clients} clients`} color="error.main" />
            <Kpi label="Collected this year" value={kfmt(s.collected.ytd)} sub="all payments" color="success.main" />
          </Kpis>
          <Panel title="Due vs collected, last 12 months"><DueCollectedChart months={months} colors={colors} /></Panel>
        </>)}

        {sec("aging", <><b>{b90 ? money(b90.amount) : "—"}</b> of what's owed is 90+ days old ({b90 ? b90.clients : 0} clients). Only <b>{money(s.pastDue.amount)}</b> is from {shortMonth}: clients who were current and missed the 15th.</>, (
          <Panel><AgingPanel buckets={s.buckets || []} total={s.receivable.amount} clients={s.receivable.clients} /></Panel>
        ))}

        {sec("collection", <><b>{money(s.month.collectedOnPlan)} of {money(s.month.expected)}</b> due from clients who were current came in ({pct(s.month.collectionRate, 1)}){avgRate != null ? `, against a 12-month average of ${pct(avgRate)}` : ""}.</>, (
          <Kpis>
            <Kpi label={`Due in ${shortMonth}`} value={money(s.month.expected)} sub="from clients who were current" />
            <Kpi label="Collected" value={money(s.month.collectedOnPlan)} sub={pct(s.month.collectionRate, 1)} color="success.main" />
            <Kpi label="Not paid" value={money(s.pastDue.amount)} sub={`${s.pastDue.clients} clients`} color="secondary.main" />
            <Kpi label="12-month rate" value={avgRate == null ? "—" : pct(avgRate)} sub="due vs collected" />
          </Kpis>
        ))}

        {sec("payments", <><b>{money(s.plan.mtd)}</b> came in on plans: {money(s.plan.thisMonth)} toward {shortMonth}, {money(s.plan.catchUp)} for older months and {money(s.plan.ahead)} paid ahead. Intake took <b>{money(s.collected.mtdInitial || 0)}</b> in initial payments.</>, <>
          <Panel title="Where the plan money went"><StackBar parts={split} />
            <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              {split.map((p) => <Typography key={p.label} variant="caption" fontWeight={800} color="text.secondary"><Box component="span" sx={{ display: "inline-block", width: 9, height: 9, borderRadius: 0.75, bgcolor: p.color, mr: 0.75 }} />{p.label} {money(p.value)}</Typography>)}
            </Stack>
          </Panel>
          {daily && <Panel title={`${shortMonth}, day by day`}><MonthCalendar daily={daily} /></Panel>}
        </>)}

        {sec("risk", <><b>{health.ended || 0} plans ended owing</b> and {health.endsOwing || 0} more will end owing at today's pace. {risk.length} clients owe 90+ days and paid nothing in 6 months.{fcScheduled != null ? <> The plans schedule <b>{kfmt(fcScheduled)}</b> for the next 3 months; about {kfmt(fcLikely)} is likely.</> : ""}</>, <>
          <Panel title="Plan health">
            <StackBar parts={HEALTH.map((h) => ({ label: h.label, value: health[h.key] || 0, color: theme.palette[h.tone].main, text: `${health[h.key] || 0} plans` }))} />
            <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              {HEALTH.map((h) => <Typography key={h.key} variant="caption" fontWeight={800} color="text.secondary"><Box component="span" sx={{ display: "inline-block", width: 9, height: 9, borderRadius: 0.75, bgcolor: theme.palette[h.tone].main, mr: 0.75 }} />{h.label} {health[h.key] || 0}</Typography>)}
            </Stack>
          </Panel>
          {fc && (
            <Kpis>
              {fc.months.map((m) => <Kpi key={m.key} label={monthLabel(m.key, "long")} value={money(m.scheduled)} sub={`scheduled · likely ${kfmt(m.likely)}`} />)}
              <Kpi label="Write-off candidates" value={risk.length} sub={kfmt(risk.reduce((acc, r) => acc + (r.owed || 0), 0))} color="error.main" />
            </Kpis>
          )}
        </>)}

        {sec("team", team ? <><b>{team.listed}</b> clients who were current missed the 15th; <b>{team.paid}</b> have paid since. The team called {team.contacted} of them and reached <b>{team.reached}</b>. {team.kept + team.broken ? <><b>{pct(keptRate)}</b> of {shortMonth}'s decided promises were kept ({team.kept} of {team.kept + team.broken}).</> : "No promises for this month have been decided yet."}</> : "Loading this month's follow-ups…", team && (
          <Kpis>
            <Kpi label="On the follow-up list" value={team.listed} sub="were current, missed the 15th" />
            <Kpi label="Called" value={`${team.contacted} of ${team.listed}`} sub={team.listed ? pct(team.contacted / team.listed) : ""} />
            <Kpi label="Reached" value={team.reached} sub={`${team.promisesDue} promises due in ${shortMonth}`} color="success.main" />
            <Kpi label="Paid since the list" value={team.paid} color="success.main" />
            <Kpi label="Promises kept" value={keptRate == null ? "—" : pct(keptRate)} sub={`${team.kept} kept · ${team.broken} broken · ${kfmt(team.keptAmount)}`} />
          </Kpis>
        ))}

        {sec("mycase", sys ? <>MyCase last synced <b>{sys.lastSync ? sys.lastSync.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never"}</b>{mycaseMonth ? <> and received <b>{money(mycaseMonth.received)}</b> in {shortMonth}</> : ""}. <b>{sys.review ?? "—"}</b> payments are waiting in MyCase Review, <b>{sys.setup ?? "—"}</b> new cases in Case Setup and {sys.tag ?? "—"} clients have invoices to tag.</> : "Loading MyCase status…", sys && (
          <Kpis>
            <Kpi label="Last sync" value={sys.lastSync ? sys.lastSync.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "never"} sub={sys.lastSync ? sys.lastSync.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""} color="success.main" />
            {mycaseMonth && <Kpi label={`Received in ${shortMonth}`} value={kfmt(mycaseMonth.received)} sub={mycaseMonth.notInApp ? `${kfmt(mycaseMonth.notInApp)} on cases not set up yet` : "all on cases in Collections"} />}
            <Kpi label="Held for review" value={sys.review ?? "—"} sub="MyCase Review" color="secondary.main" />
            <Kpi label="New cases to set up" value={sys.setup ?? "—"} sub="Case Setup" />
            <Kpi label="Clients to tag" value={sys.tag ?? "—"} sub="Case Setup" />
          </Kpis>
        ))}
      </Box>

      {/* On this page */}
      <Card data-noprint sx={{ position: { lg: "sticky" }, top: { lg: 100 }, p: 1.75, display: { xs: "none", lg: "block" } }}>
        <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ letterSpacing: ".12em", textTransform: "uppercase", display: "block", mb: 1 }}>On this page</Typography>
        {NAV.map((x) => (
          <Box key={x.id} component="button" type="button" onClick={() => document.getElementById(x.id)?.scrollIntoView({ behavior: "smooth" })}
            sx={{ display: "block", width: "100%", textAlign: "left", font: "inherit", fontWeight: 800, fontSize: 13, px: 1.25, py: 0.9, mb: 0.25, border: 0, borderLeft: 3, cursor: "pointer", borderRadius: 1.5,
              borderColor: active === x.id ? "primary.main" : "transparent", bgcolor: active === x.id ? alpha(theme.palette.primary.main, 0.08) : "transparent", color: active === x.id ? "primary.main" : "text.secondary" }}>
            {x.title}
          </Box>
        ))}
        <Button fullWidth variant="contained" sx={{ mt: 1.5 }} onClick={() => window.print()}>Download PDF</Button>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Opens the print window: choose "Save as PDF".</Typography>
      </Card>
    </Box>
  );
}
