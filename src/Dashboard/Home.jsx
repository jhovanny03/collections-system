// src/Dashboard/Home.jsx
// Home: today at a glance. What needs attention, the numbers that matter, recent money.
import React, { useEffect, useMemo, useState } from "react";
import { Box, Button, Chip, Divider, LinearProgress, List, ListItemButton, ListItemText, Typography } from "@mui/material";
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
import db from "../firebase";
import { useAuth } from "../auth/useAuth";
import { useClients } from "../data/ClientsProvider";
import { useWorkQueue } from "../data/WorkQueueProvider";
import { usePortfolio, collectionRateByMonth, money, pct, monthLabel } from "../billing/portfolio";
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
  const { clients, loading } = useClients();
  const { counts } = useWorkQueue();
  const { rows, payments, summary: s } = usePortfolio(clients);
  const lastSync = useLastSync();
  const editor = isEditorOrHigher();

  // Due vs collected each month, clients up to date going into the month (roll-over rule).
  const months = useMemo(() => (clients.length ? collectionRateByMonth(clients, 12) : []), [clients]);
  const monthName = monthLabel(s.month.key, "long").split(" ")[0];
  const pastThe15th = new Date().getDate() >= 15;
  const recent = payments.filter((p) => p.amount > 0).slice(0, 8);
  const promisesToday = counts.promisesTodayList || [];
  const waiting = useMemo(() => rows.filter((r) => r.awaitingPlan && r.status !== "closed").sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).slice(0, 6), [rows]);

  const firstName = (user?.firstName || user?.name || "").split(" ")[0];
  const mtdTrend =
    s.collected.lastMonthSameTime > 0
      ? (() => {
          const d = s.collected.mtd / s.collected.lastMonthSameTime - 1;
          return { up: d >= 0, good: d >= 0, label: `${d >= 0 ? "+" : ""}${Math.round(d * 100)}% vs last month` };
        })()
      : null;

  const work = [
    { n: counts.promisesToday, label: "Promises due today", to: "/promised-payments", icon: <EventAvailableRounded />, tone: "warn" },
    { n: counts.followUpsOpen, label: "Follow-ups this month", to: "/follow-ups", icon: <PhoneInTalkRounded />, tone: "bad" },
    { n: counts.followUpsUnlogged, label: "Paid in MyCase, not logged", to: "/follow-ups", icon: <EditNoteRounded />, tone: "default" },
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
          <Chip
            icon={<SyncRounded />}
            label={`MyCase synced ${ago(lastSync)}`}
            color={lastSync && Date.now() - lastSync.getTime() < 3 * 3600e3 ? "success" : "warning"}
            variant="outlined"
          />
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
        <StatCard label="Collected this month" value={money(s.collected.mtd)} trend={mtdTrend} sub={!mtdTrend ? `${s.collected.mtdCount} payments` : undefined} loading={loading} to="/reports?tab=payments" help="All money received this month (initial payments and installments), from Collections and MyCase." />
        <StatCard
          label="Collection rate"
          value={pct(s.month.collectionRate)}
          sub={`${money(s.month.collectedOnPlan)} of ${money(s.month.expected)} due in ${monthName}`}
          tone={s.month.collectionRate == null ? "default" : s.month.collectionRate >= 0.85 ? "good" : s.month.collectionRate >= 0.7 ? "warn" : "bad"}
          loading={loading}
          to="/reports"
          help="This month's installments from clients who were up to date going into the month (a client who catches up during the month moves in), and how much of them has been paid."
        />
        <StatCard
          label="Past due this month"
          value={pastThe15th ? money(s.pastDue.amount) : "Due the 15th"}
          sub={pastThe15th ? `${s.pastDue.clients.toLocaleString()} clients missed ${monthName}'s installment` : `${monthName}'s installments are not due yet`}
          tone="bad"
          loading={loading}
          to="/follow-ups"
          help="The unpaid part of this month's installment (due on the 15th). Earlier months owed are in Outstanding."
        />
        <StatCard
          label="Outstanding"
          value={money(s.outstanding)}
          sub={`${s.outstandingClients.toLocaleString()} clients · every installment due by today`}
          loading={loading}
          to="/reports?tab=aging"
          help="Everything the payment plans say should have been paid by today and has not been, all plans. Future installments are not counted."
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
        <StatCard label="Collected today" value={money(s.collected.today)} sub={`${money(s.collected.week)} this week`} loading={loading} to="/reports?tab=payments" />
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
                  <ListItemText primary={`${c.firstName || ""} ${c.lastName || ""}`.trim()} secondary={c.paymentPromise?.notes || "—"} primaryTypographyProps={{ fontWeight: 700 }} secondaryTypographyProps={{ noWrap: true }} />
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
