// ClientList.js
import React, { useEffect, useState, useMemo } from "react";
import db from "./firebase";
import { collection, getDocs, doc, deleteDoc } from "firebase/firestore";
import EditClient from "./EditClient.jsx";
import ReportingSummary from "./ReportingSummary";

// MUI
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  Link as MuiLink,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Snackbar,
  Alert,
  CssBaseline,
} from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { deepmerge } from "@mui/utils";

// Icons
import SearchIcon from "@mui/icons-material/Search";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import VisibilityIcon from "@mui/icons-material/Visibility";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

/* ========= compact case tag helper ========= */
function buildCompactCaseTag(client) {
  const raw = (client.caseTitle || "").trim();
  if (!raw) return null;
  const prefixMatch = raw.match(/^[A-Z]\s*\(\d{2}-\d{2}\)/i);
  const detailMatch = raw.match(/\(([^)]+)\)/);
  const parts = raw.split(/\s+/);
  const city = parts.length ? parts[parts.length - 1] : "";
  const cityAbbrev = city ? city.substring(0, 3).toUpperCase() : "";
  const detail = (detailMatch ? detailMatch[1] : "")
    .replace(/\s*\+\s*/g, "+")
    .replace(/\s{2,}/g, " ")
    .trim();
  const prefix = prefixMatch ? prefixMatch[0].replace(/\s+/g, "") : "";
  const fullName = `${client.firstName || ""} ${client.lastName || ""}`.trim();
  const cleanedDetail = fullName
    ? detail.replace(new RegExp(fullName, "i"), "").trim()
    : detail;
  const segs = [prefix, cleanedDetail, cityAbbrev].filter(Boolean);
  const tag = segs.join(" • ");
  return tag || null;
}

const clientListTheme = (outerTheme) =>
  createTheme(
    deepmerge(outerTheme, {
      palette: {
        primary: { main: "#0b3a75" },
        success: { main: "#28a745" },
        error: { main: "#dc3545" },
        info: { main: "#007bff" },
      },
      components: {
        MuiCard: {
          styleOverrides: {
            root: ({ theme }) => ({
              borderRadius: 16,
              boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
              border:
                theme.palette.mode === "light"
                  ? "1px solid rgba(2,55,112,0.08)"
                  : "1px solid rgba(255,255,255,0.12)",
            }),
          },
        },
        MuiTableRow: {
          styleOverrides: {
            root: ({ theme }) => ({
              "&:nth-of-type(odd)": {
                backgroundColor:
                  theme.palette.mode === "light"
                    ? "rgba(2,55,112,0.02)"
                    : "rgba(255,255,255,0.03)",
              },
            }),
          },
        },
        MuiLink: {
          styleOverrides: {
            root: ({ theme }) => ({
              color:
                theme.palette.mode === "dark"
                  ? theme.palette.primary.light
                  : theme.palette.primary.main,
              fontWeight: 600,
              textShadow:
                theme.palette.mode === "dark"
                  ? "0 0 0.6px rgba(255,255,255,0.6)"
                  : "none",
              "&:hover": {
                textDecorationColor:
                  theme.palette.mode === "dark"
                    ? theme.palette.primary.light
                    : theme.palette.primary.main,
              },
            }),
          },
        },
      },
      typography: {
        fontFamily:
          "'Inter', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      },
    })
  );

function ClientList() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingClient, setEditingClient] = useState(null);
  const [refresh, setRefresh] = useState(false);

  // UI state
  const [search, setSearch] = useState("");
  const [caseStatusFilter, setCaseStatusFilter] = useState("Any");
  const [overdueFilter, setOverdueFilter] = useState("Any"); // Any | Current | Past Due
  const [caseTypeFilter, setCaseTypeFilter] = useState("Any");

  // Months Past Due filter
  const [monthsPastDueFilter, setMonthsPastDueFilter] = useState("Any");
  const monthsPastDueOptions = ["Any", "1", "2", "3", "4+"];

  // Sorting
  const [orderBy, setOrderBy] = useState(null);
  const [order, setOrder] = useState("asc");

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Delete dialog
  const [deleteId, setDeleteId] = useState(null);
  const [toast, setToast] = useState({ open: false, type: "success", msg: "" });

  useEffect(() => {
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const fetchClients = async () => {
    setLoading(true);
    const querySnapshot = await getDocs(collection(db, "clients"));
    const clientList = querySnapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    setClients(clientList);
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDoc(doc(db, "clients", deleteId));
      setClients((prev) => prev.filter((c) => c.id !== deleteId));
      setToast({ open: true, type: "success", msg: "Client deleted." });
    } catch (e) {
      console.error(e);
      setToast({ open: true, type: "error", msg: "Failed to delete client." });
    } finally {
      setDeleteId(null);
    }
  };

  const handleEdit = (client) => setEditingClient(client);

  /* ==================== BILLING MATH (aligned with BillingOverview) ==================== */
  const toDate = (raw) => (raw?.seconds ? new Date(raw.seconds * 1000) : new Date(raw));
  const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
  const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  const labelFor = (d) =>
    `${d.toLocaleString("default", { month: "long" })} ${d.getFullYear()}`;

  // Variable installment by month (falls back to 500)
  const getInstallmentAmountForDate = (schedule, date) => {
    if (!Array.isArray(schedule) || schedule.length === 0) return 500;
    for (let i = 0; i < schedule.length; i++) {
      const s = schedule[i];
      const sStart = new Date(s.start);
      const sEnd = new Date(s.end);
      if (date >= sStart && date <= sEnd) return Number(s.amount || 500);
    }
    return 500;
  };

  // Derive per-client list fields (past-due only)
  // NOTE:
  //  - Past due is computed from the ORIGINAL firstInstallmentDate (15th rule)
  //  - We RESPECT skipMonths
  //  - We IGNORE pause when counting historical arrears (so the list never "hides" overdue)
  //  - Payments count only if AFTER initialPaymentDate
  //  - Closed cases always show 0 due
  const deriveClient = (client) => {
    const status = client?.status || "active";
    const isClosed = status === "closed";

    const rawStart = client.firstInstallmentDate;
    if (!rawStart) {
      return {
        ...client,
        computedAmountDue: 0,
        computedPastDueLabel: "Current",
        computedMissedMonths: 0,
        isCurrent: true,
      };
    }
    const planStart = toDate(rawStart);
    if (!planStart || isNaN(planStart)) {
      return {
        ...client,
        computedAmountDue: 0,
        computedPastDueLabel: "Current",
        computedMissedMonths: 0,
        isCurrent: true,
      };
    }

    // First billable month = the 15th of the start month
    const firstDueDate = new Date(planStart.getFullYear(), planStart.getMonth(), 15);

    const allPayments = client?.payments || [];
    const initialPaymentDate = client?.initialPaymentDate
      ? new Date(client.initialPaymentDate)
      : null;

    // Payments AFTER initialPaymentDate (FIFO)
    const paymentsAfterInitial = initialPaymentDate
      ? allPayments.filter((p) => new Date(p.date) > initialPaymentDate)
      : allPayments.slice();

    const paymentPool = paymentsAfterInitial.map((p) => ({
      amount: Number(p.amount || 0),
      date: p.date,
    }));

    // Skipped months set
    const skipSet = new Set((client.skipMonths || []).map(String));
    const monthIsSkipped = (d) => skipSet.has(ymKey(d));

    // Installment schedule (sorted)
    const schedule = (client.installmentSchedule || [])
      .slice()
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    // Build list from firstDueDate through TODAY (do not cut at pause)
    const today = new Date();
    const monthsUpToCutoff = [];
    if (!isClosed) {
      const cutoff = today;
      const cursor = new Date(firstDueDate);
      while (cursor <= cutoff) {
        if (!monthIsSkipped(cursor)) {
          monthsUpToCutoff.push(new Date(cursor));
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    // Allocate FIFO across months
    const dueMonths = []; // { label, amount }
    for (const monthDate of monthsUpToCutoff) {
      const amountDue = getInstallmentAmountForDate(schedule, monthDate);
      let monthPaid = 0;

      for (const p of paymentPool) {
        if (p.amount <= 0) continue;
        if (monthPaid >= amountDue) break;
        const used = Math.min(amountDue - monthPaid, p.amount);
        monthPaid += used;
        p.amount -= used;
      }

      if (monthPaid < amountDue) {
        dueMonths.push({ label: labelFor(monthDate), amount: amountDue });
      }
    }

    // Summaries for the table
    const computedAmountDue = isClosed
      ? 0
      : dueMonths.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

    const computedMissedMonths = isClosed ? 0 : dueMonths.length;

    let computedPastDueLabel = "Current";
    if (!isClosed && computedMissedMonths > 0) {
      computedPastDueLabel =
        computedMissedMonths === 1
          ? dueMonths[0].label
          : `${dueMonths[0].label} – ${dueMonths[computedMissedMonths - 1].label}`;
    }

    return {
      ...client,
      computedAmountDue,
      computedMissedMonths,
      computedPastDueLabel,
      isCurrent: computedMissedMonths === 0,
    };
  };

  // ⚠️ IMPORTANT: we must compute these fields; the table reads them
  const derived = useMemo(() => clients.map(deriveClient), [clients]);

  // --- Filtering + Search ---
  const filtered = useMemo(() => {
    let arr = [...derived];

    const q = search.trim().toLowerCase();
    if (q) {
      arr = arr.filter((c) => {
        const nameHit =
          c.firstName?.toLowerCase().includes(q) ||
          c.lastName?.toLowerCase().includes(q);
        const title = (c.caseTitle || "").toLowerCase();
        const tag = (buildCompactCaseTag(c) || "").toLowerCase();
        return nameHit || title.includes(q) || tag.includes(q);
      });
    }

    if (caseStatusFilter !== "Any") {
      arr = arr.filter((c) => (c.caseStatus || "") === caseStatusFilter);
    }

    if (overdueFilter !== "Any") {
      if (overdueFilter === "Current") arr = arr.filter((c) => c.isCurrent);
      if (overdueFilter === "Past Due") arr = arr.filter((c) => !c.isCurrent);
    }

    if (caseTypeFilter !== "Any") {
      arr = arr.filter((c) => (c.caseType || "") === caseTypeFilter);
    }

    if (monthsPastDueFilter !== "Any") {
      arr = arr.filter((c) => {
        const missed = Number.isFinite(c.computedMissedMonths)
          ? c.computedMissedMonths
          : 0;
        if (monthsPastDueFilter === "4+") return missed >= 4;
        return missed === Number(monthsPastDueFilter);
      });
    }

    return arr;
  }, [derived, search, caseStatusFilter, overdueFilter, caseTypeFilter, monthsPastDueFilter]);

  // --- Sorting ---
  const handleRequestSort = (key) => {
    const isAsc = orderBy === key && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(key);
  };

  const sorted = useMemo(() => {
    if (!orderBy) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      let aVal;
      let bVal;
      if (orderBy === "computedAmountDue") {
        aVal = parseFloat(a[orderBy]) || 0;
        bVal = parseFloat(b[orderBy]) || 0;
      } else {
        aVal = (a[orderBy] ?? "").toString().toLowerCase();
        bVal = (b[orderBy] ?? "").toString().toLowerCase();
      }
      if (aVal < bVal) return order === "asc" ? -1 : 1;
      if (aVal > bVal) return order === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, order, orderBy]);

  // --- Pagination ---
  const paginated = useMemo(() => {
    const start = page * rowsPerPage;
    return sorted.slice(start, start + rowsPerPage);
  }, [sorted, page, rowsPerPage]);

  const caseTypes = useMemo(() => {
    const set = new Set();
    clients.forEach((c) => c.caseType && set.add(c.caseType));
    return ["Any", ...Array.from(set)];
  }, [clients]);

  const caseStatuses = ["Any", "ACTIVE", "FILED", "APPROVED"];
  const overdueOptions = ["Any", "Current", "Past Due"];

  if (loading) {
    return (
      <ThemeProvider theme={clientListTheme}>
        <CssBaseline />
        <Typography sx={{ p: 3 }}>Loading clients...</Typography>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={clientListTheme}>
      <CssBaseline />
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: "auto" }}>
        <ReportingSummary />

        <Card sx={{ mt: 2 }}>
          <CardHeader
            title="Client List"
            sx={{
              "& .MuiCardHeader-title": { fontWeight: 700 },
              pb: 0,
            }}
          />
          <CardContent>
            {/* Filters + Search */}
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              alignItems={{ xs: "stretch", md: "center" }}
              justifyContent="space-between"
              sx={{ mb: 2 }}
            >
              <Stack direction="row" spacing={2} flexWrap="wrap">
                <TextField
                  select
                  label="Case Status"
                  value={caseStatusFilter}
                  onChange={(e) => {
                    setCaseStatusFilter(e.target.value);
                    setPage(0);
                  }}
                  size="small"
                  sx={{ minWidth: 160 }}
                >
                  {caseStatuses.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  select
                  label="Overdue"
                  value={overdueFilter}
                  onChange={(e) => {
                    setOverdueFilter(e.target.value);
                    setPage(0);
                  }}
                  size="small"
                  sx={{ minWidth: 140 }}
                >
                  {overdueOptions.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  select
                  label="Case Type"
                  value={caseTypeFilter}
                  onChange={(e) => {
                    setCaseTypeFilter(e.target.value);
                    setPage(0);
                  }}
                  size="small"
                  sx={{ minWidth: 200 }}
                >
                  {caseTypes.map((t) => (
                    <MenuItem key={t} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </TextField>

                {/* Months Past Due */}
                <TextField
                  select
                  label="Months Past Due"
                  value={monthsPastDueFilter}
                  onChange={(e) => {
                    setMonthsPastDueFilter(e.target.value);
                    setPage(0);
                  }}
                  size="small"
                  sx={{ minWidth: 160 }}
                >
                  {monthsPastDueOptions.map((opt) => (
                    <MenuItem key={opt} value={opt}>
                      {opt}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>

              <TextField
                placeholder="Search by name, case title…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                size="small"
                sx={{ width: { xs: "100%", md: 360 } }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                  endAdornment: search ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearch("")}>
                        ×
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                }}
              />
            </Stack>

            <Divider sx={{ mb: 2 }} />

            {/* Table */}
            <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ "& th": { fontWeight: 700 } }}>
                    <TableCell sortDirection={orderBy === "firstName" ? order : false}>
                      <TableSortLabel
                        active={orderBy === "firstName"}
                        direction={orderBy === "firstName" ? order : "asc"}
                        onClick={() => handleRequestSort("firstName")}
                      >
                        Name
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Case Type</TableCell>
                    <TableCell sortDirection={orderBy === "caseStatus" ? order : false}>
                      <TableSortLabel
                        active={orderBy === "caseStatus"}
                        direction={orderBy === "caseStatus" ? order : "asc"}
                        onClick={() => handleRequestSort("caseStatus")}
                      >
                        Case Status
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>MyCase</TableCell>
                    <TableCell
                      align="right"
                      sortDirection={orderBy === "computedAmountDue" ? order : false}
                    >
                      <TableSortLabel
                        active={orderBy === "computedAmountDue"}
                        direction={orderBy === "computedAmountDue" ? order : "asc"}
                        onClick={() => handleRequestSort("computedAmountDue")}
                      >
                        Amount Due
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Months Past Due</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {paginated.map((client) => (
                    <TableRow key={client.id} hover>
                      {/* ===== Name + compact case tag ===== */}
                      <TableCell>
                        <Stack spacing={0.25}>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <MuiLink href={`/client/${client.id}`} underline="hover">
                              {client.firstName} {client.lastName}
                            </MuiLink>
                            {client.paymentArrangement && (
                              <Chip size="small" label="On Arrangement" color="info" variant="outlined" />
                            )}
                          </Stack>

                          {client.caseTitle && (
                            <Tooltip title={client.caseTitle} placement="top" arrow>
                              <Typography
                                variant="caption"
                                sx={{
                                  color: "text.secondary",
                                  maxWidth: 360,
                                  display: { xs: "none", sm: "-webkit-box" },
                                  WebkitLineClamp: 1,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {buildCompactCaseTag(client)}
                              </Typography>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>

                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {client.caseType || "—"}
                      </TableCell>

                      <TableCell>
                        {client.caseStatus ? (
                          <Chip
                            size="small"
                            label={client.caseStatus}
                            color={
                              client.caseStatus === "ACTIVE"
                                ? "success"
                                : client.caseStatus === "FILED"
                                ? "warning"
                                : "default"
                            }
                            variant="filled"
                          />
                        ) : (
                          "—"
                        )}
                      </TableCell>

                      <TableCell>
                        {client.myCaseLink ? (
                          <Tooltip title="Open in MyCase">
                            <IconButton
                              size="small"
                              href={client.myCaseLink}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <OpenInNewIcon fontSize="inherit" />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          "—"
                        )}
                      </TableCell>

                      <TableCell align="right">
                        ${Number(client.computedAmountDue || 0).toLocaleString()}
                      </TableCell>

                      <TableCell>
                        {client.computedMissedMonths === 0 ? (
                          <Chip size="small" label="Current" color="success" variant="filled" />
                        ) : typeof client.computedPastDueLabel === "string" ? (
                          <Chip
                            size="small"
                            label={client.computedPastDueLabel}
                            color="error"
                            variant="outlined"
                          />
                        ) : (
                          client.computedPastDueLabel || "—"
                        )}
                      </TableCell>

                      <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
                        <Tooltip title="View">
                          <IconButton href={`/client/${client.id}`} size="small">
                            <VisibilityIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton onClick={() => handleEdit(client)} size="small">
                            <EditIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            onClick={() => setDeleteId(client.id)}
                            size="small"
                            sx={{ color: "error.main" }}
                          >
                            <DeleteIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}

                  {paginated.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 6, color: "text.secondary" }}>
                        No clients found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Pagination */}
            <TablePagination
              component="div"
              count={sorted.length}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[10, 25, 50]}
              labelRowsPerPage="Rows per page:"
            />
          </CardContent>
        </Card>

        {/* Edit Modal */}
        {editingClient && (
          <EditClient
            client={editingClient}
            onClose={() => setEditingClient(null)}
            onSave={() => setRefresh((f) => !f)}
          />
        )}

        {/* Delete dialog */}
        <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
          <DialogTitle>Delete Client</DialogTitle>
          <DialogContent>
            <Typography>Are you sure you want to delete this client?</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button color="error" variant="contained" onClick={handleDelete}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>

        {/* Toast */}
        <Snackbar
          open={toast.open}
          autoHideDuration={3000}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            onClose={() => setToast((t) => ({ ...t, open: false }))}
            severity={toast.type}
            variant="filled"
            sx={{ width: "100%" }}
          >
            {toast.msg}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}

export default ClientList;