// src/Reports/BriefingNotes.jsx
// "AI notes" at the top of the Monthly briefing: Claude reads the month's firm-level totals
// (the same numbers the briefing shows) and writes what changed, what's unusual and three
// suggested actions. Only totals are sent: no client names or records (the server also
// strips any text before sending: functions/briefingNotes.js). The notes are saved per
// month and only rewritten when someone clicks "Rewrite".
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Card, Chip, CircularProgress, Collapse, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase";
import { FONT_HEADING } from "../theme/brand";

const callNotes = (data) => httpsCallable(getFunctions(app), "briefingNotes", { timeout: 180000 })(data).then((r) => r.data);
const sum = (a) => (a || []).reduce((t, x) => t + (Number(x) || 0), 0);

/** The figures sent to the AI: firm totals only (numbers and month keys). */
export function briefingFacts({ s, months, daily, insights, team, sys, mycaseMonth, generatedAt, health, risk }) {
  const at = generatedAt || new Date();
  const fc = insights && insights.forecast;
  const days = (daily && daily.days) || [];
  const lastDays = (daily && daily.lastDays) || [];
  return {
    month: s.month.key,
    asOfDay: at.getDate(),
    daysInMonth: new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate(),
    outstanding: { amount: s.outstanding, clients: s.outstandingClients },
    pastDue: { amount: s.pastDue.amount, clients: s.pastDue.clients },
    leftOnPlans: s.leftOnPlans,
    clientsPaying: s.clients.inPlan,
    planEnded: { amount: s.planEnded.amount, clients: s.planEnded.clients },
    thisMonth: { expected: s.month.expected, collectedOnPlan: s.month.collectedOnPlan, collectionRate: s.month.collectionRate },
    months: (months || []).map((m) => ({ key: m.key, due: m.expected, collected: m.collected, rate: m.rate })),
    plan: { received: s.plan.mtd, towardThisMonth: s.plan.thisMonth, olderMonths: s.plan.catchUp, paidAhead: s.plan.ahead },
    initialMtd: s.collected.mtdInitial || 0,
    ytd: s.collected.ytd,
    pace: daily ? { receivedToDate: sum(days), lastMonthSameDay: sum(lastDays.slice(0, days.length)), lastMonthTotal: sum(lastDays) } : null,
    aging: Object.fromEntries((s.buckets || []).map((b) => [b.key, { amount: b.amount, clients: b.clients }])),
    agingTrend: ((insights && insights.agingTrend) || []).map((t) => ({ key: t.key, total: t.total, over90: t.b90, clients: t.clients })),
    health,
    risk: { clients: risk.length, owed: risk.reduce((t, r) => t + (r.owed || 0), 0) },
    forecast: fc ? fc.months.map((m) => ({ key: m.key, scheduled: m.scheduled, likely: m.likely })) : null,
    team: team || null,
    mycase: { received: mycaseMonth ? mycaseMonth.received : null, notInApp: mycaseMonth ? mycaseMonth.notInApp : null, heldForReview: sys ? sys.review : null, casesToSetUp: sys ? sys.setup : null, clientsToTag: sys ? sys.tag : null },
  };
}

function Column({ title, color, children }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" fontWeight={800} sx={{ color, letterSpacing: ".1em", textTransform: "uppercase", display: "block", mb: 1 }}>{title}</Typography>
      <Stack spacing={1.1}>{children}</Stack>
    </Box>
  );
}
const Item = ({ children, color }) => (
  <Box sx={{ display: "flex", gap: 1, fontSize: 14, lineHeight: 1.5 }}>
    <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: color, mt: "8px", flex: "none" }} />
    <Box>{children}</Box>
  </Box>
);

export default function BriefingNotes({ month, facts, ready }) {
  const theme = useTheme();
  const [state, setState] = useState({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showSent, setShowSent] = useState(false);

  useEffect(() => {
    if (!month) return undefined;
    let alive = true;
    setState({ status: "loading" });
    callNotes({ month })
      .then((r) => alive && setState(r))
      .catch((e) => alive && setState({ status: "error", message: e.message }));
    return () => { alive = false; };
  }, [month]);

  const rewrite = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setState(await callNotes({ month, facts, regenerate: true }));
    } catch (e) {
      setError(e.message || "Could not write the notes.");
    } finally {
      setBusy(false);
    }
  }, [month, facts]);

  const n = state.status === "ok" ? state.notes : null;
  const writtenAt = state.generatedAt ? new Date(state.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

  return (
    <Card sx={{ p: { xs: 2, md: 2.5 }, mb: 3.5, border: 1, borderColor: alpha(theme.palette.primary.main, 0.25), background: `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.05)}, transparent 70%)`, breakInside: "avoid" }}>
      <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
        <Typography variant="h5">AI notes</Typography>
        <Chip size="small" label="Written by Claude" color="primary" variant="outlined" sx={{ fontWeight: 800 }} />
        <Box sx={{ flex: 1 }} />
        {(n || state.status === "none") && (
          <Button size="small" variant={n ? "text" : "contained"} disabled={busy || !ready} onClick={rewrite} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : null} sx={{ displayPrint: "none" }}>
            {busy ? "Writing… (about 30 seconds)" : n ? "Rewrite with today's numbers" : "Write this month's notes"}
          </Button>
        )}
      </Stack>

      {state.status === "loading" && <Typography color="text.secondary">Loading…</Typography>}
      {state.status === "error" && <Alert severity="warning">Could not load the notes: {state.message}. Is the local functions server running?</Alert>}
      {state.status === "not-set-up" && (
        <Alert severity="info">
          The AI is not set up yet. Save an Anthropic API key in <b>%USERPROFILE%\.collections-secrets\anthropic.env</b> as one line, <code>ANTHROPIC_API_KEY=…</code>, then restart the local functions server.
        </Alert>
      )}
      {state.status === "none" && !busy && (
        <Typography color="text.secondary" sx={{ fontSize: 14, maxWidth: 820 }}>
          Claude reads this month's firm totals (the numbers below, no client names or records) and writes what changed since last month, what looks unusual and three things to do next. It takes about 30 seconds.
        </Typography>
      )}
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}

      {n && (
        <>
          {n.headline && <Typography sx={{ font: `700 19px ${FONT_HEADING}`, lineHeight: 1.35, mb: 2, maxWidth: 900 }}>{n.headline}</Typography>}
          <Box sx={{ display: "grid", gap: 2.5, gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" } }}>
            <Column title="What changed" color="primary.main">
              {n.changed.map((t, i) => <Item key={i} color={theme.palette.primary.main}>{t}</Item>)}
            </Column>
            <Column title="Worth a closer look" color="secondary.main">
              {n.unusual.map((t, i) => <Item key={i} color={theme.palette.secondary.main}>{t}</Item>)}
            </Column>
            <Column title="Suggested actions" color="success.main">
              {n.actions.map((a, i) => (
                <Box key={i} sx={{ display: "flex", gap: 1.25 }}>
                  <Box sx={{ width: 22, height: 22, borderRadius: "50%", bgcolor: "success.main", color: "#fff", fontSize: 12, fontWeight: 800, display: "grid", placeItems: "center", flex: "none", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>{i + 1}</Box>
                  <Box sx={{ fontSize: 14, lineHeight: 1.5 }}>
                    <b>{a.action}</b>
                    <Typography variant="body2" color="text.secondary">{a.why}</Typography>
                  </Box>
                </Box>
              ))}
            </Column>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 2, pt: 1.5, borderTop: 1, borderColor: "divider" }}>
            <Typography variant="caption" color="text.secondary">
              Written {writtenAt || ""} from firm totals only (no client names or records). Suggestions, not decisions: check the numbers below before acting.
            </Typography>
            <Button size="small" onClick={() => setShowSent((v) => !v)} sx={{ displayPrint: "none" }}>{showSent ? "Hide" : "See"} exactly what was sent</Button>
          </Stack>
          <Collapse in={showSent}>
            <Box component="pre" sx={{ mt: 1, p: 1.5, borderRadius: 2, bgcolor: "action.hover", fontSize: 11.5, maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap", displayPrint: "none" }}>
              {JSON.stringify(state.sent, null, 2)}
            </Box>
          </Collapse>
        </>
      )}
    </Card>
  );
}
