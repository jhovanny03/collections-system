// src/ClientFollowUps/FollowUps.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  TablePagination,
  TableContainer,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import db from "../firebase";
import {
  updateCohortItem,
  getCohortIdFromAnchor,
  updateClientCommunication as updateClientCommunicationService,
} from "./followUps.service";
import { FOLLOW_UP_STATUS } from "./followUps.types";

import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase";

// ⭐ NEW: Calendar view
import FollowUpsCalendarView from "./FollowUpsCalendarView";

// ⭐ NEW: use the payment-promise saver
import { savePaymentPromise } from "../ClientDashboard/PaymentPromise";

// ⭐ NEW: Insights view
import FollowUpsInsightsView from "./FollowUpsInsightsView";

const LS_KEY = "followups:lastCohortId";

// ⭐ NEW: standardized non-payment reasons
const NON_PAY_REASONS = [
  { value: "CASE_TAKING_TOO_LONG", label: "Case taking too long" },
  { value: "CARD_ISSUES", label: "Card / payment method issues" },
  { value: "FINANCIAL_DIFFICULTIES", label: "Financial difficulties" },
  { value: "NO_EAD_YET", label: "No EAD yet" },
  { value: "NO_RECEIPT_NOTICE", label: "No receipt notice received" },
  { value: "NOT_RECEIVING_UPDATES", label: "Not receiving case updates" },
  { value: "CLIENT_UNRESPONSIVE", label: "Client unresponsive" },
  { value: "OTHER", label: "Other / Custom reason" },
];

// Helper: status → chip color
function getStatusColor(status) {
  switch (status) {
    case FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT:
      return "warning";
    case FOLLOW_UP_STATUS.REACHED_WORKING:
      return "info";
    case FOLLOW_UP_STATUS.PROMISE:
      return "primary";
    case FOLLOW_UP_STATUS.PARTIAL_PAYMENT: // ✅ NEW
      return "secondary";
    case FOLLOW_UP_STATUS.RESOLVED:
      return "success";
    case FOLLOW_UP_STATUS.PENDING:
    default:
      return "default";
  }
}

// Helper: normalize date to "YYYY-MM-DD"
function toDateKey(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  const d = value?.toDate?.() ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function FollowUps() {
  const [loading, setLoading] = useState(false);

  // ---- Anchor Date (default = 16th of current month) ----
  const defaultAnchorStr = React.useMemo(() => {
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-16`;
  }, []);
  const [anchorDateStr, setAnchorDateStr] = useState(defaultAnchorStr);

  // ---- Selected Cohort (YYYY-MM) with localStorage persistence ----
  const initialCohort = React.useMemo(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) return saved;
    const d = new Date(anchorDateStr);
    return getCohortIdFromAnchor(d);
  }, [anchorDateStr]);
  const [cohortId, setCohortId] = useState(initialCohort);

  // ---- Cohort items ----
  const [items, setItems] = useState([]);
  const [nextDates, setNextDates] = useState({});
  const [noteDrafts, setNoteDrafts] = useState({}); // per-row note draft

  // ---- Filters / Search / Sort ----
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("amountDue"); // amountDue | lastContact | nextFollowUp | name
  const [sortDir, setSortDir] = useState("desc"); // asc | desc

  // ⭐ NEW: date filter (from calendar clicks)
  const [dateFilter, setDateFilter] = useState("");

  // ---- Pagination ----
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25); // default = 25

  // ---- Note dialog ----
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [activeRow, setActiveRow] = useState(null);
  const [selectedOutcome, setSelectedOutcome] = useState(
    FOLLOW_UP_STATUS.PENDING
  );

  // ⭐ NEW: reason for non-payment
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");

  // ⭐ NEW: List vs Calendar vs Insights
  const [viewMode, setViewMode] = useState("list"); // "list" | "calendar" | "insights"

  // ⭐ NEW: Payment Promise dialog state
  const [promiseDialogOpen, setPromiseDialogOpen] = useState(false);
  const [promiseClientId, setPromiseClientId] = useState(null);
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [promiseNotes, setPromiseNotes] = useState("");

  // Load items once per cohort
  const loadItemsForCohort = async (cid) => {
    if (!cid) return;
    try {
      const itemsRef = collection(db, "followUpsCohorts", cid, "items");
      const q = query(itemsRef, orderBy("clientName"));
      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        // Normalize: items generated by the Cloud Function have no status field.
        // Default to PENDING so filters work with direct equality checks.
        status: d.data().status || FOLLOW_UP_STATUS.PENDING,
      }));
      setItems(rows);
      setPage(0);
    } catch (err) {
      console.error("Error loading follow-ups cohort:", err);
    }
  };

  useEffect(() => {
    if (!cohortId) return;
    localStorage.setItem(LS_KEY, cohortId);
    loadItemsForCohort(cohortId);
  }, [cohortId]);

  // Reset to first page whenever the filtered result set changes, so we never
  // get stranded on a page that no longer exists after searching/filtering.
  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, sortBy, sortDir, dateFilter]);

  // Generate cohort using Cloud Function
  const handleGenerate = async () => {
    const proceed = window.confirm(
      "Refresh the follow-up list for this anchor month?\n\n" +
        "This re-scans all clients: it adds newly-missed clients, removes any " +
        "who have since paid, and updates amounts due. Your logged progress " +
        "(statuses, notes, next follow-up dates) is preserved."
    );
    if (!proceed) return;

    setLoading(true);
    try {
      const functions = getFunctions(app);
      const generateFollowUpsCohort = httpsCallable(
        functions,
        "generateFollowUpsCohort"
      );

      const res = await generateFollowUpsCohort({
        anchorDate: anchorDateStr,
      });

      console.log("generateFollowUpsCohort result:", res.data);

      const newCohortId = res?.data?.cohortId;
      if (newCohortId) {
        setCohortId(newCohortId);
        localStorage.setItem(LS_KEY, newCohortId);
        // optional: clear date filter when changing cohort
        setDateFilter("");
      } else {
        alert("Follow-ups function ran, but no cohortId was returned.");
      }
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to generate list");
    } finally {
      setLoading(false);
    }
  };

  // KPIs (overall cohort, not filtered)
  const kpis = useMemo(() => {
    const total = items.length;
    const resolved = items.filter(
      (i) => i.status === FOLLOW_UP_STATUS.RESOLVED
    ).length;
    const promises = items.filter(
      (i) => i.status === FOLLOW_UP_STATUS.PROMISE
    ).length;

    // ✅ NEW: include PARTIAL_PAYMENT as "contacted"
    const contacted = items.filter(
      (i) =>
        i.status === FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT ||
        i.status === FOLLOW_UP_STATUS.REACHED_WORKING ||
        i.status === FOLLOW_UP_STATUS.PROMISE ||
        i.status === FOLLOW_UP_STATUS.PARTIAL_PAYMENT || // ✅ NEW
        i.status === FOLLOW_UP_STATUS.RESOLVED
    ).length;

    return { total, resolved, promises, contacted };
  }, [items]);

  const handleSaveNextFollowUp = async (row) => {
    const date = nextDates[row.id];
    if (!date) return;

    const timestamp = date;

    await updateCohortItem(cohortId, row.id, { nextFollowUpAt: date });

    // Optimistic local update
    setItems((prev) =>
      prev.map((it) =>
        it.id === row.id ? { ...it, nextFollowUpAt: timestamp } : it
      )
    );
  };

  // Open dialog when user clicks "Log" (from list OR calendar)
  const handleOpenLogDialog = (row) => {
    setActiveRow(row);
    setSelectedOutcome(row.status || FOLLOW_UP_STATUS.PENDING);
    setNoteText(noteDrafts[row.id] || "");
    setSelectedReason(row.nonPayReason || "");
    setCustomReason(row.nonPayReasonCustom || "");
    setNoteDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setNoteDialogOpen(false);
    setActiveRow(null);
    setNoteText("");
    setSelectedReason("");
    setCustomReason("");
  };

  // ⭐ NEW: Save the payment promise from the popup
  const handleSavePromise = async () => {
    if (!promiseClientId) return;
    if (!promiseDate || !promiseAmount) {
      alert("Please enter both date and amount for the payment promise.");
      return;
    }

    try {
      await savePaymentPromise(
        promiseClientId,
        promiseDate,
        promiseAmount,
        promiseNotes
      );
      setPromiseDialogOpen(false);
      setPromiseClientId(null);
      setPromiseDate("");
      setPromiseAmount("");
      setPromiseNotes("");
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to save payment promise");
    }
  };

  // Confirm log: use noteText + selectedOutcome
  const handleConfirmLog = async () => {
    if (!activeRow) return;
    const note = noteText.trim();
    if (!note) {
      alert("Please enter a note before logging.");
      return;
    }

    const row = activeRow;
    const outcome = selectedOutcome;
    const timestamp = new Date().toISOString();
    const statusLabel = outcome.replace(/-/g, " ");

    const reasonValue = selectedReason || null;
    const reasonCustom =
      reasonValue === "OTHER" ? (customReason || "").trim() : "";

    // 1) Write to client communicationLogs in Firestore
    await updateClientCommunicationService(row.id, {
      message: `[Follow-Ups • ${statusLabel}] ${note}`,
      timestamp,
      user: "Follow-Ups",
    });

    // 2) Update cohort item in Firestore (include reason fields)
    await updateCohortItem(cohortId, row.id, {
      status: outcome,
      attemptCount: (row.attemptCount || 0) + 1,
      lastContactAt: timestamp,
      lastContactSummary: note.slice(0, 140),
      nonPayReason: reasonValue,
      nonPayReasonCustom: reasonCustom,
    });

    // 3) Optimistic local update
    setItems((prev) =>
      prev.map((it) =>
        it.id === row.id
          ? {
              ...it,
              status: outcome,
              attemptCount: (it.attemptCount || 0) + 1,
              lastContactAt: timestamp,
              lastContactSummary: note.slice(0, 140),
              nonPayReason: reasonValue,
              nonPayReasonCustom: reasonCustom,
            }
          : it
      )
    );

    // 4) Keep row draft in sync with final note
    setNoteDrafts((prev) => ({
      ...prev,
      [row.id]: note,
    }));

    // ⭐ 5) If outcome is PROMISE, open the Payment Promise popup
    if (outcome === FOLLOW_UP_STATUS.PROMISE) {
      setPromiseClientId(row.id);
      setPromiseDate("");
      setPromiseAmount("");
      setPromiseNotes("");
      setPromiseDialogOpen(true);
    }

    // ✅ If outcome is RESOLVED, open client dashboard in a NEW TAB
    if (outcome === FOLLOW_UP_STATUS.RESOLVED) {
      window.open(
        `/client/${row.id}?recordPayment=1`,
        "_blank",
        "noopener,noreferrer"
      );
    }

    handleCloseDialog();
  };

  // ----- Filter + Search + Sort -----
  const filteredSortedItems = useMemo(() => {
    let list = [...items];

    // Search (name or ID-style string, still supports ID search)
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      list = list.filter((item) => {
        const name = (item.clientName || "").toLowerCase();
        const idStr = (item.id || "").toLowerCase();
        return name.includes(term) || idStr.includes(term);
      });
    }

    // Status filter — normalise at compare time so items with no stored
    // status field (new Cloud Function items) correctly match "Pending".
    if (statusFilter !== "ALL") {
      list = list.filter((item) => {
        const s = item.status || FOLLOW_UP_STATUS.PENDING;
        return s === statusFilter;
      });
    }

    // ⭐ Date filter (from calendar click)
    if (dateFilter) {
      list = list.filter(
        (item) => toDateKey(item.nextFollowUpAt) === dateFilter
      );
    }

    // Sorting helpers
    const toNum = (v) => (v == null ? 0 : Number(v) || 0);
    const toTime = (v) => (v ? new Date(v).getTime() : 0);

    list.sort((a, b) => {
      let aVal = 0;
      let bVal = 0;

      if (sortBy === "amountDue") {
        aVal = toNum(a.amountDueCurrentMonth);
        bVal = toNum(b.amountDueCurrentMonth);
      } else if (sortBy === "lastContact") {
        aVal = toTime(a.lastContactAt);
        bVal = toTime(b.lastContactAt);
      } else if (sortBy === "nextFollowUp") {
        aVal = toTime(a.nextFollowUpAt);
        bVal = toTime(b.nextFollowUpAt);
      } else if (sortBy === "name") {
        const aName = (a.clientName || "").toLowerCase();
        const bName = (b.clientName || "").toLowerCase();
        if (aName < bName) return sortDir === "asc" ? -1 : 1;
        if (aName > bName) return sortDir === "asc" ? 1 : -1;
        return 0;
      }

      if (sortBy === "name") return 0; // already returned

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [items, search, statusFilter, sortBy, sortDir, dateFilter]);

  // Paginated view
  const pagedItems = useMemo(() => {
    const start = page * rowsPerPage;
    const end = start + rowsPerPage;
    return filteredSortedItems.slice(start, end);
  }, [filteredSortedItems, page, rowsPerPage]);

  // Helper: display label for reason under client name
  const resolveReasonLabel = (value, custom) => {
    if (!value) return "";
    if (value === "OTHER") return custom || "Other / Custom reason";
    const found = NON_PAY_REASONS.find((r) => r.value === value);
    return found?.label || custom || value;
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Follow-Ups — Missed on the 15th (Current Month Only)
      </Typography>

      {/* ⭐ View toggle: List / Calendar / Data */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Button
          size="small"
          variant={viewMode === "list" ? "contained" : "outlined"}
          onClick={() => setViewMode("list")}
        >
          List
        </Button>
        <Button
          size="small"
          variant={viewMode === "calendar" ? "contained" : "outlined"}
          onClick={() => setViewMode("calendar")}
        >
          Calendar
        </Button>
        <Button
          size="small"
          variant={viewMode === "insights" ? "contained" : "outlined"}
          onClick={() => setViewMode("insights")}
        >
          Data
        </Button>
      </Stack>

      {/* Top controls: anchor, cohort, KPIs (shown in ALL views) */}
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        sx={{ mb: 2, flexWrap: "wrap" }}
      >
        {/* Anchor Date */}
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" color="text.secondary">
            Anchor Date
          </Typography>
          <TextField
            type="date"
            size="small"
            value={anchorDateStr}
            onChange={(e) => setAnchorDateStr(e.target.value)}
          />
          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? "Generating…" : "Generate Follow-Up List"}
          </Button>
        </Stack>

        {/* Cohort Month */}
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" color="text.secondary">
            Cohort Month
          </Typography>
          <TextField
            type="month"
            size="small"
            value={cohortId}
            onChange={(e) => setCohortId(e.target.value)}
          />
        </Stack>

        <Chip label={`Total: ${kpis.total}`} />
        <Chip color="success" label={`Resolved: ${kpis.resolved}`} />
        <Chip color="primary" label={`Promises: ${kpis.promises}`} />
        <Chip color="warning" label={`Contacted: ${kpis.contacted}`} />

        {/* ⭐ Show active date filter (if any) */}
        {dateFilter && (
          <Chip
            color="info"
            label={`Next Follow-Up: ${dateFilter}`}
            onDelete={() => setDateFilter("")}
            sx={{ ml: 1 }}
          />
        )}
      </Stack>

      {/* 🔁 Switch between LIST / CALENDAR / INSIGHTS views */}
      {viewMode === "calendar" ? (
        <>
          <FollowUpsCalendarView
            items={items}
            onSelectClient={(row) => {
              handleOpenLogDialog(row);
            }}
            onSelectDate={(dateStr) => {
              setViewMode("list");
              setDateFilter(dateStr);
            }}
          />
          <Divider sx={{ my: 3 }} />
          <Typography variant="caption" color="text.secondary">
            Calendar shows clients with a Next Follow-Up date. Click an event
            to log a follow-up interaction, or click a date to filter the list.
          </Typography>
        </>
      ) : viewMode === "insights" ? (
        <FollowUpsInsightsView items={items} />
      ) : (
        <>
          {/* Filters / Search / Sort row (LIST only) */}
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ mb: 1.5, flexWrap: "wrap" }}
          >
            <TextField
              size="small"
              label="Search (name or ID)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ minWidth: 220 }}
            />

            <TextField
              size="small"
              label="Status"
              select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="ALL">All statuses</MenuItem>
              <MenuItem value={FOLLOW_UP_STATUS.PENDING}>Pending</MenuItem>
              <MenuItem value={FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT}>
                Attempted – No Contact
              </MenuItem>
              <MenuItem value={FOLLOW_UP_STATUS.REACHED_WORKING}>
                Reached – Working
              </MenuItem>
              <MenuItem value={FOLLOW_UP_STATUS.PROMISE}>Promise</MenuItem>
              <MenuItem value={FOLLOW_UP_STATUS.PARTIAL_PAYMENT}>
                Partial Payment
              </MenuItem>
              <MenuItem value={FOLLOW_UP_STATUS.RESOLVED}>Resolved</MenuItem>
            </TextField>

            <TextField
              size="small"
              label="Sort by"
              select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="amountDue">Amount Due</MenuItem>
              <MenuItem value="lastContact">Last Contact</MenuItem>
              <MenuItem value="nextFollowUp">Next Follow-Up</MenuItem>
              <MenuItem value="name">Client Name</MenuItem>
            </TextField>

            <TextField
              size="small"
              label="Order"
              select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value)}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="desc">Desc</MenuItem>
              <MenuItem value="asc">Asc</MenuItem>
            </TextField>
          </Stack>

          <Card elevation={2}>
            <CardContent sx={{ p: 0 }}>
              <TableContainer sx={{ maxHeight: 600 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Client</TableCell>
                      <TableCell>MyCase</TableCell>
                      <TableCell>Amount Due</TableCell>
                      <TableCell>Due Month</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Last Contact</TableCell>
                      <TableCell>Next Follow-Up</TableCell>
                      <TableCell width="36%">Quick Note / Log</TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {pagedItems.map((row) => {
                      const reasonLabel = resolveReasonLabel(
                        row.nonPayReason,
                        row.nonPayReasonCustom
                      );

                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Stack spacing={0.2}>
                              <a
                                href={`/client/${row.id}`}
                                style={{ textDecoration: "none" }}
                              >
                                <Typography variant="body2" fontWeight={600}>
                                  {row.clientName}
                                </Typography>
                              </a>
                              {reasonLabel && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  Reason: {reasonLabel}
                                </Typography>
                              )}
                            </Stack>
                          </TableCell>

                          <TableCell>
                            {row.myCaseLink ? (
                              <IconButton
                                href={row.myCaseLink}
                                target="_blank"
                                rel="noreferrer"
                                size="small"
                              >
                                <OpenInNewIcon fontSize="inherit" />
                              </IconButton>
                            ) : (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                —
                              </Typography>
                            )}
                          </TableCell>

                          <TableCell>
                            <Typography>
                              ${Number(
                                row.amountDueCurrentMonth || 0
                              ).toLocaleString()}
                            </Typography>
                          </TableCell>

                          <TableCell>{row.dueMonthLabel || "—"}</TableCell>

                          <TableCell>
                            <Chip
                              size="small"
                              label={row.status || FOLLOW_UP_STATUS.PENDING}
                              color={getStatusColor(
                                row.status || FOLLOW_UP_STATUS.PENDING
                              )}
                              variant="filled"
                            />
                          </TableCell>

                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {row.lastContactAt
                                ? new Date(row.lastContactAt).toLocaleString()
                                : "—"}
                            </Typography>
                          </TableCell>

                          <TableCell>
                            <Stack
                              direction="row"
                              spacing={0.5}
                              alignItems="center"
                            >
                              <TextField
                                type="date"
                                size="small"
                                value={
                                  nextDates[row.id] ||
                                  row.nextFollowUpAt ||
                                  ""
                                }
                                onChange={(e) =>
                                  setNextDates((prev) => ({
                                    ...prev,
                                    [row.id]: e.target.value,
                                  }))
                                }
                              />
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => handleSaveNextFollowUp(row)}
                              >
                                Save
                              </Button>
                            </Stack>
                          </TableCell>

                          <TableCell>
                            <Stack
                              direction="row"
                              spacing={0.5}
                              alignItems="center"
                            >
                              <TextField
                                fullWidth
                                placeholder="Left VM / text / email…"
                                size="small"
                                value={noteDrafts[row.id] || ""}
                                onChange={(e) =>
                                  setNoteDrafts((prev) => ({
                                    ...prev,
                                    [row.id]: e.target.value,
                                  }))
                                }
                              />
                              <Button
                                variant="contained"
                                size="small"
                                onClick={() => handleOpenLogDialog(row)}
                              >
                                Log
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {!filteredSortedItems.length && (
                      <TableRow>
                        <TableCell colSpan={8} align="center">
                          <Typography variant="body2" color="text.secondary">
                            No items in this cohort (after filters). Try
                            clearing search/status/date filters or generate a
                            new list using the Anchor Date.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <TablePagination
                component="div"
                count={filteredSortedItems.length}
                page={page}
                rowsPerPage={rowsPerPage}
                onPageChange={(e, newPage) => setPage(newPage)}
                onRowsPerPageChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10));
                  setPage(0);
                }}
                rowsPerPageOptions={[25, 50, 100]}
              />
            </CardContent>
          </Card>

          <Divider sx={{ my: 3 }} />

          <Typography variant="caption" color="text.secondary">
            Each cohort (YYYY-MM) persists in Firestore. Switch months with the
            Cohort Month control to review outcomes without regenerating.
          </Typography>
        </>
      )}

      {/* NOTE + OUTCOME DIALOG */}
      <Dialog
        open={noteDialogOpen}
        onClose={handleCloseDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {activeRow
            ? `Log Follow-Up — ${activeRow.clientName || activeRow.id}`
            : "Log Follow-Up"}
        </DialogTitle>
        <DialogContent dividers>
          <TextField
            select
            fullWidth
            label="Outcome"
            size="small"
            value={selectedOutcome}
            onChange={(e) => setSelectedOutcome(e.target.value)}
            sx={{ mb: 2, mt: 0.5 }}
          >
            <MenuItem value={FOLLOW_UP_STATUS.PENDING}>Pending</MenuItem>
            <MenuItem value={FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT}>
              Attempted – No Contact
            </MenuItem>
            <MenuItem value={FOLLOW_UP_STATUS.REACHED_WORKING}>
              Reached – Working
            </MenuItem>
            <MenuItem value={FOLLOW_UP_STATUS.PROMISE}>Promise</MenuItem>
            <MenuItem value={FOLLOW_UP_STATUS.PARTIAL_PAYMENT}>
              Partial Payment
            </MenuItem>
            <MenuItem value={FOLLOW_UP_STATUS.RESOLVED}>Resolved</MenuItem>
          </TextField>

          <TextField
            select
            fullWidth
            size="small"
            label="Reason for non-payment (optional)"
            value={selectedReason}
            onChange={(e) => setSelectedReason(e.target.value)}
            sx={{ mb: selectedReason === "OTHER" ? 1 : 2 }}
          >
            <MenuItem value="">No reason selected</MenuItem>
            {NON_PAY_REASONS.map((r) => (
              <MenuItem key={r.value} value={r.value}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>

          {selectedReason === "OTHER" && (
            <TextField
              fullWidth
              size="small"
              label="Custom reason"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              sx={{ mb: 2 }}
            />
          )}

          <TextField
            multiline
            minRows={3}
            fullWidth
            label="Notes (this will go to Communication Log)"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleConfirmLog}>
            Save & Log
          </Button>
        </DialogActions>
      </Dialog>

      {/* PAYMENT PROMISE POPUP */}
      <Dialog
        open={promiseDialogOpen}
        onClose={() => setPromiseDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Payment Promise</DialogTitle>
        <DialogContent dividers>
          <TextField
            type="date"
            fullWidth
            size="small"
            label="Promise Date"
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
            value={promiseDate}
            onChange={(e) => setPromiseDate(e.target.value)}
          />
          <TextField
            type="number"
            fullWidth
            size="small"
            label="Amount"
            sx={{ mb: 2 }}
            value={promiseAmount}
            onChange={(e) => setPromiseAmount(e.target.value)}
          />
          <TextField
            multiline
            minRows={3}
            fullWidth
            size="small"
            label="Additional Notes"
            value={promiseNotes}
            onChange={(e) => setPromiseNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPromiseDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSavePromise}>
            Save Promise
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}