// src/pages/PromisedPayments.jsx
// Promised payments: who promised to pay, when, how much, and whether they did.
//  - Current promises live on each client (clients.paymentPromise); every promise made
//    since Nov 19, 2026 is also kept in paymentPromises (checked kept/broken nightly).
//  - A promise counts as kept when the client paid at least the amount between the day it
//    was made and 3 days after the promised date (same rule as the nightly check).
import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Button, Card, Chip, InputAdornment, LinearProgress, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Tabs, TextField, Tooltip, Typography, Link as MuiLink,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import SearchRounded from "@mui/icons-material/SearchRounded";
import PhoneInTalkRounded from "@mui/icons-material/PhoneInTalkRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import db from "../firebase";
import { useClients } from "../data/ClientsProvider";
import { usePortfolio, money, clientName } from "../billing/portfolio";
import { parseDate } from "../utils/dates";
import { PageHeader, StatCard, Tiles, Empty } from "../ui/kit";

const GRACE_DAYS = 3;
const DAY = 864e5;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "Today", "Tomorrow", "in 4 days", "2 days ago". */
function relative(date, today) {
  const days = Math.round((startOfDay(date) - today) / DAY);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

const STATUS = {
  today: { label: "Due today", color: "warning" },
  grace: { label: "Due, waiting", color: "warning" },
  upcoming: { label: "Upcoming", color: "info" },
  missed: { label: "Missed", color: "error" },
  kept: { label: "Kept", color: "success" },
};

/** Status of a current promise, from the client's payments. */
function promiseStatus(promise, payments, today) {
  const due = parseDate(promise.date);
  if (!due) return { key: "upcoming", paid: 0 };
  const made = parseDate(promise.createdAt) || new Date(due.getTime() - 30 * DAY);
  const graceEnd = new Date(startOfDay(due).getTime() + (GRACE_DAYS + 1) * DAY - 1);
  const paid = (payments || []).reduce((s, p) => {
    const d = parseDate(p.date);
    return d && Number(p.amount) > 0 && d >= startOfDay(made) && d <= graceEnd ? s + Number(p.amount) : s;
  }, 0);
  const amount = Number(promise.amount || 0);
  if (amount > 0 && paid >= amount - 0.005) return { key: "kept", paid };
  const d0 = startOfDay(due).getTime();
  if (d0 === today.getTime()) return { key: "today", paid };
  if (d0 > today.getTime()) return { key: "upcoming", paid };
  if (today.getTime() <= graceEnd.getTime()) return { key: "grace", paid };
  return { key: "missed", paid };
}

export default function PromisedPayments() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { clients, loading } = useClients();
  const { rows } = usePortfolio(clients);
  const [tab, setTab] = useState("upcoming");
  const [search, setSearch] = useState("");
  const [missedWhen, setMissedWhen] = useState("month"); // month | older | all
  const [history, setHistory] = useState(null);
  const today = useMemo(() => startOfDay(new Date()), []);

  useEffect(() => {
    getDocs(collection(db, "paymentPromises"))
      .then((s) => setHistory(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => setHistory([]));
  }, []);

  const owedById = useMemo(() => new Map(rows.map((r) => [r.id, r.amountDue])), [rows]);

  const promises = useMemo(() => {
    const out = [];
    for (const c of clients) {
      const pr = c.paymentPromise;
      const date = parseDate(pr?.date);
      if (!pr || !date || !Number(pr.amount)) continue;
      if (String(c.status || "").toLowerCase() === "closed") continue;
      const st = promiseStatus(pr, c.payments, today);
      out.push({
        id: c.id,
        name: clientName(c),
        caseType: c.caseType || "",
        date,
        amount: Number(pr.amount),
        notes: pr.notes || "",
        by: pr.createdBy || "",
        status: st.key,
        paid: st.paid,
        owed: owedById.get(c.id) || 0,
        myCaseLink: c.myCaseLink || "",
      });
    }
    return out.sort((a, b) => a.date - b.date);
  }, [clients, today, owedById]);

  const groups = useMemo(() => {
    const in7 = new Date(today.getTime() + 8 * DAY);
    return {
      today: promises.filter((p) => p.status === "today" || p.status === "grace"),
      week: promises.filter((p) => p.status === "upcoming" && p.date < in7),
      upcoming: promises.filter((p) => ["today", "grace", "upcoming"].includes(p.status)),
      missed: promises.filter((p) => p.status === "missed").sort((a, b) => b.date - a.date),
      kept: promises.filter((p) => p.status === "kept"),
    };
  }, [promises, today]);

  const monthStart = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);

  // Promises due this month that were kept: current ones (from payments) plus the history
  // records, each promise counted once.
  const keptThisMonth = useMemo(() => {
    const seen = new Set();
    let n = 0;
    let amount = 0;
    for (const p of groups.kept) {
      if (p.date < monthStart) continue;
      seen.add(`${p.id}|${ymd(p.date)}`);
      n++;
      amount += p.amount;
    }
    for (const h of history || []) {
      const d = parseDate(h.date);
      if (h.status !== "kept" || !d || d < monthStart || seen.has(`${h.clientId}|${ymd(d)}`)) continue;
      n++;
      amount += Number(h.paidAmount || h.amount || 0);
    }
    return { n, amount };
  }, [history, groups.kept, monthStart]);

  // Missed this month vs older ones nobody cleared.
  const missed = useMemo(() => {
    const month = groups.missed.filter((p) => p.date >= monthStart);
    const older = groups.missed.filter((p) => p.date < monthStart);
    return { month, older, all: groups.missed };
  }, [groups.missed, monthStart]);

  const sum = (l) => l.reduce((s, p) => s + p.amount, 0);
  const q = search.trim().toLowerCase();
  const filter = (l) => (q ? l.filter((p) => p.name.toLowerCase().includes(q) || p.notes.toLowerCase().includes(q)) : l);

  const events = useMemo(
    () =>
      promises.map((p) => ({
        id: p.id,
        title: `${money(p.amount)} · ${p.name}`,
        start: ymd(p.date),
        allDay: true,
        backgroundColor: theme.palette[STATUS[p.status].color].main,
        borderColor: theme.palette[STATUS[p.status].color].main,
        textColor: "#fff",
      })),
    [promises, theme]
  );

  const table = (list, { showStatus = true } = {}) =>
    list.length === 0 ? (
      <Empty title={q ? "No one matches" : "Nothing here"} />
    ) : (
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Client</TableCell>
              <TableCell>Promised for</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell align="right">Paid since</TableCell>
              <TableCell align="right">Owes now</TableCell>
              <TableCell>Notes</TableCell>
              {showStatus && <TableCell>Status</TableCell>}
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map((p) => (
              <TableRow key={p.id} hover>
                <TableCell sx={{ maxWidth: 240 }}>
                  <MuiLink component={RouterLink} to={`/client/${p.id}`} fontWeight={700} underline="hover">{p.name}</MuiLink>
                  {p.caseType && <Typography variant="caption" color="text.secondary" display="block">{p.caseType}</Typography>}
                </TableCell>
                <TableCell>
                  <Typography fontWeight={700} fontSize={14}>{p.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</Typography>
                  <Typography variant="caption" color={p.status === "missed" ? "error.main" : "text.secondary"}>{relative(p.date, today)}</Typography>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800 }}>{money(p.amount)}</TableCell>
                <TableCell align="right" sx={{ color: p.paid ? "success.main" : "text.disabled", fontWeight: p.paid ? 700 : 400 }}>{p.paid ? money(p.paid) : "—"}</TableCell>
                <TableCell align="right">{p.owed ? money(p.owed) : "—"}</TableCell>
                <TableCell sx={{ maxWidth: 280 }}>
                  <Tooltip title={p.notes || ""}>
                    <Typography variant="body2" noWrap color={p.notes ? "text.primary" : "text.disabled"}>{p.notes || "—"}</Typography>
                  </Tooltip>
                  {p.by && <Typography variant="caption" color="text.secondary">by {p.by}</Typography>}
                </TableCell>
                {showStatus && (
                  <TableCell>
                    <Chip size="small" label={STATUS[p.status].label} color={STATUS[p.status].color} variant={p.status === "upcoming" ? "outlined" : "filled"} />
                  </TableCell>
                )}
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  <Tooltip title="Log a call or note">
                    <Button size="small" startIcon={<PhoneInTalkRounded fontSize="small" />} component={RouterLink} to={`/client/${p.id}?tab=notes`}>Log</Button>
                  </Tooltip>
                  {p.myCaseLink && (
                    <Tooltip title="Open in MyCase">
                      <Button size="small" href={p.myCaseLink} target="_blank" rel="noopener noreferrer" sx={{ minWidth: 0 }}><OpenInNewRounded fontSize="small" /></Button>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );

  const historyRows = useMemo(
    () =>
      (history || [])
        .map((h) => ({ ...h, d: parseDate(h.date), made: parseDate(h.createdAt) }))
        .filter((h) => h.d)
        .sort((a, b) => b.d - a.d),
    [history]
  );
  const nameById = useMemo(() => new Map(clients.map((c) => [c.id, clientName(c)])), [clients]);

  return (
    <Box>
      <PageHeader title="Promised payments" subtitle="Clients who promised to pay: what is due today, what is coming, and who did not keep their word." />
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Tiles min={200} sx={{ mb: 2.5 }}>
        <StatCard label="Due today" value={groups.today.length} sub={groups.today.length ? `${money(sum(groups.today))} promised` : "Nothing due today"} tone={groups.today.length ? "warn" : "good"} onClick={() => setTab("upcoming")} />
        <StatCard label="Next 7 days" value={groups.week.length} sub={`${money(sum(groups.week))} promised`} onClick={() => setTab("upcoming")} />
        <StatCard
          label="Missed this month"
          value={missed.month.length}
          sub={`${money(sum(missed.month))} not paid${missed.older.length ? ` · ${missed.older.length} older still open` : ""}`}
          tone={missed.month.length ? "bad" : "good"}
          onClick={() => { setTab("missed"); setMissedWhen("month"); }}
          help="Promises for this month whose date (plus 3 days) has passed without the full amount paid. Older missed promises that were never cleared are listed under Missed → Older."
        />
        <StatCard label="Kept this month" value={keptThisMonth.n} sub={keptThisMonth.n ? `${money(keptThisMonth.amount)} paid on promises` : "Tracked from Nov 19, 2026"} tone="good" onClick={() => setTab("history")} />
      </Tiles>

      <Card>
        <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} sx={{ px: 1, borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ flex: 1 }}>
            <Tab value="upcoming" label={`Coming up (${groups.upcoming.length})`} />
            <Tab value="missed" label={`Missed (${missed.month.length})`} />
            <Tab value="calendar" label="Calendar" />
            <Tab value="history" label="History" />
          </Tabs>
          {tab !== "calendar" && (
            <TextField
              placeholder="Search a client or note"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ m: 1, minWidth: 240 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }}
            />
          )}
        </Stack>

        {tab === "upcoming" && table(filter(groups.upcoming))}
        {tab === "missed" && (
          <>
            <Stack direction="row" spacing={1} sx={{ px: 2, pt: 1.5 }} flexWrap="wrap" useFlexGap>
              {[
                ["month", `This month (${missed.month.length})`],
                ["older", `Older, never cleared (${missed.older.length})`],
                ["all", `All (${missed.all.length})`],
              ].map(([k, label]) => (
                <Chip key={k} label={label} onClick={() => setMissedWhen(k)} color={missedWhen === k ? "primary" : "default"} variant={missedWhen === k ? "filled" : "outlined"} />
              ))}
            </Stack>
            {missedWhen === "older" && (
              <Typography variant="body2" color="text.secondary" sx={{ px: 2, pt: 1 }}>
                Promises from earlier months that were never paid or removed. Call the client and either record a new promise or remove the old one on their Notes &amp; promises tab.
              </Typography>
            )}
            {table(filter(missed[missedWhen]), { showStatus: false })}
          </>
        )}
        {tab === "calendar" && (
          <Box
            sx={{
              p: 2,
              "& .fc": { fontFamily: theme.typography.fontFamily },
              "& .fc .fc-toolbar-title": { fontFamily: theme.typography.h5.fontFamily, fontSize: 20 },
              "& .fc .fc-button-primary": { bgcolor: "primary.main", borderColor: "primary.main", textTransform: "none" },
              "& .fc .fc-daygrid-day.fc-day-today": { bgcolor: alpha(theme.palette.secondary.main, 0.08) },
              "& .fc-event": { cursor: "pointer", fontSize: 12, px: 0.5 },
              "& .fc-theme-standard td, & .fc-theme-standard th, & .fc-theme-standard .fc-scrollgrid": { borderColor: "divider" },
            }}
          >
            <FullCalendar
              plugins={[dayGridPlugin]}
              initialView="dayGridMonth"
              height="auto"
              events={events}
              dayMaxEvents={4}
              headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
              eventClick={(info) => navigate(`/client/${info.event.id}`)}
            />
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
              {["today", "upcoming", "missed", "kept"].map((k) => <Chip key={k} size="small" label={STATUS[k].label} color={STATUS[k].color} />)}
            </Stack>
          </Box>
        )}
        {tab === "history" &&
          (history === null ? (
            <LinearProgress />
          ) : historyRows.length === 0 ? (
            <Empty title="No promise history yet">Every promise made from Nov 19, 2026 on is kept here and marked kept or broken each night.</Empty>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Client</TableCell>
                    <TableCell>Promised for</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell align="right">Paid</TableCell>
                    <TableCell>Made by</TableCell>
                    <TableCell>Result</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historyRows.filter((h) => !q || (nameById.get(h.clientId) || "").toLowerCase().includes(q)).map((h) => (
                    <TableRow key={h.id} hover>
                      <TableCell><MuiLink component={RouterLink} to={`/client/${h.clientId}`} fontWeight={700} underline="hover">{nameById.get(h.clientId) || "Client"}</MuiLink></TableCell>
                      <TableCell>{h.d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</TableCell>
                      <TableCell align="right">{money(h.amount)}</TableCell>
                      <TableCell align="right">{h.paidAmount != null ? money(h.paidAmount) : "—"}</TableCell>
                      <TableCell>{h.createdBy || "—"}{h.made ? <Typography variant="caption" color="text.secondary" display="block">{h.made.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Typography> : null}</TableCell>
                      <TableCell>
                        <Chip size="small" label={h.status === "kept" ? "Kept" : h.status === "broken" ? "Broken" : "Open"} color={h.status === "kept" ? "success" : h.status === "broken" ? "error" : "default"} variant={h.status === "open" ? "outlined" : "filled"} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ))}
      </Card>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
        A promise is kept when the client pays at least the promised amount between the day it was made and {GRACE_DAYS} days after the promised date. Add or change a promise from the client's Notes &amp; promises tab.
      </Typography>
    </Box>
  );
}
