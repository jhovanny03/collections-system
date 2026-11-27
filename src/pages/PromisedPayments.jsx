// src/pages/PromisedPayments.jsx
// Promised payments: who promised to pay, when, how much, and whether they did.
//  - Current promises live on each client (clients.paymentPromise); every promise made
//    since Nov 19, 2026 is also kept in paymentPromises (checked kept/broken nightly).
//  - A promise counts as kept when the client paid at least the amount between the day it
//    was made and 3 days after the promised date (same rule as the nightly check).
// Layout ("calendar queue"): the month calendar and the numbers on top; below, the list
// (Coming up / Missed / Kept, or the day picked on the calendar) and the selected promise
// with what to do after the call (promises/PromisePanel.jsx). History keeps its table.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Box, Button, Card, Chip, InputAdornment, LinearProgress, Snackbar, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Tabs, TextField, Typography, Link as MuiLink,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import SearchRounded from "@mui/icons-material/SearchRounded";
import HistoryRounded from "@mui/icons-material/HistoryRounded";
import { Link as RouterLink } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import db from "../firebase";
import { useAuth } from "../auth/useAuth";
import { useBook } from "../data/BookProvider";
import { money, clientName } from "../billing/portfolio";
import { callLink } from "../billing/contact";
import { parseDate } from "../utils/dates";
import { FONT_HEADING } from "../theme/brand";
import { PageHeader, Empty } from "../ui/kit";
import { Ring } from "../Dashboard/homeCharts";
import PromiseCalendar, { dotColor, ymd } from "./promises/PromiseCalendar";
import PromisePanel, { GRACE_DAYS, STATUS } from "./promises/PromisePanel";
import { promiseStatus } from "./promises/promiseStatus";

const DAY = 864e5;
const keyOf = (p) => `${p.id}|${ymd(p.date)}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "Today", "Tomorrow", "in 4 days", "2 days ago". */
function relative(date, today) {
  const days = Math.round((startOfDay(date) - today) / DAY);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** A history record's status in the same words (open ones by their date). */
function historyStatus(h, today) {
  if (h.status === "kept") return "kept";
  if (h.status === "broken") return "missed";
  const d0 = startOfDay(h.date).getTime();
  if (d0 === today.getTime()) return "today";
  if (d0 > today.getTime()) return "upcoming";
  return today.getTime() - d0 <= GRACE_DAYS * DAY ? "grace" : "missed";
}

function Num({ label, value, sub, color, onClick }) {
  return (
    <Card component={onClick ? "button" : "div"} type={onClick ? "button" : undefined} onClick={onClick}
      sx={{ p: 2, textAlign: "left", font: "inherit", display: "flex", flexDirection: "column", justifyContent: "flex-start", alignItems: "flex-start", cursor: onClick ? "pointer" : "default", color: "inherit", transition: "transform .15s", "&:hover": onClick ? { transform: "translateY(-2px)" } : undefined }}>
      <Typography variant="caption" fontWeight={800} color="text.secondary">{label}</Typography>
      <Typography sx={{ font: `700 26px ${FONT_HEADING}`, color, lineHeight: 1.2 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary" fontWeight={700}>{sub}</Typography>
    </Card>
  );
}

export default function PromisedPayments() {
  const theme = useTheme();
  const { isEditorOrHigher } = useAuth();
  const editor = isEditorOrHigher();
  // Prepared rows: each client with a promise carries the payments around it (promisePayments).
  const { rows, ready } = useBook();
  const loading = !ready;
  const [view, setView] = useState("queue"); // queue | history
  const [tab, setTab] = useState("upcoming"); // upcoming | missed | kept
  const [missedWhen, setMissedWhen] = useState("month"); // month | older | all
  const [search, setSearch] = useState("");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState(() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1); });
  const [history, setHistory] = useState(null);
  const [overrides, setOverrides] = useState(() => new Map()); // promises changed here, until the figures refresh
  const [selectedKey, setSelectedKey] = useState(null);
  const [toast, setToast] = useState(null);
  const listRef = useRef(null);
  const queueRef = useRef(null);
  const today = useMemo(() => startOfDay(new Date()), []);
  const todayKey = ymd(today);

  useEffect(() => {
    getDocs(collection(db, "paymentPromises"))
      .then((s) => setHistory(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => setHistory([]));
  }, []);

  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const base = (c) => ({
    id: c.id, name: clientName(c), caseType: c.caseType && c.caseType !== "—" ? c.caseType : "", owed: c.amountDue || 0,
    myCaseLink: c.myCaseLink || "", phone: (c.phones || c.mycasePhones || [])[0] || "",
  });

  // Current promises (one per client).
  const promises = useMemo(() => {
    const out = [];
    for (const c of rows) {
      const pr = overrides.has(c.id) ? overrides.get(c.id) : c.paymentPromise;
      const date = parseDate(pr?.date);
      if (!pr || !date || !Number(pr.amount)) continue;
      if (String(c.status || "").toLowerCase() === "closed") continue;
      const st = promiseStatus(pr, c.promisePayments || c.payments, today);
      out.push({
        ...base(c), date: startOfDay(date), amount: Number(pr.amount), notes: pr.notes || "", by: pr.createdBy || "",
        made: parseDate(pr.createdAt), status: st.key, paid: st.paid, current: true,
      });
    }
    return out.sort((a, b) => a.date - b.date);
  }, [rows, today, overrides]); // eslint-disable-line react-hooks/exhaustive-deps

  // Earlier promises (history), shaped like the current ones; a current promise wins.
  const currentKeys = useMemo(() => new Set(promises.map((p) => `${p.id}|${ymd(p.date)}`)), [promises]);
  const past = useMemo(() => {
    const out = [];
    for (const h of history || []) {
      const d = parseDate(h.date);
      const c = rowById.get(h.clientId);
      if (!d || !c || currentKeys.has(`${h.clientId}|${ymd(d)}`)) continue;
      out.push({
        ...base(c), date: startOfDay(d), amount: Number(h.amount || 0), notes: h.notes || "", by: h.createdBy || "",
        made: parseDate(h.createdAt), status: historyStatus({ ...h, date: d }, today), paid: Number(h.paidAmount || 0), current: false,
      });
    }
    return out;
  }, [history, rowById, currentKeys, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const recordById = useMemo(() => {
    const m = new Map();
    for (const h of history || []) {
      const d = parseDate(h.date);
      if (!d) continue;
      const list = m.get(h.clientId) || [];
      list.push({ date: d, amount: Number(h.amount || 0), status: h.status || "open", paidAmount: h.paidAmount });
      m.set(h.clientId, list);
    }
    for (const list of m.values()) list.sort((a, b) => b.date - a.date);
    return m;
  }, [history]);

  const monthStart = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);
  const groups = useMemo(() => {
    const in7 = new Date(today.getTime() + 8 * DAY);
    const missedAll = promises.filter((p) => p.status === "missed").sort((a, b) => b.date - a.date);
    return {
      today: promises.filter((p) => p.status === "today" || p.status === "grace"),
      week: promises.filter((p) => p.status === "upcoming" && p.date < in7),
      upcoming: promises.filter((p) => ["today", "grace", "upcoming"].includes(p.status)),
      missed: { month: missedAll.filter((p) => p.date >= monthStart), older: missedAll.filter((p) => p.date < monthStart), all: missedAll },
      kept: [...promises.filter((p) => p.status === "kept"), ...past.filter((p) => p.status === "kept")].sort((a, b) => b.date - a.date),
    };
  }, [promises, past, today, monthStart]);

  // This month: kept vs missed (current promises and history), each promise once.
  const month_ = useMemo(() => {
    const due = [...promises, ...past].filter((p) => p.date >= monthStart && p.date <= today);
    const kept = due.filter((p) => p.status === "kept");
    const missed = due.filter((p) => p.status === "missed");
    return { kept: kept.length, keptAmount: kept.reduce((t, p) => t + p.amount, 0), missed: missed.length, missedAmount: missed.reduce((t, p) => t + p.amount, 0) };
  }, [promises, past, monthStart, today]);
  const decided = month_.kept + month_.missed;
  const keepRate = decided ? month_.kept / decided : null;

  // Calendar: every promise (current and earlier).
  const entries = useMemo(
    () => [...promises, ...past].map((p) => ({ key: `${p.id}|${ymd(p.date)}`, dateKey: ymd(p.date), amount: p.amount, status: p.status, name: p.name })),
    [promises, past]
  );

  const q = search.trim().toLowerCase();
  const list = useMemo(() => {
    let out;
    if (day) out = [...promises, ...past].filter((p) => ymd(p.date) === day).sort((a, b) => b.amount - a.amount);
    else if (tab === "missed") out = groups.missed[missedWhen];
    else if (tab === "kept") out = groups.kept;
    else out = groups.upcoming;
    return q ? out.filter((p) => p.name.toLowerCase().includes(q) || p.notes.toLowerCase().includes(q)) : out;
  }, [day, tab, missedWhen, groups, promises, past, q]);
  const selected = list.find((p) => keyOf(p) === selectedKey) || null;
  useEffect(() => {
    if (!loading && list.length && !list.some((p) => keyOf(p) === selectedKey)) setSelectedKey(keyOf(list[0]));
  }, [list, selectedKey, loading]);
  const index = selected ? list.indexOf(selected) : -1;
  // Open on Missed when nothing is coming up (once, after the figures load).
  const autoTab = useRef(false);
  useEffect(() => {
    if (autoTab.current || loading) return;
    autoTab.current = true;
    if (!groups.upcoming.length && groups.missed.month.length) setTab("missed");
  }, [loading, groups]);

  // ↑/↓ move through the list, C calls. Ignored while typing.
  useEffect(() => {
    if (view !== "queue") return undefined;
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.closest?.("[role=dialog],[role=listbox],[role=menu]"))) return;
      if (e.altKey || e.ctrlKey || e.metaKey || !list.length) return;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); setSelectedKey(keyOf(list[Math.min(list.length - 1, index + 1)])); }
      else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); setSelectedKey(keyOf(list[Math.max(0, index - 1)])); }
      else if ((e.key === "c" || e.key === "C") && selected?.phone) window.location.href = callLink(selected.phone);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-key="${CSS.escape(selectedKey || "")}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedKey]);

  const pickDay = (k) => {
    setDay(k);
    setView("queue");
    if (k) setTimeout(() => queueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const pickTab = (t) => {
    setTab(t);
    setDay("");
  };
  const onSaved = (id, promise) => {
    setOverrides((m) => new Map(m).set(id, promise));
    if (promise) setSelectedKey(`${id}|${promise.date}`);
  };

  const sum = (l) => l.reduce((s, p) => s + p.amount, 0);
  const dayLabel = day ? new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : "";
  const historyRows = useMemo(
    () => (history || []).map((h) => ({ ...h, d: parseDate(h.date), made: parseDate(h.createdAt) })).filter((h) => h.d).sort((a, b) => b.d - a.d),
    [history]
  );

  // List grouping for "Coming up".
  const groupOf = (p) => (day || tab !== "upcoming" ? null : p.status === "today" || p.status === "grace" ? "Today" : "Next days");

  return (
    <Box>
      <PageHeader
        title="Promised payments"
        subtitle="Pick a day on the calendar or a list, then work the promises one by one. A promise is kept when the client pays the amount by 3 days after the date."
        actions={
          <>
            <TextField size="small" placeholder="Search a client or note" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 240 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }} />
            <Button variant={view === "history" ? "contained" : "outlined"} startIcon={<HistoryRounded />} onClick={() => setView(view === "history" ? "queue" : "history")}>History</Button>
          </>
        }
      />
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Calendar and numbers */}
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.5fr) minmax(0, 1fr)" }, mb: 2 }}>
        <PromiseCalendar month={month} setMonth={setMonth} entries={entries} day={day} setDay={pickDay} todayKey={todayKey} />
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gridTemplateRows: "auto 1fr" }}>
          <Card sx={{ gridColumn: "1 / -1", p: 2.25, display: "flex", alignItems: "center", gap: 2.25 }}>
            <Ring value={keepRate || 0} size={92} stroke={10} label={keepRate == null ? "—" : `${Math.round(keepRate * 100)}%`} color={theme.palette.success.main} track={alpha(theme.palette.primary.main, 0.1)} />
            <Box>
              <Typography variant="body2" fontWeight={800} color="text.secondary">Kept this month</Typography>
              <Typography sx={{ font: `700 26px ${FONT_HEADING}` }}>{decided ? `${month_.kept} of ${decided}` : "—"}</Typography>
              <Typography variant="caption" color="text.secondary" fontWeight={700}>
                {month_.kept ? `${money(month_.keptAmount)} paid on promises` : "Promises are tracked from Nov 19, 2026"}
              </Typography>
            </Box>
          </Card>
          <Num label="Due today" value={groups.today.length} sub={groups.today.length ? `${money(sum(groups.today))} promised` : "nothing due today"} color={groups.today.length ? "#C9961A" : undefined}
            onClick={() => (groups.today.length ? pickDay(todayKey) : pickTab("upcoming"))} />
          <Num label="Next 7 days" value={groups.week.length} sub={`${money(sum(groups.week))} promised`} onClick={() => pickTab("upcoming")} />
          <Num label="Missed this month" value={groups.missed.month.length} color={groups.missed.month.length ? "error.main" : undefined}
            sub={`${money(sum(groups.missed.month))}${groups.missed.older.length ? ` · ${groups.missed.older.length} older open` : " · need a new date"}`}
            onClick={() => { pickTab("missed"); setMissedWhen("month"); }} />
        </Box>
      </Box>

      {view === "history" ? (
        <Card>
          <Typography variant="h6" sx={{ px: 2.25, pt: 2 }}>Promise history</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ px: 2.25, pb: 1 }}>Every promise made from Nov 19, 2026 on, marked kept or broken each night.</Typography>
          {history === null ? (
            <LinearProgress />
          ) : historyRows.length === 0 ? (
            <Empty title="No promise history yet" />
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
                  {historyRows
                    .filter((h) => !q || (rowById.get(h.clientId) ? clientName(rowById.get(h.clientId)) : "").toLowerCase().includes(q))
                    .map((h) => (
                      <TableRow key={h.id} hover>
                        <TableCell><MuiLink component={RouterLink} to={`/client/${h.clientId}`} fontWeight={700} underline="hover">{rowById.get(h.clientId) ? clientName(rowById.get(h.clientId)) : "Client"}</MuiLink></TableCell>
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
          )}
        </Card>
      ) : (
        <Box ref={queueRef} sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "400px minmax(0, 1fr)" }, alignItems: "start", scrollMarginTop: 80 }}>
          {/* The list */}
          <Card sx={{ position: { lg: "sticky" }, top: { lg: 80 }, display: "flex", flexDirection: "column", maxHeight: { lg: "calc(100vh - 100px)" }, overflow: "hidden" }}>
            <Tabs value={day ? false : tab} onChange={(_, v) => pickTab(v)} variant="scrollable" scrollButtons={false} sx={{ borderBottom: 1, borderColor: "divider", minHeight: 46, px: 0.5 }}>
              {[["upcoming", "Coming up", groups.upcoming.length], ["missed", "Missed", groups.missed.month.length], ["kept", "Kept", groups.kept.length]].map(([k, l, n]) => (
                <Tab key={k} value={k} sx={{ textTransform: "none", fontWeight: 800, minHeight: 46, px: 1.25, minWidth: 0 }}
                  label={<Stack direction="row" spacing={0.75} alignItems="center"><span>{l}</span><Chip size="small" label={n} color={!day && tab === k ? "primary" : "default"} sx={{ height: 19, fontSize: 11, fontWeight: 800 }} /></Stack>} />
              ))}
            </Tabs>
            {day && (
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 1.75, py: 1, borderBottom: 1, borderColor: "divider", bgcolor: alpha(theme.palette.primary.main, 0.07) }}>
                <Typography variant="body2" fontWeight={800} color="primary.main">{dayLabel} · {money(sum(list))} promised</Typography>
                <Button size="small" onClick={() => setDay("")}>Clear</Button>
              </Stack>
            )}
            {!day && tab === "missed" && (
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ p: 1.25, borderBottom: 1, borderColor: "divider" }}>
                {[["month", `This month (${groups.missed.month.length})`], ["older", `Older, never cleared (${groups.missed.older.length})`], ["all", `All (${groups.missed.all.length})`]].map(([k, l]) => (
                  <Chip key={k} size="small" label={l} onClick={() => setMissedWhen(k)} color={missedWhen === k ? "primary" : "default"} variant={missedWhen === k ? "filled" : "outlined"} sx={{ fontWeight: 800 }} />
                ))}
              </Stack>
            )}
            <Box ref={listRef} sx={{ overflowY: "auto", flex: 1, maxHeight: { xs: 420, lg: "none" } }}>
              {list.map((p, i) => {
                const k = keyOf(p);
                const on = k === selectedKey;
                const g = groupOf(p);
                const showGroup = g && (i === 0 || groupOf(list[i - 1]) !== g);
                const st = STATUS[p.status];
                return (
                  <React.Fragment key={k}>
                    {showGroup && (
                      <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ display: "block", px: 1.75, py: 0.75, letterSpacing: ".08em", textTransform: "uppercase", bgcolor: alpha(theme.palette.primary.main, 0.03), borderBottom: 1, borderColor: "divider" }}>{g}</Typography>
                    )}
                    <Box data-key={k} onClick={() => setSelectedKey(k)}
                      sx={{
                        display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto", gap: 1.25, alignItems: "center", px: 1.75, py: 1.1, cursor: "pointer", position: "relative",
                        borderBottom: 1, borderColor: "divider", bgcolor: on ? alpha(theme.palette.primary.main, 0.08) : "transparent",
                        "&:hover": { bgcolor: on ? alpha(theme.palette.primary.main, 0.1) : alpha(theme.palette.primary.main, 0.03) },
                        "&::before": on ? { content: '""', position: "absolute", left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, bgcolor: "primary.main" } : undefined,
                      }}>
                      <Box sx={{ width: 44, borderRadius: 2, overflow: "hidden", textAlign: "center", border: 1, borderColor: "divider", bgcolor: "background.paper" }}>
                        <Box sx={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".06em", color: "#fff", bgcolor: dotColor(theme, p.status), py: "1px" }}>{p.date.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</Box>
                        <Box sx={{ font: `700 17px ${FONT_HEADING}`, py: "2px" }}>{p.date.getDate()}</Box>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={800} noWrap>{p.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap component="div">
                          <Box component="span" sx={{ color: dotColor(theme, p.status), fontWeight: 800 }}>● {st.label}</Box> · {relative(p.date, today)}{p.current ? "" : " · earlier"}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: "right" }}>
                        <Typography variant="body2" fontWeight={800}>{money(p.amount)}</Typography>
                        <Typography variant="caption" color={p.paid ? "success.main" : "text.secondary"} fontWeight={700} noWrap component="div">{p.paid ? `${money(p.paid)} paid` : "nothing paid yet"}</Typography>
                      </Box>
                    </Box>
                  </React.Fragment>
                );
              })}
              {!loading && list.length === 0 && (
                <Typography color="text.secondary" sx={{ p: 4, textAlign: "center" }}>{q ? "No one matches." : day ? "No promises on this day." : "Nothing here."}</Typography>
              )}
            </Box>
            <Stack direction="row" justifyContent="space-between" sx={{ px: 1.75, py: 1, borderTop: 1, borderColor: "divider", color: "text.secondary" }}>
              <Typography variant="caption" fontWeight={700}>{index >= 0 ? `${index + 1} of ` : ""}{list.length} promises</Typography>
              <Typography variant="caption" fontWeight={700} sx={{ display: { xs: "none", sm: "block" } }}>↑ ↓ move · C call</Typography>
            </Stack>
          </Card>

          {/* The selected promise */}
          <PromisePanel p={selected} record={selected ? recordById.get(selected.id) : []} today={today} editor={editor} onSaved={onSaved} notify={setToast} />
        </Box>
      )}

      <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast(null)}>
        {toast ? <Alert severity={toast.type} variant="filled">{toast.msg}</Alert> : <span />}
      </Snackbar>
    </Box>
  );
}
