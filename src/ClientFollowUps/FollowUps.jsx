// src/ClientFollowUps/FollowUps.jsx
// Follow-ups: clients who missed the payment due on the 15th. The list builds itself on
// the 16th at 9 AM and refreshes every 2 hours until month end (functions/index.js), so
// there is nothing to generate here: pick a client, call, log what happened.
import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, LinearProgress,
  MenuItem, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, Tabs, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography, Link as MuiLink,
} from "@mui/material";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import { Link as RouterLink } from "react-router-dom";
import { arrayUnion, collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import db from "../firebase";
import { getActor } from "../auth/actor";
import { asDate } from "../utils/dates";
import { updateCohortItem, updateClientCommunication as updateClientCommunicationService } from "./followUps.service";
import { FOLLOW_UP_STATUS } from "./followUps.types";
import FollowUpsCalendarView from "./FollowUpsCalendarView";
import FollowUpsInsightsView from "./FollowUpsInsightsView";
import { savePaymentPromise } from "../ClientDashboard/PaymentPromise";
import { PageHeader, StatCard, Tiles, Empty } from "../ui/kit";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const shortDate = (v) => {
  if (!v) return "";
  const d = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : asDate(v);
  return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const monthName = (id) => {
  const [y, m] = id.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const isPaid = (row) => !!row.resolvedReason;

// Plain words for the stored statuses.
const STATUS = {
  [FOLLOW_UP_STATUS.PENDING]: { label: "Not called", color: "default" },
  [FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT]: { label: "No answer", color: "warning" },
  [FOLLOW_UP_STATUS.REACHED_WORKING]: { label: "Talking", color: "info" },
  [FOLLOW_UP_STATUS.PROMISE]: { label: "Promised", color: "primary" },
  [FOLLOW_UP_STATUS.PARTIAL_PAYMENT]: { label: "Partial", color: "secondary" },
  [FOLLOW_UP_STATUS.RESOLVED]: { label: "Resolved", color: "success" },
};

const NON_PAY_REASONS = [
  { value: "CASE_TAKING_TOO_LONG", label: "Case taking too long" },
  { value: "CARD_ISSUES", label: "Card / payment method issues" },
  { value: "FINANCIAL_DIFFICULTIES", label: "Financial difficulties" },
  { value: "NO_EAD_YET", label: "No EAD yet" },
  { value: "NO_RECEIPT_NOTICE", label: "No receipt notice received" },
  { value: "NOT_RECEIVING_UPDATES", label: "Not receiving case updates" },
  { value: "CLIENT_UNRESPONSIVE", label: "Client unresponsive" },
  { value: "OTHER", label: "Other" },
];
const reasonLabel = (row) => (row.nonPayReason === "OTHER" ? row.nonPayReasonCustom || "Other" : NON_PAY_REASONS.find((r) => r.value === row.nonPayReason)?.label || "");

const SORTS = [
  { key: "amount", label: "Biggest amount first" },
  { key: "name", label: "Name A–Z" },
  { key: "next", label: "Next follow-up date" },
  { key: "contact", label: "Longest since last contact" },
];

/** The one line under a client's name: what matters most about them right now. */
function rowNote(row) {
  if (row.resolvedReason === "paid") return { text: `Paid ${shortDate(row.paidDate)}`, color: "success.main" };
  if (row.resolvedReason === "paid_mycase") return { text: `Paid in MyCase ${shortDate(row.paidDate)} — type it into Collections`, color: "info.main" };
  if (row.resolvedReason === "no_longer_due") return { text: "No longer due (closed, paused or plan changed)", color: "text.secondary" };
  const parts = [];
  if (row.planEnded) parts.push("Plan ended, still owes");
  else if (row.section === "behind") parts.push(`${row.monthsBehind} months behind`);
  if (row.mycaseUnlogged > 0) parts.push(`${money(row.mycaseUnlogged)} paid in MyCase, not typed in`);
  if (reasonLabel(row)) parts.push(reasonLabel(row));
  return parts.length ? { text: parts.join(" · "), color: row.planEnded ? "error.main" : "text.secondary" } : null;
}

export default function FollowUps() {
  const [months, setMonths] = useState([thisMonth()]);
  const [cohortId, setCohortId] = useState(thisMonth());
  const [items, setItems] = useState(null);
  const [cohortMeta, setCohortMeta] = useState(null);

  const [tab, setTab] = useState("current"); // current | behind | paid
  const [view, setView] = useState("list"); // list | calendar | data
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sort, setSort] = useState("amount");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Log dialog
  const [activeRow, setActiveRow] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [selectedOutcome, setSelectedOutcome] = useState(FOLLOW_UP_STATUS.PENDING);
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Promise dialog
  const [promiseFor, setPromiseFor] = useState(null);
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [promiseNotes, setPromiseNotes] = useState("");

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

  useEffect(() => setPage(0), [search, statusFilter, sort, dateFilter, tab, cohortId]);

  const all = useMemo(() => items || [], [items]);
  const groups = useMemo(
    () => ({
      current: all.filter((i) => (i.section || "current") === "current" && !isPaid(i)),
      behind: all.filter((i) => i.section === "behind" && !isPaid(i)),
      paid: all.filter(isPaid),
    }),
    [all]
  );
  const summary = useMemo(() => {
    const owe = groups.current;
    return {
      owe: owe.length,
      oweAmount: owe.reduce((t, i) => t + Number(i.amountDueCurrentMonth || 0), 0),
      called: owe.filter((i) => (i.attemptCount || 0) > 0).length,
      promised: all.filter((i) => i.status === FOLLOW_UP_STATUS.PROMISE && !isPaid(i)).length,
      paid: groups.paid.filter((i) => i.resolvedReason !== "no_longer_due").length,
      paidUnlogged: groups.paid.filter((i) => i.resolvedReason === "paid_mycase").length,
    };
  }, [groups, all]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = groups[tab].filter(
      (i) =>
        (!q || (i.clientName || "").toLowerCase().includes(q)) &&
        (statusFilter === "ALL" || i.status === statusFilter) &&
        (!dateFilter || String(i.nextFollowUpAt || "").slice(0, 10) === dateFilter)
    );
    const amount = (i) => Number(i.section === "behind" ? i.pastDueTotal : i.amountDueCurrentMonth) || 0;
    const time = (v) => (v ? asDate(v).getTime() || 0 : 0);
    out.sort((a, b) => {
      if (sort === "name") return (a.clientName || "").localeCompare(b.clientName || "");
      if (sort === "next") return (time(a.nextFollowUpAt) || Infinity) - (time(b.nextFollowUpAt) || Infinity);
      if (sort === "contact") return time(a.lastContactAt) - time(b.lastContactAt);
      return amount(b) - amount(a);
    });
    return out;
  }, [groups, tab, search, statusFilter, dateFilter, sort]);

  const saveNextDate = async (row, date) => {
    setItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, nextFollowUpAt: date } : it)));
    await updateCohortItem(cohortId, row.id, { nextFollowUpAt: date || null });
  };

  const openLog = (row) => {
    setActiveRow(row);
    setSelectedOutcome(row.status || FOLLOW_UP_STATUS.PENDING);
    setNoteText("");
    setSelectedReason(row.nonPayReason || "");
    setCustomReason(row.nonPayReasonCustom || "");
  };

  const saveLog = async () => {
    const row = activeRow;
    const note = noteText.trim();
    if (!row || !note) return;
    setSaving(true);
    try {
      const outcome = selectedOutcome;
      const timestamp = new Date().toISOString();
      const reasonValue = selectedReason || null;
      const reasonCustom = reasonValue === "OTHER" ? (customReason || "").trim() : "";
      const who = getActor();
      await updateClientCommunicationService(row.id, { message: `[Follow-Ups • ${outcome.replace(/-/g, " ")}] ${note}`, timestamp, source: "follow-ups" });
      const update = {
        status: outcome,
        attemptCount: (row.attemptCount || 0) + 1,
        lastContactAt: timestamp,
        lastContactSummary: note.slice(0, 140),
        nonPayReason: reasonValue,
        nonPayReasonCustom: reasonCustom,
        lastContactBy: who.name,
        lastContactByEmail: who.email,
      };
      // One entry per call: the Team page counts calls, outcomes and who made them.
      await updateCohortItem(cohortId, row.id, { ...update, history: arrayUnion({ at: timestamp, by: who.name, byEmail: who.email, status: outcome, reason: reasonValue, note: note.slice(0, 280) }) });
      setItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, ...update } : it)));
      setActiveRow(null);
      if (outcome === FOLLOW_UP_STATUS.PROMISE) {
        setPromiseFor(row);
        setPromiseDate("");
        setPromiseAmount(String(row.amountDueCurrentMonth || ""));
        setPromiseNotes("");
      }
      if (outcome === FOLLOW_UP_STATUS.RESOLVED) window.open(`/client/${row.id}?recordPayment=1`, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error(e);
      alert(e.message || "Could not save the call.");
    } finally {
      setSaving(false);
    }
  };

  const savePromise = async () => {
    if (!promiseDate || !promiseAmount) return;
    try {
      await savePaymentPromise(promiseFor.id, promiseDate, promiseAmount, promiseNotes);
      setPromiseFor(null);
    } catch (e) {
      alert(e.message || "Could not save the promise.");
    }
  };

  const reportAt = cohortMeta?.reportAt ? (cohortMeta.reportAt.toDate ? cohortMeta.reportAt.toDate() : asDate(cohortMeta.reportAt)) : null;
  const subtitle = reportAt
    ? `Clients who missed the payment due on the 15th. This list was built ${reportAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} and updates every 2 hours; anyone who pays moves to Paid.`
    : cohortId === thisMonth()
    ? "Clients who missed the payment due on the 15th. This month's list is built automatically on the 16th at 9 AM."
    : "Clients who missed the payment due on the 15th.";

  return (
    <Box>
      <PageHeader
        title="Follow-ups"
        subtitle={subtitle}
        actions={
          <>
            <TextField select value={cohortId} onChange={(e) => setCohortId(e.target.value)} sx={{ minWidth: 180 }} aria-label="Month">
              {months.map((m) => <MenuItem key={m} value={m}>{monthName(m)}</MenuItem>)}
            </TextField>
            <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
              <ToggleButton value="list">List</ToggleButton>
              <ToggleButton value="calendar">Calendar</ToggleButton>
              <ToggleButton value="data">Data</ToggleButton>
            </ToggleButtonGroup>
          </>
        }
      />
      {items === null && <LinearProgress sx={{ mb: 2 }} />}

      <Tiles min={190} sx={{ mb: 2.5 }}>
        <StatCard label="Still owe" value={summary.owe} sub={`${money(summary.oweAmount)} this month`} tone={summary.owe ? "bad" : "good"} />
        <StatCard label="Called" value={`${summary.called} of ${summary.owe}`} sub={summary.owe - summary.called ? `${summary.owe - summary.called} not called yet` : "Everyone called"} tone={summary.owe - summary.called ? "warn" : "good"} />
        <StatCard label="Promised" value={summary.promised} sub="waiting on a promise" />
        <StatCard label="Paid since the list" value={summary.paid} sub={summary.paidUnlogged ? `${summary.paidUnlogged} still to type in` : "all logged"} tone="good" />
      </Tiles>

      {view === "calendar" && (
        <FollowUpsCalendarView
          items={all}
          onSelectClient={openLog}
          onSelectDate={(d) => {
            setView("list");
            setDateFilter(d);
          }}
        />
      )}
      {view === "data" && <FollowUpsInsightsView items={all} />}

      {view === "list" && (
        <Card>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 1, borderBottom: 1, borderColor: "divider" }} variant="scrollable">
            <Tab value="current" label={`Were current (${groups.current.length})`} />
            <Tab value="behind" label={`Already behind (${groups.behind.length})`} />
            <Tab value="paid" label={`Paid (${groups.paid.length})`} />
          </Tabs>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ p: 2 }} alignItems={{ md: "center" }}>
            <TextField
              placeholder="Search a client"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 200 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }}
            />
            <TextField select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} sx={{ minWidth: 170 }}>
              <MenuItem value="ALL">Any status</MenuItem>
              {Object.entries(STATUS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
            </TextField>
            <TextField select value={sort} onChange={(e) => setSort(e.target.value)} sx={{ minWidth: 220 }}>
              {SORTS.map((s) => <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>)}
            </TextField>
            {dateFilter && <Chip label={`Follow-up on ${shortDate(dateFilter)}`} onDelete={() => setDateFilter("")} />}
          </Stack>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Client</TableCell>
                  <TableCell align="right">{tab === "behind" ? "Owes" : "Missed"}</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Last contact</TableCell>
                  <TableCell>Next follow-up</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {list.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((row) => {
                  const note = rowNote(row);
                  const st = STATUS[row.status] || STATUS[FOLLOW_UP_STATUS.PENDING];
                  return (
                    <TableRow key={row.id} hover>
                      <TableCell sx={{ maxWidth: 360 }}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <MuiLink component={RouterLink} to={`/client/${row.id}`} fontWeight={700} underline="hover">
                            {row.clientName}
                          </MuiLink>
                          {row.myCaseLink && (
                            <Tooltip title="Open in MyCase">
                              <IconButton size="small" href={row.myCaseLink} target="_blank" rel="noreferrer" sx={{ p: 0.25 }}>
                                <OpenInNewRounded sx={{ fontSize: 15 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                        {note && (
                          <Typography variant="caption" color={note.color} display="block" noWrap title={note.text}>
                            {note.text}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={800}>{money(row.section === "behind" ? row.pastDueTotal : row.amountDueCurrentMonth)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={st.label} color={st.color} variant={st.color === "default" ? "outlined" : "filled"} />
                      </TableCell>
                      <TableCell>
                        {row.lastContactAt ? (
                          <Tooltip title={row.lastContactSummary || ""}>
                            <Box>
                              <Typography variant="body2">{shortDate(row.lastContactAt)}</Typography>
                              {row.lastContactBy && <Typography variant="caption" color="text.secondary">{row.lastContactBy}</Typography>}
                            </Box>
                          </Tooltip>
                        ) : (
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="date"
                          value={String(row.nextFollowUpAt || "").slice(0, 10)}
                          onChange={(e) => saveNextDate(row, e.target.value)}
                          sx={{ width: 160 }}
                          inputProps={{ "aria-label": `Next follow-up for ${row.clientName}` }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Button variant={isPaid(row) ? "text" : "contained"} size="small" onClick={() => openLog(row)}>
                          Log call
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {items !== null && list.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Empty title={search || statusFilter !== "ALL" || dateFilter ? "No one matches" : tab === "paid" ? "No one has paid yet" : "No one here"}>
                        {search || statusFilter !== "ALL" || dateFilter ? "Clear the search or filters." : null}
                      </Empty>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={list.length}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[25, 50, 100]}
          />
        </Card>
      )}

      {/* Log a call */}
      <Dialog open={!!activeRow} onClose={() => !saving && setActiveRow(null)} fullWidth maxWidth="sm">
        <DialogTitle>Log a call · {activeRow?.clientName}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField select fullWidth label="What happened" value={selectedOutcome} onChange={(e) => setSelectedOutcome(e.target.value)}>
              {Object.entries(STATUS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
            </TextField>
            <TextField select fullWidth label="Why they have not paid (optional)" value={selectedReason} onChange={(e) => setSelectedReason(e.target.value)}>
              <MenuItem value="">—</MenuItem>
              {NON_PAY_REASONS.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
            </TextField>
            {selectedReason === "OTHER" && <TextField fullWidth label="Reason" value={customReason} onChange={(e) => setCustomReason(e.target.value)} />}
            <TextField multiline minRows={3} fullWidth autoFocus label="Note" placeholder="Left a voicemail, texted, spoke with the client…" helperText="Saved to the client's notes with your name." value={noteText} onChange={(e) => setNoteText(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActiveRow(null)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={saveLog} disabled={saving || !noteText.trim()}>{saving ? "Saving…" : "Save"}</Button>
        </DialogActions>
      </Dialog>

      {/* Promise */}
      <Dialog open={!!promiseFor} onClose={() => setPromiseFor(null)} fullWidth maxWidth="xs">
        <DialogTitle>Promise to pay · {promiseFor?.clientName}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField type="date" fullWidth label="They will pay on" InputLabelProps={{ shrink: true }} value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} />
            <TextField type="number" fullWidth label="Amount" value={promiseAmount} onChange={(e) => setPromiseAmount(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
            <TextField multiline minRows={2} fullWidth label="Notes (optional)" value={promiseNotes} onChange={(e) => setPromiseNotes(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPromiseFor(null)}>Skip</Button>
          <Button variant="contained" onClick={savePromise} disabled={!promiseDate || !promiseAmount}>Save promise</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
