// src/ClientFollowUps/FollowUps.jsx
// Follow-ups: clients who missed the payment due on the 15th. The list builds itself on
// the 16th at 9 AM and refreshes every 2 hours until month end (functions/index.js), so
// there is nothing to generate here. The page is a call queue: the month's progress, the
// follow-ups dated this week and why clients aren't paying on top (both filter the list),
// then the list on the left and the selected client with the call log on the right
// (FollowUpPanel.jsx). Calendar and Data views are unchanged.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Box, Card, Chip, InputAdornment, LinearProgress, MenuItem, Snackbar, Stack, Tab, Tabs, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import SearchRounded from "@mui/icons-material/SearchRounded";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import db from "../firebase";
import { updateCohortItem } from "./followUps.service";
import { FOLLOW_UP_STATUS } from "./followUps.types";
import FollowUpsCalendarView from "./FollowUpsCalendarView";
import FollowUpsInsightsView from "./FollowUpsInsightsView";
import FollowUpPanel from "./FollowUpPanel";
import { PageHeader } from "../ui/kit";
import { useBook } from "../data/BookProvider";
import { liveItems } from "./liveFollowUps";
import { callLink } from "../billing/contact";
import { asDate } from "../utils/dates";
import { FONT_HEADING } from "../theme/brand";
import { grow, growX } from "../Dashboard/homeCharts";
import { initials } from "../Clients/ClientPanel";
import { NON_PAY_REASONS, STATUS, isPaid, money, reasonLabel } from "./followUps.ui";
import { BANDS } from "../billing/callPriority";

const BAND_LABEL = Object.fromEntries(BANDS.map((b) => [b.key, b.label.toLowerCase()]));

const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const monthName = (id) => {
  const [y, m] = id.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};
// Saved items: update one, or add it (a client who joined this month's live list later).
const upsertItem = (prev, row, update) =>
  (prev || []).some((it) => it.id === row.id)
    ? prev.map((it) => (it.id === row.id ? { ...it, ...update } : it))
    : [...(prev || []), { id: row.id, clientId: row.clientId || row.id, clientName: row.clientName, section: row.section, ...update }];

const SORTS = [
  { key: "smart", label: "Who to call first" },
  { key: "due", label: "Due today first" },
  { key: "likely", label: "Most likely to pay" },
  { key: "amount", label: "Biggest amount first" },
  { key: "contact", label: "Longest since last contact" },
  { key: "next", label: "Next follow-up date" },
  { key: "name", label: "Name A–Z" },
];
const CHIPS = [
  { key: "ALL", label: "Any" },
  { key: "TODAY", label: "Due today" },
  { key: FOLLOW_UP_STATUS.PENDING, label: "Not called" },
  { key: FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT, label: "No answer" },
  { key: FOLLOW_UP_STATUS.REACHED_WORKING, label: "Contacted" },
  { key: FOLLOW_UP_STATUS.PROMISE, label: "Promised" },
  { key: FOLLOW_UP_STATUS.PARTIAL_PAYMENT, label: "Partial" },
];
const amountOf = (i) => Number(i.section === "behind" ? i.pastDueTotal : i.amountDueCurrentMonth) || 0;
const dayOf = (v) => String(v || "").slice(0, 10);

function Num({ label, value, sub, color }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" fontWeight={800} color="text.secondary">{label}</Typography>
      <Typography sx={{ font: `700 24px ${FONT_HEADING}`, color, lineHeight: 1.2 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary" fontWeight={700}>{sub}</Typography>
    </Box>
  );
}

export default function FollowUps() {
  const theme = useTheme();
  // Prepared rows (phones, last call, last contact are on each row): no download of every client.
  const { rows } = useBook();
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const [months, setMonths] = useState([thisMonth()]);
  const [cohortId, setCohortId] = useState(thisMonth());
  const [items, setItems] = useState(null);
  const [cohortMeta, setCohortMeta] = useState(null);

  const [tab, setTab] = useState("current"); // current | behind | paid
  const [view, setView] = useState("list"); // list | calendar | data
  const [search, setSearch] = useState("");
  const [chip, setChip] = useState("ALL");
  const [sort, setSort] = useState("smart");
  const [dateFilter, setDateFilter] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [toast, setToast] = useState(null);
  const listRef = useRef(null);
  const today = ymd(new Date());

  // Months that have a list (newest first).
  useEffect(() => {
    getDocs(collection(db, "followUpsCohorts"))
      .then((snap) => {
        const ids = snap.docs.map((d) => d.id).filter((id) => /^\d{4}-\d{2}$/.test(id)).sort().reverse();
        if (ids.length) setMonths([...new Set([thisMonth(), ...ids])].sort().reverse());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    setItems(null);
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "followUpsCohorts", cohortId, "items"), orderBy("clientName")));
        const meta = await getDoc(doc(db, "followUpsCohorts", cohortId));
        if (!alive) return;
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data(), status: d.data().status || FOLLOW_UP_STATUS.PENDING })));
        setCohortMeta(meta.exists() ? meta.data() : null);
      } catch (e) {
        console.error("Could not load follow-ups:", e);
        if (alive) setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [cohortId]);

  // This month (from the 16th): live from the same numbers as Home; saved work kept on top.
  const live = cohortId === thisMonth() && new Date().getDate() >= 16 && rows.length > 0;
  const all = useMemo(() => (live ? liveItems(items || [], rows, byId, cohortId) : items || []), [live, items, rows, byId, cohortId]);
  const groups = useMemo(
    () => ({
      current: all.filter((i) => (i.section || "current") === "current" && !isPaid(i)),
      behind: all.filter((i) => i.section === "behind" && !isPaid(i)),
      paid: all.filter(isPaid),
    }),
    [all]
  );
  const open = useMemo(() => all.filter((i) => !isPaid(i)), [all]);
  const summary = useMemo(() => {
    const owe = groups.current;
    return {
      owe: owe.length,
      oweAmount: owe.reduce((t, i) => t + Number(i.amountDueCurrentMonth || 0), 0),
      // Called = any call after the list (logged here or from RingCentral), or a status set.
      called: owe.filter((i) => (i.attemptCount || 0) > 0 || (i.rcCalls || 0) > 0 || (i.status && i.status !== FOLLOW_UP_STATUS.PENDING)).length,
      promised: all.filter((i) => i.status === FOLLOW_UP_STATUS.PROMISE && !isPaid(i)).length,
      paid: groups.paid.filter((i) => i.resolvedReason !== "no_longer_due").length,
      paidUnlogged: groups.paid.filter((i) => i.resolvedReason === "paid_mycase").length,
      dueToday: open.filter((i) => dayOf(i.nextFollowUpAt) === today).length,
      overdue: open.filter((i) => i.nextFollowUpAt && dayOf(i.nextFollowUpAt) < today).length,
    };
  }, [groups, all, open, today]);

  // Follow-ups dated this week (today + 6 days), and why clients aren't paying.
  const week = useMemo(() => {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const key = ymd(d);
      out.push({ key, d, n: open.filter((it) => dayOf(it.nextFollowUpAt) === key).length });
    }
    return out;
  }, [open]);
  const reasons = useMemo(() => {
    const m = new Map();
    for (const i of open) {
      if (!i.nonPayReason) continue;
      const k = i.nonPayReason;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].map(([k, n]) => ({ key: k, label: NON_PAY_REASONS.find((r) => r.value === k)?.label || k, n })).sort((a, b) => b.n - a.n);
  }, [open]);
  const noReason = open.length - reasons.reduce((t, r) => t + r.n, 0);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = groups[tab].filter(
      (i) =>
        (!q || (i.clientName || "").toLowerCase().includes(q)) &&
        (chip === "ALL" || (chip === "TODAY" ? dayOf(i.nextFollowUpAt) === today : i.status === chip)) &&
        (!dateFilter || dayOf(i.nextFollowUpAt) === dateFilter) &&
        (!reasonFilter || i.nonPayReason === reasonFilter)
    );
    const time = (v) => (v ? asDate(v).getTime() || 0 : 0);
    const lastContact = (i) => {
      const lc = byId.get(i.id)?.lastContact;
      return lc?.at ? new Date(lc.at).getTime() : time(i.lastContactAt);
    };
    out.sort((a, b) => {
      if (sort === "name") return (a.clientName || "").localeCompare(b.clientName || "");
      if (sort === "next") return (time(a.nextFollowUpAt) || Infinity) - (time(b.nextFollowUpAt) || Infinity);
      if (sort === "contact") return lastContact(a) - lastContact(b);
      const score = (i) => byId.get(i.id)?.callPriority?.p ?? 0.45;
      if (sort === "likely") return score(b) - score(a) || amountOf(b) - amountOf(a);
      if (sort === "smart") {
        // Follow-ups due today (or overdue) first, then the clients most likely to pay.
        const da = dayOf(a.nextFollowUpAt), db_ = dayOf(b.nextFollowUpAt);
        const rank = (d) => (d && d <= today ? 0 : 1);
        return rank(da) - rank(db_) || score(b) - score(a) || amountOf(b) - amountOf(a);
      }
      if (sort === "due") {
        const da = dayOf(a.nextFollowUpAt), db_ = dayOf(b.nextFollowUpAt);
        const rank = (d) => (d && d <= today ? 0 : 1); // due today or overdue first
        return rank(da) - rank(db_) || amountOf(b) - amountOf(a);
      }
      return amountOf(b) - amountOf(a);
    });
    return out;
  }, [groups, tab, search, chip, dateFilter, reasonFilter, sort, today, byId]);

  // Keep a selection inside the list.
  const selected = list.find((r) => r.id === selectedId) || null;
  useEffect(() => {
    if (items !== null && list.length && !list.some((r) => r.id === selectedId)) setSelectedId(list[0].id);
  }, [list, selectedId, items]);
  const index = selected ? list.indexOf(selected) : -1;
  const move = (step) => {
    if (!list.length) return;
    setSelectedId(list[Math.max(0, Math.min(list.length - 1, (index < 0 ? 0 : index) + step))].id);
  };
  // ↑/↓ (or J/K) move through the list, C calls the selected client. Ignored while typing.
  useEffect(() => {
    if (view !== "list") return undefined;
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.closest?.("[role=dialog],[role=listbox],[role=menu]"))) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); move(-1); }
      else if (e.key === "c" || e.key === "C") {
        const r = selected && byId.get(selected.id);
        const phone = r?.phones?.[0] || r?.mycasePhones?.[0];
        if (phone) window.location.href = callLink(phone);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-id="${selectedId}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const saveNextDate = async (row, date) => {
    setItems((prev) => upsertItem(prev, row, { nextFollowUpAt: date }));
    await updateCohortItem(cohortId, row.id, { clientName: row.clientName, section: row.section, nextFollowUpAt: date || null });
  };
  const afterSave = (row, update) => setItems((prev) => upsertItem(prev, row, update));
  const goNext = () => {
    if (index >= 0 && index < list.length - 1) setSelectedId(list[index + 1].id);
  };
  const pickTab = (v) => {
    setTab(v);
    setChip("ALL");
    setSelectedId(null);
  };

  const reportAt = cohortMeta?.reportAt ? (cohortMeta.reportAt.toDate ? cohortMeta.reportAt.toDate() : asDate(cohortMeta.reportAt)) : null;
  const subtitle = reportAt
    ? `Clients who missed the payment due on the 15th. This list was built ${reportAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} and updates every 2 hours; anyone who pays moves to Paid.`
    : cohortId === thisMonth()
    ? "Clients who missed the payment due on the 15th. This month's list is built automatically on the 16th at 9 AM."
    : "Clients who missed the payment due on the 15th.";
  const weekMax = Math.max(1, ...week.map((w) => w.n));
  const reasonMax = Math.max(1, ...reasons.map((r) => r.n));
  const calledShare = summary.owe ? summary.called / summary.owe : 0;
  const promisedShare = summary.owe ? Math.min(summary.promised, summary.called) / summary.owe : 0;

  return (
    <Box>
      <PageHeader
        title="Follow-ups"
        subtitle={subtitle}
        actions={
          <>
            <TextField select size="small" value={cohortId} onChange={(e) => setCohortId(e.target.value)} sx={{ minWidth: 180 }} aria-label="Month">
              {months.map((m) => <MenuItem key={m} value={m}>{monthName(m)}</MenuItem>)}
            </TextField>
            <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
              <ToggleButton value="list">Call queue</ToggleButton>
              <ToggleButton value="calendar">Calendar</ToggleButton>
              <ToggleButton value="data">Data</ToggleButton>
            </ToggleButtonGroup>
          </>
        }
      />
      {items === null && <LinearProgress sx={{ mb: 2 }} />}

      {/* The month, this week, and why */}
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr", lg: "1.25fr 1fr 1fr" }, mb: 2 }}>
        <Card sx={{ p: 2.25, display: "flex", flexDirection: "column", gap: 1.5, gridColumn: { md: "1 / -1", lg: "auto" } }}>
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline">
              <Typography variant="body2" fontWeight={800} color="text.secondary">Called this month</Typography>
              <Typography variant="caption" fontWeight={800} color="text.secondary">{Math.round(calledShare * 100)}%</Typography>
            </Stack>
            <Typography sx={{ font: `700 26px ${FONT_HEADING}` }}>{summary.called} of {summary.owe}</Typography>
            <Box sx={{ display: "flex", height: 12, borderRadius: 99, overflow: "hidden", bgcolor: alpha(theme.palette.text.primary, 0.07), my: 0.75 }}>
              <Tooltip title={`${summary.promised} promised to pay`}><Box sx={{ width: `${promisedShare * 100}%`, bgcolor: "secondary.main", transformOrigin: "left", animation: `${growX} .8s cubic-bezier(.2,.8,.2,1) both` }} /></Tooltip>
              <Tooltip title={`${summary.called} called (logged here or in RingCentral)`}><Box sx={{ width: `${(calledShare - promisedShare) * 100}%`, bgcolor: "primary.main", transformOrigin: "left", animation: `${growX} .8s cubic-bezier(.2,.8,.2,1) both`, animationDelay: "80ms" }} /></Tooltip>
            </Box>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>{summary.owe - summary.called ? `${summary.owe - summary.called} not called yet` : "Everyone called"} · {summary.promised} promised</Typography>
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5, pt: 1.5, borderTop: 1, borderColor: "divider", mt: "auto" }}>
            <Num label="Still owe" value={money(summary.oweAmount)} sub={`${summary.owe} were current`} color="secondary.main" />
            <Num label="Due today" value={summary.dueToday} sub={summary.overdue ? `${summary.overdue} past their date` : "follow-ups dated today"} />
            <Num label="Paid since the list" value={summary.paid} sub={summary.paidUnlogged ? `${summary.paidUnlogged} still to type in` : "moved to Paid"} color="success.main" />
          </Box>
        </Card>

        <Card sx={{ p: 2.25 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1.5 }}>
            <Typography variant="body2" fontWeight={800} color="text.secondary">Follow-ups dated this week</Typography>
            {dateFilter && <Chip size="small" label="Clear" onClick={() => setDateFilter("")} />}
          </Stack>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.75, alignItems: "end", height: 140 }}>
            {week.map((w, i) => {
              const on = dateFilter === w.key;
              const isToday = i === 0;
              return (
                <Tooltip key={w.key} title={w.n ? `Show the ${w.n} follow-up${w.n === 1 ? "" : "s"} dated ${w.d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}` : "No follow-ups dated this day"}>
                  <Stack component="button" type="button" onClick={() => { setDateFilter(on ? "" : w.key); setView("list"); }} alignItems="center" justifyContent="flex-end" spacing={0.5}
                    sx={{ height: "100%", border: 0, bgcolor: "transparent", p: 0, cursor: "pointer", font: "inherit", "&:hover .bar": { filter: "brightness(1.08)" } }}>
                    <Typography variant="caption" fontWeight={800} color="text.secondary">{w.n}</Typography>
                    <Box className="bar" sx={{
                      width: "100%", height: `${Math.max(6, (w.n / weekMax) * 72)}%`, borderRadius: "8px 8px 3px 3px",
                      bgcolor: isToday ? "secondary.main" : alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.45 : 0.2),
                      outline: on ? `2px solid ${theme.palette.primary.main}` : "none", outlineOffset: 2,
                      transformOrigin: "bottom", animation: `${grow} .6s cubic-bezier(.2,.8,.2,1) both`, animationDelay: `${i * 40}ms`,
                    }} />
                    <Typography variant="caption" fontWeight={800} color={isToday ? "secondary.main" : "text.secondary"} sx={{ lineHeight: 1.15, textAlign: "center" }}>
                      {w.d.toLocaleDateString("en-US", { weekday: "short" })}<br />{w.d.getDate()}
                    </Typography>
                  </Stack>
                </Tooltip>
              );
            })}
          </Box>
          <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: "block", mt: 1 }}>Click a day to see who to call.</Typography>
        </Card>

        <Card sx={{ p: 2.25 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1.25 }}>
            <Typography variant="body2" fontWeight={800} color="text.secondary">Why clients aren't paying</Typography>
            {reasonFilter && <Chip size="small" label="Clear" onClick={() => setReasonFilter("")} />}
          </Stack>
          {reasons.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No reasons logged yet. Pick one when you log a call.</Typography>
          ) : (
            <Stack spacing={1}>
              {reasons.slice(0, 5).map((r, i) => {
                const on = reasonFilter === r.key;
                return (
                  <Box key={r.key} component="button" type="button" onClick={() => { setReasonFilter(on ? "" : r.key); setView("list"); }}
                    sx={{ border: 0, bgcolor: on ? alpha(theme.palette.primary.main, 0.08) : "transparent", borderRadius: 1.5, p: 0.5, mx: -0.5, cursor: "pointer", font: "inherit", textAlign: "left", "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.05) } }}>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                      <Typography variant="body2" fontWeight={on ? 800 : 600}>{r.label}</Typography>
                      <Typography variant="body2" fontWeight={800}>{r.n}</Typography>
                    </Stack>
                    <Box sx={{ height: 6, borderRadius: 99, bgcolor: alpha(theme.palette.text.primary, 0.07), overflow: "hidden" }}>
                      <Box sx={{ height: "100%", width: `${(r.n / reasonMax) * 100}%`, borderRadius: 99, bgcolor: "primary.main", transformOrigin: "left", animation: `${growX} .8s cubic-bezier(.2,.8,.2,1) both`, animationDelay: `${i * 60}ms` }} />
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          )}
          <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: "block", mt: 1 }}>
            {noReason > 0 ? `${noReason} still owing with no reason logged · ` : ""}Click a reason to filter.
          </Typography>
        </Card>
      </Box>

      {view === "calendar" && (
        <FollowUpsCalendarView
          items={all}
          onSelectClient={(row) => {
            setTab(isPaid(row) ? "paid" : row.section || "current");
            setChip("ALL");
            setView("list");
            setSelectedId(row.id);
          }}
          onSelectDate={(d) => {
            setView("list");
            setDateFilter(d);
          }}
        />
      )}
      {view === "data" && <FollowUpsInsightsView items={all} />}

      {view === "list" && (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "400px minmax(0, 1fr)" }, alignItems: "start" }}>
          {/* The list */}
          <Card sx={{ position: { lg: "sticky" }, top: { lg: 80 }, display: "flex", flexDirection: "column", maxHeight: { lg: "calc(100vh - 100px)" }, overflow: "hidden" }}>
            <Tabs value={tab} onChange={(_, v) => pickTab(v)} variant="scrollable" scrollButtons={false} sx={{ borderBottom: 1, borderColor: "divider", minHeight: 46, px: 0.5 }}>
              {[["current", "Were current"], ["behind", "Already behind"], ["paid", "Paid"]].map(([k, l]) => (
                <Tab key={k} value={k} sx={{ textTransform: "none", fontWeight: 800, minHeight: 46, px: 1.25, minWidth: 0, whiteSpace: "nowrap" }}
                  label={<Stack direction="row" spacing={0.75} alignItems="center"><span>{l}</span><Chip size="small" label={groups[k].length} color={tab === k ? "primary" : "default"} sx={{ height: 19, fontSize: 11, fontWeight: 800 }} /></Stack>} />
              ))}
            </Tabs>
            {tab !== "paid" && (
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ p: 1.25, borderBottom: 1, borderColor: "divider" }}>
                {CHIPS.map((c) => (
                  <Chip key={c.key} size="small" label={c.label} onClick={() => setChip(c.key)} color={chip === c.key ? "primary" : "default"} variant={chip === c.key ? "filled" : "outlined"} sx={{ fontWeight: 800 }} />
                ))}
              </Stack>
            )}
            <Stack direction="row" spacing={1} sx={{ p: 1.25, borderBottom: 1, borderColor: "divider" }}>
              <TextField size="small" placeholder="Search a client" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1 }}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }} />
              <TextField size="small" select value={sort} onChange={(e) => setSort(e.target.value)} sx={{ width: 160 }} SelectProps={{ renderValue: (v) => SORTS.find((s) => s.key === v)?.label }}>
                {SORTS.map((s) => <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>)}
              </TextField>
            </Stack>
            {(dateFilter || reasonFilter) && (
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ px: 1.25, py: 1, borderBottom: 1, borderColor: "divider" }}>
                {dateFilter && <Chip size="small" color="primary" label={`Follow-up on ${new Date(`${dateFilter}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`} onDelete={() => setDateFilter("")} />}
                {reasonFilter && <Chip size="small" color="primary" label={NON_PAY_REASONS.find((r) => r.value === reasonFilter)?.label || reasonFilter} onDelete={() => setReasonFilter("")} />}
              </Stack>
            )}
            <Box ref={listRef} sx={{ overflowY: "auto", flex: 1, maxHeight: { xs: 420, lg: "none" } }}>
              {list.map((r) => {
                const on = r.id === selectedId;
                const st = STATUS[r.status] || STATUS[FOLLOW_UP_STATUS.PENDING];
                const dueDay = dayOf(r.nextFollowUpAt);
                const row = byId.get(r.id);
                const lcAt = row?.lastContact?.at ? new Date(row.lastContact.at) : null;
                const days = lcAt ? Math.max(0, Math.floor((Date.now() - lcAt.getTime()) / 864e5)) : null;
                const calls = (r.attemptCount || 0) + (r.rcCalls || 0);
                const stColor = { default: "text.secondary", warning: "warning.main", info: "info.main", primary: "primary.main", secondary: "secondary.main", success: "success.main" }[st.color];
                return (
                  <Box key={r.id} data-id={r.id} onClick={() => setSelectedId(r.id)}
                    sx={{
                      display: "grid", gridTemplateColumns: "34px minmax(0,1fr) auto", gap: 1.25, alignItems: "center", px: 1.75, py: 1.25, cursor: "pointer", position: "relative",
                      borderBottom: 1, borderColor: "divider", bgcolor: on ? alpha(theme.palette.primary.main, 0.08) : "transparent",
                      "&:hover": { bgcolor: on ? alpha(theme.palette.primary.main, 0.1) : alpha(theme.palette.primary.main, 0.03) },
                      "&::before": on ? { content: '""', position: "absolute", left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, bgcolor: "primary.main" } : undefined,
                    }}>
                    <Box sx={{ width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 12, bgcolor: alpha(theme.palette.primary.main, 0.1), color: "primary.main" }}>{initials(r.clientName)}</Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={800} noWrap>{r.clientName}</Typography>
                        {!isPaid(r) && dueDay && dueDay <= today && (
                          <Box component="span" sx={{ flex: "none", fontSize: 10.5, fontWeight: 800, color: "#fff", bgcolor: dueDay < today ? "error.main" : "secondary.main", px: 0.75, borderRadius: 99 }}>{dueDay < today ? "overdue" : "today"}</Box>
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary" noWrap component="div">
                        {isPaid(r) ? (
                          <Box component="span" sx={{ color: "success.main", fontWeight: 800 }}>● {r.resolvedReason === "no_longer_due" ? "No longer due" : "Paid"}</Box>
                        ) : (
                          <Box component="span" sx={{ color: stColor, fontWeight: 800 }}>● {st.label}</Box>
                        )}
                        {calls ? ` · ${calls} call${calls === 1 ? "" : "s"}` : ""}
                        {!isPaid(r) && row?.callPriority ? ` · ${BAND_LABEL[row.callPriority.band]}` : ""}
                        {reasonLabel(r) ? ` · ${reasonLabel(r)}` : ""}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: "right" }}>
                      <Typography variant="body2" fontWeight={800} color={isPaid(r) ? "success.main" : "secondary.main"}>{money(amountOf(r))}</Typography>
                      <Typography variant="caption" color={days == null || days >= 30 ? "error.main" : "text.secondary"} fontWeight={700} noWrap component="div">
                        {days == null ? "never contacted" : days === 0 ? "contacted today" : `${days}d since contact`}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
              {items !== null && list.length === 0 && (
                <Typography color="text.secondary" sx={{ p: 4, textAlign: "center" }}>
                  {search || chip !== "ALL" || dateFilter || reasonFilter ? "No one matches. Clear the search or filters." : tab === "paid" ? "No one has paid yet." : "No one here."}
                </Typography>
              )}
            </Box>
            <Stack direction="row" justifyContent="space-between" sx={{ px: 1.75, py: 1, borderTop: 1, borderColor: "divider", color: "text.secondary" }}>
              <Typography variant="caption" fontWeight={700}>{index >= 0 ? `${index + 1} of ` : ""}{list.length} clients</Typography>
              <Typography variant="caption" fontWeight={700} sx={{ display: { xs: "none", sm: "block" } }}>↑ ↓ move · C call · 1–5 outcome</Typography>
            </Stack>
          </Card>

          {/* The selected client and the call log */}
          <FollowUpPanel
            row={selected}
            client={selected ? byId.get(selected.id) : null}
            cohortId={cohortId}
            onSaved={afterSave}
            onNextDate={saveNextDate}
            onNext={goNext}
            notify={setToast}
          />
        </Box>
      )}

      <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast(null)}>
        {toast ? <Alert severity={toast.type} variant="filled">{toast.msg}</Alert> : <span />}
      </Snackbar>
    </Box>
  );
}
