// src/Dashboard/Home.jsx
// Home: today at a glance. What needs attention, the numbers that matter, recent money.
import React, { useEffect, useMemo, useState } from "react";
import { Box, Button, Chip, Divider, LinearProgress, List, ListItemButton, ListItemText, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { BarChart } from "@mui/x-charts/BarChart";
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
import db from "../firebase";
import { useAuth } from "../auth/useAuth";
import { useBook } from "../data/BookProvider";
import { useWorkQueue } from "../data/WorkQueueProvider";
import { money, pct, monthLabel } from "../billing/portfolio";
import { chartColors } from "../theme/brand";
import { PageHeader, StatCard, Section, Tiles, Empty } from "../ui/kit";
import { parseDate } from "../utils/dates";

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

export default function Home() {
  const theme = useTheme();
  const colors = chartColors(theme.palette.mode);
  const { user, isEditorOrHigher } = useAuth();
  // Prepared figures (src/data/BookProvider.jsx): no download of every client.
  const { summaryReady, rows, recent: payments, summary: s, months, mycaseMonth, generatedAt, refresh, refreshing, source } = useBook();
  // The cards and charts need only the summary; lists built from rows fill in a moment later.
  const loading = !summaryReady;
  const { counts } = useWorkQueue();
  const lastSync = useLastSync();
  const editor = isEditorOrHigher();

  const monthName = monthLabel(s.month.key, "long").split(" ")[0];
  const pastThe15th = new Date().getDate() >= 15;
  const recent = payments.filter((p) => p.amount > 0).slice(0, 8);
  const promisesToday = counts.promisesTodayList || [];
  const waiting = useMemo(() => rows.filter((r) => r.awaitingPlan && r.status !== "closed").sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).slice(0, 6), [rows]);

  const firstName = (user?.firstName || user?.name || "").split(" ")[0];
  const mtdTrend =
    s.plan.lastMonthSameTime > 0
      ? (() => {
          const d = s.plan.mtd / s.plan.lastMonthSameTime - 1;
          return { up: d >= 0, good: d >= 0, label: `${d >= 0 ? "+" : ""}${Math.round(d * 100)}% vs last month` };
        })()
      : null;

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

  return (
    <Box>
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        actions={
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              icon={<SyncRounded />}
              label={`MyCase synced ${ago(lastSync)}`}
              color={lastSync && Date.now() - lastSync.getTime() < 3 * 3600e3 ? "success" : "warning"}
              variant="outlined"
            />
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

      {editor && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="overline" color="text.secondary">
            Needs attention
          </Typography>
          {work.length === 0 ? (
            <Typography color="text.secondary">All caught up.</Typography>
          ) : (
            <Tiles min={190} sx={{ mt: 0.5 }}>
              {work.map((w) => (
                <StatCard key={w.label} label={w.label} value={w.n.toLocaleString()} to={w.to} icon={w.icon} tone={w.tone} />
              ))}
            </Tiles>
          )}
        </Box>
      )}

      <Typography variant="overline" color="text.secondary">
        The numbers
      </Typography>
      <Tiles min={210} sx={{ mt: 0.5, mb: 3 }}>
        <StatCard
          label="Collected this month"
          value={money(s.plan.mtd)}
          trend={mtdTrend}
          sub={`${money(s.plan.thisMonth)} toward ${monthName} · ${money(s.plan.catchUp)} older months · ${money(s.plan.ahead)} paid ahead`}
          loading={loading}
          to="/reports?tab=payments"
          help={`Payment-plan money received this month (initial payments are left out: intake tracks those). Where it went: ${monthName}'s installments; older months clients still owed (they were behind; payments pay the oldest month first); and future months paid ahead. Compared with the same day last month.${
            mycaseMonth ? ` MyCase received ${money(mycaseMonth.received)} in all; ${money(mycaseMonth.notInApp)} of it (${mycaseMonth.notInAppCount} payments) is on cases not set up in Collections yet (Case Setup).` : ""
          }`}
        />
        <StatCard
          label="Collection rate"
          value={pct(s.month.collectionRate)}
          sub={`${money(s.month.collectedOnPlan)} of ${money(s.month.expected)} due in ${monthName}`}
          tone={s.month.collectionRate == null ? "default" : s.month.collectionRate >= 0.85 ? "good" : s.month.collectionRate >= 0.7 ? "warn" : "bad"}
          loading={loading}
          to="/reports"
          help="This month's installments from clients who were up to date going into the month (a client who catches up during the month moves in), and how much of them has been paid, including money paid ahead in an earlier month. Reports → Payment allocation lists them client by client."
        />
        <StatCard
          label="Past due this month"
          value={pastThe15th ? money(s.pastDue.amount) : "Due the 15th"}
          sub={pastThe15th ? `${s.pastDue.clients.toLocaleString()} clients who were current missed ${monthName}'s installment` : `${monthName}'s installments are not due yet`}
          tone="bad"
          loading={loading}
          to="/follow-ups"
          help={`Clients who were up to date going into ${monthName} (no older month owed) and have not paid all of its installment, due on the 15th. The same clients as Aging 0–30 and the Follow-ups list. Clients already behind are in Outstanding and the older aging buckets.`}
        />
        <StatCard
          label="Outstanding"
          value={money(s.outstanding)}
          sub={`${s.outstandingClients.toLocaleString()} clients${s.outstandingPaused > 0 ? ` · incl. ${money(s.outstandingPaused)} from paused clients` : ""}`}
          loading={loading}
          to="/reports?tab=aging"
          help={`Everything the payment plans say should have been paid by today and has not been: every client who is not closed (paused included). Equals the Aging total. Initial payments not made are left out (${money(s.initialUnpaid.amount)}, ${s.initialUnpaid.clients} clients: see Initial payments).`}
        />
        <StatCard
          label="Plan ended, still owes"
          value={money(s.planEnded.amount)}
          sub={`${s.planEnded.clients.toLocaleString()} clients · included in Outstanding`}
          tone="danger"
          loading={loading}
          to="/clients"
          help="Every month of their plan has passed and they still owe the rest of the balance."
        />
        <StatCard label="Current clients" value={pct(s.current.rate)} sub={`${s.current.clients.toLocaleString()} up to date`} tone="good" loading={loading} to="/clients" help="Clients on a plan who owe nothing as of today." />
        <StatCard label="Collected today" value={money(s.plan.today)} sub={`${money(s.plan.week)} this week`} loading={loading} to="/reports?tab=payments" help="Payment-plan money received today and since Monday. Initial payments are left out (intake tracks those)." />
      </Tiles>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "3fr 2fr" }, mb: 3 }}>
        <Section title="Due vs collected, last 12 months" subtitle="Installments due each month from clients who were up to date, and how much of them was paid">
          <Box sx={{ height: 300 }}>
            <BarChart
              dataset={months}
              xAxis={[{ scaleType: "band", dataKey: "label" }]}
              yAxis={[{ valueFormatter: (v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`), width: 56 }]}
              series={[
                { dataKey: "expected", label: "Due", color: theme.palette.mode === "dark" ? "#4A5080" : "#C9CDEB", valueFormatter: (v, c) => `${money(v)} · ${months[c.dataIndex]?.clients || 0} clients` },
                { dataKey: "collected", label: "Collected", color: colors[0], valueFormatter: (v, c) => `${money(v)} (${pct(months[c.dataIndex]?.rate)})` },
              ]}
              borderRadius={4}
              margin={{ left: 8, right: 8, top: 16, bottom: 8 }}
            />
          </Box>
        </Section>
        <Section title="Aging" subtitle={`${money(s.receivable.amount)} owed, by age from the 1st of each installment's month`} action={<Button size="small" component={RouterLink} to="/reports?tab=aging">Details</Button>}>
          <Box sx={{ height: 300 }}>
            <BarChart
              dataset={s.buckets}
              layout="horizontal"
              yAxis={[{ scaleType: "band", dataKey: "label", width: 86 }]}
              xAxis={[{ valueFormatter: (v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`) }]}
              series={[{ dataKey: "amount", label: "Owed", color: theme.palette.secondary.main, valueFormatter: (v, ctx) => `${money(v)} · ${s.buckets[ctx.dataIndex]?.clients} clients` }]}
              borderRadius={4}
              hideLegend
              margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
            />
          </Box>
        </Section>
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr", xl: "1fr 1fr 1fr" } }}>
        <Section title="Latest payments" action={<Button size="small" component={RouterLink} to="/reports?tab=payments">All payments</Button>} pad={false}>
          {recent.length === 0 ? (
            <Empty title="No payments yet" />
          ) : (
            <List dense disablePadding>
              {recent.map((p, i) => (
                <ListItemButton key={`${p.clientId}-${i}`} component={RouterLink} to={`/client/${p.clientId}`} sx={{ px: 2.25 }}>
                  <ListItemText
                    primary={p.clientName}
                    secondary={`${p.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${p.fromMyCase ? "MyCase" : p.recordedBy}${p.initial ? " · initial" : ""}`}
                    primaryTypographyProps={{ fontWeight: 700, noWrap: true }}
                  />
                  <Typography fontWeight={800} color="success.main">{money(p.amount, 0)}</Typography>
                </ListItemButton>
              ))}
            </List>
          )}
        </Section>

        <Section title="Promises due today" action={<Button size="small" component={RouterLink} to="/promised-payments">Calendar</Button>} pad={false}>
          {promisesToday.length === 0 ? (
            <Empty title="No promises due today">{counts.promisesOverdue ? `${counts.promisesOverdue} earlier promises are past their date.` : null}</Empty>
          ) : (
            <List dense disablePadding>
              {promisesToday.slice(0, 8).map((c) => (
                <ListItemButton key={c.id} component={RouterLink} to={`/client/${c.id}`} sx={{ px: 2.25 }}>
                  <ListItemText primary={c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim()} secondary={c.paymentPromise?.notes || "—"} primaryTypographyProps={{ fontWeight: 700 }} secondaryTypographyProps={{ noWrap: true }} />
                  <Typography fontWeight={800}>{money(c.paymentPromise?.amount)}</Typography>
                </ListItemButton>
              ))}
            </List>
          )}
        </Section>

        <Section title="Waiting for a plan" subtitle="Billing welcome call within 7 days" action={<Button size="small" component={RouterLink} to="/case-setup">Case Setup</Button>} pad={false}>
          {waiting.length === 0 ? (
            <Empty title="No one is waiting" />
          ) : (
            <List dense disablePadding>
              {waiting.map((r) => {
                const days = r.createdAt ? Math.floor((Date.now() - r.createdAt.getTime()) / 864e5) : null;
                return (
                  <ListItemButton key={r.id} component={RouterLink} to={`/client/${r.id}`} sx={{ px: 2.25 }}>
                    <ListItemText primary={r.name} secondary={r.caseType} primaryTypographyProps={{ fontWeight: 700, noWrap: true }} />
                    {days != null && <Chip size="small" label={`${days} days`} color={days >= 7 ? "secondary" : "default"} />}
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Section>
      </Box>
      <Divider sx={{ my: 3, opacity: 0 }} />
    </Box>
  );
}
