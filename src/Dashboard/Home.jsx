// src/Dashboard/Home.jsx
// Home ("Pulse"): today at a glance. The month's plan money as a live line, the collection
// rate, the numbers that matter with their trend, what needs attention, the two charts,
// the month day by day, and the latest money / promises / plans waiting in tabs.
import React, { useEffect, useMemo, useState } from "react";
import { Box, Button, Card, Chip, LinearProgress, List, ListItemButton, ListItemText, Stack, Tab, Tabs, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { Link as RouterLink } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import PhoneInTalkRounded from "@mui/icons-material/PhoneInTalkRounded";
import EventAvailableRounded from "@mui/icons-material/EventAvailableRounded";
import PlaylistAddCheckRounded from "@mui/icons-material/PlaylistAddCheckRounded";
import RuleRounded from "@mui/icons-material/RuleRounded";
import LinkOffRounded from "@mui/icons-material/LinkOffRounded";
import EditNoteRounded from "@mui/icons-material/EditNoteRounded";
import HourglassTopRounded from "@mui/icons-material/HourglassTopRounded";
import SyncRounded from "@mui/icons-material/SyncRounded";
import AccountBalanceWalletRounded from "@mui/icons-material/AccountBalanceWalletRounded";
import ReceiptLongRounded from "@mui/icons-material/ReceiptLongRounded";
import EventBusyRounded from "@mui/icons-material/EventBusyRounded";
import VerifiedRounded from "@mui/icons-material/VerifiedRounded";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import db from "../firebase";
import { useAuth } from "../auth/useAuth";
import { useBook } from "../data/BookProvider";
import { useWorkQueue } from "../data/WorkQueueProvider";
import { money, pct, monthLabel } from "../billing/portfolio";
import { chartColors, FONT_HEADING } from "../theme/brand";
import { PageHeader, Section, Empty } from "../ui/kit";
import { parseDate } from "../utils/dates";
import { AgingPanel, DueCollectedChart, MonthCalendar, PaceArea, Ring, Spark, agingColors, growX, kfmt } from "./homeCharts";

const ago = (d) => {
  if (!d) return "never";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
};
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};
const initials = (name) => String(name || "").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function useLastSync() {
  const [at, setAt] = useState(null);
  useEffect(
    () =>
      onSnapshot(
        doc(db, "integrations", "mycasePayments"),
        (s) => setAt(s.exists() ? parseDate(s.data().updatedAt) : null),
        () => setAt(null)
      ),
    []
  );
  return at;
}

const Help = ({ text }) => (
  <Tooltip title={text}>
    <InfoOutlined sx={{ fontSize: 15, opacity: 0.55, cursor: "help" }} />
  </Tooltip>
);

/** A Home number: label + icon, value, what it means, and a trend line or meter. */
function Kpi({ label, value, sub, help, icon, color, to, loading, children, i = 0 }) {
  const theme = useTheme();
  return (
    <Card
      component={to ? RouterLink : "div"}
      to={to}
      sx={{
        p: 2, pb: 1.25, display: "flex", flexDirection: "column", gap: 0.5, textDecoration: "none", color: "inherit", minWidth: 0,
        transition: "transform .15s, box-shadow .15s",
        "&:hover": to ? { transform: "translateY(-2px)", boxShadow: `0 14px 30px -18px ${alpha(theme.palette.primary.main, 0.45)}` } : undefined,
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={800} color="text.secondary" sx={{ lineHeight: 1.25 }}>{label}</Typography>
          {help && <Help text={help} />}
        </Stack>
        <Box sx={{ width: 34, height: 34, borderRadius: 2.5, display: "grid", placeItems: "center", flex: "none", bgcolor: alpha(color, 0.12), color, "& svg": { fontSize: 19 } }}>{icon}</Box>
      </Stack>
      <Typography sx={{ font: `700 26px ${FONT_HEADING}`, mt: 0.5, letterSpacing: "-0.01em" }}>{loading ? "—" : value}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ minHeight: 34, lineHeight: 1.4 }}>{sub}</Typography>
      <Box sx={{ mt: "auto", animationDelay: `${i * 45}ms` }}>{children}</Box>
    </Card>
  );
}

function Meter({ value, color, caption }) {
  const theme = useTheme();
  return (
    <Box sx={{ pb: 0.75 }}>
      <Box sx={{ height: 7, borderRadius: 99, bgcolor: alpha(theme.palette.text.primary, 0.07), overflow: "hidden" }}>
        <Box sx={{ height: "100%", width: `${Math.max(0, Math.min(100, (value || 0) * 100))}%`, bgcolor: color, borderRadius: 99, transformOrigin: "left", animation: `${growX} .8s cubic-bezier(.2,.8,.2,1) both` }} />
      </Box>
      {caption && <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: "block", mt: 0.5 }}>{caption}</Typography>}
    </Box>
  );
}

export default function Home() {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  const colors = chartColors(theme.palette.mode);
  const { user, isEditorOrHigher } = useAuth();
  // Prepared figures (src/data/BookProvider.jsx): no download of every client.
  const { summaryReady, rows, recent: payments, summary: s, months, byMonth, daily, mycaseMonth, generatedAt, refresh, refreshing, source } = useBook();
  // The cards and charts need only the summary; lists built from rows fill in a moment later.
  const loading = !summaryReady;
  const { counts } = useWorkQueue();
  const lastSync = useLastSync();
  const editor = isEditorOrHigher();
  const [listTab, setListTab] = useState(0);

  const monthName = monthLabel(s.month.key, "long").split(" ")[0];
  const prevMonthName = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toLocaleDateString("en-US", { month: "long" });
  const pastThe15th = new Date().getDate() >= 15;
  const recent = payments.filter((p) => p.amount > 0).slice(0, 8);
  const promisesToday = counts.promisesTodayList || [];
  const waiting = useMemo(() => rows.filter((r) => r.awaitingPlan && r.status !== "closed").sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).slice(0, 8), [rows]);

  const firstName = (user?.firstName || user?.name || "").split(" ")[0];
  const change = s.plan.lastMonthSameTime > 0 ? s.plan.mtd / s.plan.lastMonthSameTime - 1 : null;

  const work = [
    { n: counts.promisesToday, label: "Promises due today", to: "/promised-payments", icon: <EventAvailableRounded />, tone: "warn" },
    { n: counts.followUpsOpen, label: "Follow-ups this month", to: "/follow-ups", icon: <PhoneInTalkRounded />, tone: "bad" },
    { n: counts.followUpsUnlogged, label: "Paid in MyCase, not logged", to: "/follow-ups", icon: <EditNoteRounded />, tone: "default" },
    { n: counts.initialOpen, label: "Initial payments not completed", to: "/initial-payments", icon: <AccountBalanceWalletRounded />, tone: "warn" },
    { n: counts.waitingPlan, label: "Waiting for a plan", to: "/case-setup", icon: <HourglassTopRounded />, tone: "warn" },
    { n: counts.newCases, label: "New MyCase cases", to: "/case-setup", icon: <PlaylistAddCheckRounded />, tone: "default" },
    { n: counts.reviewOpen, label: "MyCase payments to review", to: "/mycase-review", icon: <RuleRounded />, tone: "default" },
    { n: counts.linkProblems, label: "MyCase link problems", to: "/case-setup", icon: <LinkOffRounded />, tone: "default" },
  ].filter((w) => w.n > 0);
  const toneColor = { bad: theme.palette.error.main, warn: theme.palette.warning.main, default: theme.palette.primary.main };

  // Where this month's plan money went.
  const parts = [
    { label: `Toward ${monthName}`, value: s.plan.thisMonth, color: "#5EEAD4" },
    { label: "Older months", value: s.plan.catchUp, color: "#FF9B76" },
    { label: "Paid ahead", value: s.plan.ahead, color: "#AEB6FF" },
  ];
  const partsTotal = parts.reduce((t, p) => t + p.value, 0) || 1;
  const mycaseNote = mycaseMonth
    ? ` MyCase received ${money(mycaseMonth.received)} in all; ${money(mycaseMonth.notInApp)} of it (${mycaseMonth.notInAppCount} payments) is on cases not set up in Collections yet (Case Setup).`
    : "";
  const aging = s.buckets || [];
  const agingCols = agingColors(theme);
  const initialTrend = (byMonth || []).map((m) => m.initial || 0);
  // Intake money MyCase received this month on new cases not set up in Collections yet
  // (counted once set up), and the removal-defense part of initial payments.
  const newCaseMoney = (mycaseMonth && mycaseMonth.newCases) || null;
  const removalInitial = (s.collected.mtdInitialRemoval || 0) + ((newCaseMoney && newCaseMoney.removal) || 0);

  const listCard = (items, render, empty) => (items.length === 0 ? empty : <List dense disablePadding>{items.map(render)}</List>);
  const avatar = (name, tone = "primary") => (
    <Box sx={{ width: 32, height: 32, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 12, mr: 1.5,
      bgcolor: alpha(theme.palette[tone].main, 0.12), color: dark ? theme.palette[tone].main : theme.palette[tone].dark || theme.palette[tone].main }}>
      {initials(name)}
    </Box>
  );
  const lists = [
    {
      label: "Latest payments", count: recent.length, to: "/reports?tab=payments", action: "All payments",
      body: listCard(recent, (p, i) => (
        <ListItemButton key={`${p.clientId}-${i}`} component={RouterLink} to={`/client/${p.clientId}`} sx={{ px: 2.25, borderTop: i ? 1 : 0, borderColor: "divider" }}>
          {avatar(p.clientName)}
          <ListItemText primary={p.clientName} secondary={`${p.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${p.fromMyCase ? "MyCase" : p.recordedBy}${p.initial ? " · initial" : ""}`} primaryTypographyProps={{ fontWeight: 700, noWrap: true }} />
          <Typography fontWeight={800} color="success.main">{money(p.amount, 0)}</Typography>
        </ListItemButton>
      ), <Empty title="No payments yet" />),
    },
    {
      label: "Promises today", count: promisesToday.length, to: "/promised-payments", action: "Calendar",
      body: listCard(promisesToday.slice(0, 8), (c, i) => (
        <ListItemButton key={c.id} component={RouterLink} to={`/client/${c.id}`} sx={{ px: 2.25, borderTop: i ? 1 : 0, borderColor: "divider" }}>
          {avatar(c.name || `${c.firstName || ""} ${c.lastName || ""}`, "warning")}
          <ListItemText primary={c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim()} secondary={c.paymentPromise?.notes || "—"} primaryTypographyProps={{ fontWeight: 700 }} secondaryTypographyProps={{ noWrap: true }} />
          <Typography fontWeight={800}>{money(c.paymentPromise?.amount)}</Typography>
        </ListItemButton>
      ), <Empty title="No promises due today">{counts.promisesOverdue ? `${counts.promisesOverdue} earlier promises are past their date.` : null}</Empty>),
    },
    {
      label: "Waiting for a plan", count: waiting.length, to: "/case-setup", action: "Case Setup",
      body: listCard(waiting, (r, i) => {
        const days = r.createdAt ? Math.floor((Date.now() - r.createdAt.getTime()) / 864e5) : null;
        return (
          <ListItemButton key={r.id} component={RouterLink} to={`/client/${r.id}`} sx={{ px: 2.25, borderTop: i ? 1 : 0, borderColor: "divider" }}>
            {avatar(r.name)}
            <ListItemText primary={r.name} secondary={r.caseType} primaryTypographyProps={{ fontWeight: 700, noWrap: true }} />
            {days != null && <Chip size="small" label={`${days} days`} color={days >= 7 ? "secondary" : "default"} />}
          </ListItemButton>
        );
      }, <Empty title="No one is waiting">Billing makes the welcome call within 7 days.</Empty>),
    },
  ];
  const tab = lists[listTab];

  return (
    <Box>
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        actions={
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip icon={<SyncRounded />} label={`MyCase synced ${ago(lastSync)}`} color={lastSync && Date.now() - lastSync.getTime() < 3 * 3600e3 ? "success" : "warning"} variant="outlined" />
            {source === "prepared" && (
              <Chip
                label={refreshing ? "Updating figures…" : `Figures as of ${generatedAt ? generatedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—"} · Refresh`}
                onClick={editor && !refreshing ? () => refresh().catch((e) => alert(`Could not refresh: ${e.message}`)) : undefined}
                variant="outlined"
                title="Figures are prepared on the server after each MyCase sync and RingCentral import. Refresh after pausing, skipping or changing a plan to see it here right away."
              />
            )}
          </Stack>
        }
      />
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Hero: the month's plan money, and the collection rate */}
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" }, mb: 2 }}>
        <Box
          component={RouterLink}
          to="/reports?tab=payments"
          sx={{
            position: "relative", overflow: "hidden", borderRadius: 5, pt: 2.75, px: 3, color: "#fff", textDecoration: "none", display: "block",
            background: "radial-gradient(70% 90% at 100% 0%, rgba(23,163,152,.35), transparent 60%), radial-gradient(60% 80% at 0% 100%, rgba(211,78,36,.28), transparent 60%), linear-gradient(135deg, #000C66, #00084A 60%, #0A1470)",
            boxShadow: "0 18px 40px -22px rgba(0,12,102,.7)",
          }}
        >
          <Box sx={{ position: "absolute", right: 22, top: 22, textAlign: "right", fontSize: 12, color: "rgba(255,255,255,.72)", display: { xs: "none", sm: "block" } }}>
            <Box><Box component="span" sx={{ display: "inline-block", width: 14, borderTop: "2px solid #fff", verticalAlign: "middle", mr: 0.75 }} />{monthName}</Box>
            <Box><Box component="span" sx={{ display: "inline-block", width: 14, borderTop: "2px dashed rgba(255,255,255,.6)", verticalAlign: "middle", mr: 0.75 }} />{prevMonthName}, same days</Box>
          </Box>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Typography variant="overline" sx={{ color: "rgba(255,255,255,.72)", fontWeight: 800, lineHeight: 1.6 }}>Collected this month · payment plans</Typography>
            <Help text={`Payment-plan money received this month (initial payments are left out: intake tracks those). Where it went: ${monthName}'s installments; older months clients still owed (payments pay the oldest month first); and future months paid ahead. Compared with the same day last month.${mycaseNote}`} />
          </Stack>
          <Typography sx={{ font: `700 46px ${FONT_HEADING}`, letterSpacing: "-0.02em", lineHeight: 1.15, mt: 0.5 }}>{loading ? "—" : money(s.plan.mtd)}</Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ color: "rgba(255,255,255,.78)", fontSize: 13 }}>
            {change != null && (
              <Box component="span" sx={{ fontSize: 11.5, fontWeight: 800, px: 1, py: 0.25, borderRadius: 99, bgcolor: "rgba(255,255,255,.14)", color: change >= 0 ? "#9BF2E7" : "#FFC9B6" }}>
                {change >= 0 ? "▲" : "▼"} {Math.abs(Math.round(change * 100))}%
              </Box>
            )}
            <span>vs the same day last month ({money(s.plan.lastMonthSameTime)})</span>
          </Stack>
          <Box sx={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", mt: 2.25, mb: 1, bgcolor: "rgba(255,255,255,.12)" }}>
            {parts.map((p, i) => (
              <Tooltip key={p.label} title={<><b>{money(p.value)}</b><br />{p.label}</>}>
                <Box sx={{ width: `${(p.value / partsTotal) * 100}%`, bgcolor: p.color, transformOrigin: "left", animation: `${growX} .8s cubic-bezier(.2,.8,.2,1) both`, animationDelay: `${i * 60}ms` }} />
              </Tooltip>
            ))}
          </Box>
          <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ fontSize: 12.5, color: "rgba(255,255,255,.85)" }}>
            {parts.map((p) => (
              <span key={p.label}>
                <Box component="i" sx={{ display: "inline-block", width: 9, height: 9, borderRadius: 0.75, bgcolor: p.color, mr: 0.75 }} />
                {p.label} <b style={{ color: "#fff" }}>{money(p.value)}</b>
              </span>
            ))}
          </Stack>
          <Box sx={{ mx: -3, mt: 1 }}>
            <PaceArea daily={daily} />
          </Box>
        </Box>

        <Card sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Typography variant="overline" color="text.secondary" fontWeight={800} lineHeight={1.6}>Collection rate · {monthName}</Typography>
            <Help text="This month's installments from clients who were up to date going into the month (a client who catches up during the month moves in), and how much of them has been paid, including money paid ahead in an earlier month. Reports → Payment allocation lists them client by client." />
          </Stack>
          <Stack direction="row" spacing={2.25} alignItems="center" component={RouterLink} to="/reports" sx={{ textDecoration: "none", color: "inherit" }}>
            <Ring value={s.month.collectionRate} label={pct(s.month.collectionRate)} sub={`of ${kfmt(s.month.expected || 0)}`} color={theme.palette.success.main} track={alpha(theme.palette.primary.main, 0.1)} />
            <Box>
              <Typography sx={{ font: `700 20px ${FONT_HEADING}` }}>{money(s.month.collectedOnPlan)} of {money(s.month.expected)}</Typography>
              <Typography variant="body2" color="text.secondary">collected of what clients who were up to date owe for {monthName}</Typography>
            </Box>
          </Stack>
          <Meter value={s.month.collectionRate} color={theme.palette.primary.main} />
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25, mt: "auto" }}>
            {[
              [money(s.plan.today), "Collected today"],
              [money(s.plan.week), "This week"],
            ].map(([v, l]) => (
              <Box key={l} component={RouterLink} to="/reports?tab=payments" sx={{ textDecoration: "none", color: "inherit", p: 1.25, borderRadius: 3, border: 1, borderColor: "divider", bgcolor: alpha(theme.palette.primary.main, 0.03) }}>
                <Typography sx={{ font: `700 18px ${FONT_HEADING}` }}>{v}</Typography>
                <Typography variant="caption" color="text.secondary">{l} · plan payments</Typography>
              </Box>
            ))}
          </Box>
        </Card>
      </Box>

      {/* The numbers */}
      <Box sx={{ display: "grid", gap: 1.75, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, 1fr)", lg: "repeat(5, 1fr)" }, mb: 3 }}>
        <Kpi
          i={0}
          label="Past due this month"
          value={pastThe15th ? money(s.pastDue.amount) : "Due the 15th"}
          sub={pastThe15th ? `${s.pastDue.clients.toLocaleString()} clients who were current missed ${monthName}` : `${monthName}'s installments are not due yet`}
          help={`Clients who were up to date going into ${monthName} (no older month owed) and have not paid all of its installment, due on the 15th. The same clients as Aging 0–30 and the Follow-ups list. The line: what was missed each of the last 12 months.`}
          icon={<PhoneInTalkRounded />}
          color={theme.palette.secondary.main}
          to="/follow-ups"
          loading={loading}
        >
          <Spark values={(months || []).map((m) => m.missed || 0)} color={theme.palette.secondary.main} />
        </Kpi>
        <Kpi
          i={1}
          label="Outstanding"
          value={kfmt(s.outstanding)}
          sub={`${s.outstandingClients.toLocaleString()} clients${s.outstandingPaused > 0 ? ` · incl. ${kfmt(s.outstandingPaused)} paused` : ""}`}
          help={`Everything the payment plans say should have been paid by today and has not been: every client who is not closed (paused included). Equals the Aging total. Initial payments not made are left out (${money(s.initialUnpaid.amount)}, ${s.initialUnpaid.clients} clients: see Initial payments). The bar: by age.`}
          icon={<ReceiptLongRounded />}
          color={theme.palette.primary.main}
          to="/reports?tab=aging"
          loading={loading}
        >
          <Box sx={{ display: "flex", gap: "2px", height: 7, borderRadius: 99, overflow: "hidden", mb: 0.75 }}>
            {aging.map((b, i) => <Box key={b.key} sx={{ width: `${Math.max(2, ((b.amount || 0) / (s.outstanding || 1)) * 100)}%`, bgcolor: agingCols[i] }} />)}
          </Box>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>{aging[0] ? `${kfmt(aging[0].amount)} is 0–30 days` : ""}</Typography>
        </Kpi>
        <Kpi
          i={2}
          label="Plan ended, still owes"
          value={kfmt(s.planEnded.amount)}
          sub={`${s.planEnded.clients.toLocaleString()} clients · included in Outstanding`}
          help="Every month of their plan has passed and they still owe the rest of the balance."
          icon={<EventBusyRounded />}
          color={theme.palette.error.main}
          to="/clients"
          loading={loading}
        >
          <Meter value={s.outstanding ? s.planEnded.amount / s.outstanding : 0} color={theme.palette.error.main} caption={`${pct(s.outstanding ? s.planEnded.amount / s.outstanding : null)} of Outstanding`} />
        </Kpi>
        <Kpi
          i={3}
          label="Current clients"
          value={pct(s.current.rate)}
          sub={`${s.current.clients.toLocaleString()} of ${s.clients.inPlan.toLocaleString()} on a plan owe nothing`}
          help="Clients on a plan who owe nothing as of today."
          icon={<VerifiedRounded />}
          color={theme.palette.success.main}
          to="/clients"
          loading={loading}
        >
          <Meter value={s.current.rate} color={theme.palette.success.main} caption={`${(s.clients.inPlan - s.current.clients).toLocaleString()} owe something`} />
        </Kpi>
        <Kpi
          i={4}
          label="Initial payments"
          value={money(s.collected.mtdInitial || 0)}
          sub={`this month (intake) · ${s.initialUnpaid.clients} not completed (${kfmt(s.initialUnpaid.amount)})`}
          help="Initial payments received this month on clients in Collections. They are not in Collected this month. Below: money MyCase received on new cases not set up in Collections yet (it counts here once Case Setup brings them in), and the removal-defense part, often sold outside the intake team (removal-defense cases, or a removal-defense service added to an existing client). The line: initial payments each of the last 12 months."
          icon={<AccountBalanceWalletRounded />}
          color="#C9961A"
          to="/initial-payments"
          loading={loading}
        >
          <Spark values={initialTrend} color="#C9961A" />
          {!loading && newCaseMoney && newCaseMoney.amount > 0 && (
            <Typography variant="caption" component="div" sx={{ mt: 0.75, fontWeight: 800, color: "warning.dark", lineHeight: 1.35 }}>
              + {money(newCaseMoney.amount)} on {newCaseMoney.cases} new case{newCaseMoney.cases === 1 ? "" : "s"} not set up yet
            </Typography>
          )}
          {!loading && removalInitial > 0 && (
            <Box sx={{ mt: 0.5, display: "inline-flex", alignItems: "center", gap: 0.75, px: 1, py: 0.25, borderRadius: 99, bgcolor: alpha("#7B4BC4", 0.12), color: "#7B4BC4", fontSize: 11.5, fontWeight: 800 }}>
              Removal defense {money(removalInitial)}
            </Box>
          )}
        </Kpi>
      </Box>

      {/* Needs attention */}
      {editor && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="overline" color="text.secondary" fontWeight={800}>Needs attention</Typography>
          {work.length === 0 ? (
            <Typography color="text.secondary">All caught up.</Typography>
          ) : (
            <Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
              {work.map((w) => {
                const c = toneColor[w.tone] || theme.palette.primary.main;
                return (
                  <Box key={w.label} component={RouterLink} to={w.to}
                    sx={{ display: "flex", alignItems: "center", gap: 1.25, py: 1, pl: 1, pr: 1.75, borderRadius: 3.5, bgcolor: "background.paper", border: 1, borderColor: "divider", textDecoration: "none", color: "text.primary", fontWeight: 700, fontSize: 13,
                      transition: "border-color .15s, transform .15s", "&:hover": { borderColor: c, transform: "translateY(-1px)" } }}>
                    <Box sx={{ minWidth: 34, height: 30, px: 1, borderRadius: 2.25, display: "grid", placeItems: "center", font: `700 15px ${FONT_HEADING}`, color: c, bgcolor: alpha(c, 0.12) }}>{w.n.toLocaleString()}</Box>
                    {w.label}
                  </Box>
                );
              })}
            </Stack>
          )}
        </Box>
      )}

      {/* Charts */}
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "3fr 2fr" }, mb: 2 }}>
        <Section
          title="Due vs collected, last 12 months"
          subtitle="Installments due each month from clients who were up to date, how much was paid, and the collection rate"
          action={
            <Stack direction="row" spacing={1.5} sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary", whiteSpace: "nowrap", pt: 0.5 }}>
              {[["Due", dark ? "#4A5080" : "#C9CDEB"], ["Collected", colors[0]], ["Rate", theme.palette.secondary.main]].map(([l, c]) => (
                <span key={l}><Box component="i" sx={{ display: "inline-block", width: 10, height: l === "Rate" ? 3 : 10, borderRadius: 0.75, bgcolor: c, mr: 0.75, verticalAlign: l === "Rate" ? 3 : -1 }} />{l}</span>
              ))}
            </Stack>
          }
        >
          <DueCollectedChart months={months} colors={colors} />
        </Section>
        <Section title="Aging" subtitle="Owed, by the age of the oldest unpaid installment" action={<Button size="small" component={RouterLink} to="/reports?tab=aging">Details</Button>}>
          <AgingPanel buckets={aging} total={s.receivable.amount} clients={s.receivable.clients} />
        </Section>
      </Box>

      {/* The month day by day, and the lists */}
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1fr 1.35fr" } }}>
        <Section title={`${monthName}, day by day`} subtitle="Payment-plan money received each day (hover a day for the exact amount)">
          {daily ? <MonthCalendar daily={daily} /> : <Empty title="Not prepared yet">The day-by-day figures appear after the next MyCase sync or Refresh.</Empty>}
        </Section>
        <Card sx={{ display: "flex", flexDirection: "column" }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1.5, borderBottom: 1, borderColor: "divider" }}>
            <Tabs value={listTab} onChange={(e, v) => setListTab(v)} variant="scrollable" scrollButtons={false}>
              {lists.map((l) => (
                <Tab key={l.label} sx={{ textTransform: "none", fontWeight: 800, minHeight: 52 }}
                  label={<Stack direction="row" spacing={0.75} alignItems="center"><span>{l.label}</span><Chip size="small" label={l.count} sx={{ height: 20, fontWeight: 800 }} /></Stack>} />
              ))}
            </Tabs>
            <Button size="small" component={RouterLink} to={tab.to} sx={{ flex: "none" }}>{tab.action}</Button>
          </Stack>
          <Box sx={{ flex: 1 }}>{tab.body}</Box>
        </Card>
      </Box>
      <Box sx={{ height: 24 }} />
    </Box>
  );
}
