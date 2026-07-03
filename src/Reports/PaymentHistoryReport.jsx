// src/Reports/PaymentHistoryReport.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Divider,
  Grid,
  TextField,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  TablePagination,
  Chip,
  Stack,
  Button,
  MenuItem,
} from "@mui/material";

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import db from "../firebase";

// ---------- helpers ----------
const toMoney = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const yyyyMmDd = (d) => d.toISOString().slice(0, 10);

const startOfDay = (yyyy_mm_dd) => new Date(`${yyyy_mm_dd}T00:00:00`);
const endOfDay = (yyyy_mm_dd) => new Date(`${yyyy_mm_dd}T23:59:59.999`);

const addDays = (d, days) => new Date(d.getTime() + days * 24 * 60 * 60 * 1000);

// --- CSV helpers ---
const toCsvValue = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const downloadCsv = (filename, csvString) => {
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
};

export default function PaymentHistoryReport() {
  // Default: last 7 days
  const todayDate = useMemo(() => new Date(), []);
  const defaultEnd = yyyyMmDd(todayDate);
  const defaultStart = yyyyMmDd(addDays(todayDate, -6));

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  // Server-side filters (hybrid)
  const [recordedByFilter, setRecordedByFilter] = useState("ALL");
  const [caseTypeFilter, setCaseTypeFilter] = useState("ALL");

  // Client-side search
  const [clientSearch, setClientSearch] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Digest
  const [digest, setDigest] = useState({
    todayTotal: 0,
    todayCount: 0,
    ydayTotal: 0,
    ydayCount: 0,
    last7Total: 0,
    last7Count: 0,
    loading: true,
  });

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const setQuickRange = (type) => {
    const t = new Date();
    if (type === "today") {
      const d = yyyyMmDd(t);
      setStartDate(d);
      setEndDate(d);
    } else if (type === "yesterday") {
      const y = yyyyMmDd(addDays(t, -1));
      setStartDate(y);
      setEndDate(y);
    } else if (type === "last7") {
      setStartDate(yyyyMmDd(addDays(t, -6)));
      setEndDate(yyyyMmDd(t));
    } else if (type === "thisMonth") {
      const start = new Date(t.getFullYear(), t.getMonth(), 1);
      const end = new Date(t.getFullYear(), t.getMonth() + 1, 0);
      setStartDate(yyyyMmDd(start));
      setEndDate(yyyyMmDd(end));
    }
  };

  // Build Firestore query with optional equality filters
  const buildPaymentsQuery = (startStr, endStr) => {
    const startTs = Timestamp.fromDate(startOfDay(startStr));
    const endTs = Timestamp.fromDate(endOfDay(endStr));

    const clauses = [
      where("paymentDateTs", ">=", startTs),
      where("paymentDateTs", "<=", endTs),
    ];

    if (recordedByFilter !== "ALL") {
      clauses.push(where("recordedBy", "==", recordedByFilter));
    }
    if (caseTypeFilter !== "ALL") {
      clauses.push(where("caseType", "==", caseTypeFilter));
    }

    // NOTE: If Firestore ever complains "requires an index",
    // it will give you a link to create it (payments + paymentDateTs + recordedBy/caseType).
    return query(
      collection(db, "payments"),
      ...clauses,
      orderBy("paymentDateTs", "desc"),
      limit(5000)
    );
  };

  // ----- Digest loader (Today / Yesterday / Last 7) -----
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setDigest((d) => ({ ...d, loading: true }));

        const t = new Date();
        const todayStr = yyyyMmDd(t);
        const ydayStr = yyyyMmDd(addDays(t, -1));
        const last7StartStr = yyyyMmDd(addDays(t, -6));
        const last7EndStr = todayStr;

        const [snapToday, snapYday, snapLast7] = await Promise.all([
          getDocs(buildPaymentsQuery(todayStr, todayStr)),
          getDocs(buildPaymentsQuery(ydayStr, ydayStr)),
          getDocs(buildPaymentsQuery(last7StartStr, last7EndStr)),
        ]);

        const sumSnap = (snap) =>
          snap.docs.reduce((sum, d) => sum + Number(d.data()?.amount || 0), 0);

        if (!mounted) return;

        setDigest({
          todayTotal: sumSnap(snapToday),
          todayCount: snapToday.size,
          ydayTotal: sumSnap(snapYday),
          ydayCount: snapYday.size,
          last7Total: sumSnap(snapLast7),
          last7Count: snapLast7.size,
          loading: false,
        });
      } catch (e) {
        console.error("Digest load failed:", e);
        if (!mounted) return;
        setDigest((d) => ({ ...d, loading: false }));
      }
    })();

    return () => {
      mounted = false;
    };
    // refresh digest when server-side filters change
  }, [recordedByFilter, caseTypeFilter]);

  // ----- Table loader (range-selected + server-side filters) -----
  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setErr("");
      setPage(0);

      try {
        if (!startDate || !endDate) throw new Error("Missing date range.");
        if (new Date(startDate) > new Date(endDate)) {
          throw new Error("Start date cannot be after end date.");
        }

        const qy = buildPaymentsQuery(startDate, endDate);

        const snap = await getDocs(qy);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (!mounted) return;
        setRows(data);
      } catch (e) {
        console.error(e);
        if (!mounted) return;
        setErr(e?.message || "Failed to load payments.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [startDate, endDate, recordedByFilter, caseTypeFilter]);

  // Options for dropdowns (derived from currently loaded rows)
  const recordedByOptions = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => {
      if (r.recordedBy) set.add(r.recordedBy);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const caseTypeOptions = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => {
      if (r.caseType) set.add(r.caseType);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  // Client-side search filter
  const filteredRows = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      String(r.clientName || "").toLowerCase().includes(q)
    );
  }, [rows, clientSearch]);

  const totals = useMemo(() => {
    const total = filteredRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    return { count: filteredRows.length, total };
  }, [filteredRows]);

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    const end = start + rowsPerPage;
    return filteredRows.slice(start, end);
  }, [filteredRows, page, rowsPerPage]);

  // ----- CSV export (current filtered rows) -----
  const handleExportCsv = () => {
    const headers = [
      "Payment Date",
      "Amount",
      "Client Name",
      "Client ID",
      "Case Type",
      "Case Status",
      "Recorded By",
      "Recorded At",
      "Source",
      "Payment Doc ID",
    ];

    const lines = [
      headers.map(toCsvValue).join(","),
      ...filteredRows.map((r) => {
        const paymentDate = r.paymentDate
          ? new Date(r.paymentDate).toLocaleDateString()
          : "";

        const amount = Number(r.amount || 0).toFixed(2);

        return [
          paymentDate,
          amount,
          r.clientName || "",
          r.clientId || "",
          r.caseType || "",
          r.caseStatus || "",
          r.recordedBy || "",
          r.recordedAt || "",
          r.source || "manual",
          r.id || "",
        ]
          .map(toCsvValue)
          .join(",");
      }),
    ];

    const csv = lines.join("\n");
    const filename = `payment_history_${startDate}_to_${endDate}.csv`;
    downloadCsv(filename, csv);
  };

  return (
    <Box>
      {/* Digest cards */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Collected Today
              </Typography>
              <Typography sx={{ fontWeight: 900, fontSize: 26 }}>
                {digest.loading ? "…" : toMoney(digest.todayTotal)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {digest.loading ? " " : `${digest.todayCount} payment(s)`}
              </Typography>

              <Box sx={{ mt: 1.5 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setQuickRange("today")}
                >
                  View Today
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Collected Yesterday
              </Typography>
              <Typography sx={{ fontWeight: 900, fontSize: 26 }}>
                {digest.loading ? "…" : toMoney(digest.ydayTotal)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {digest.loading ? " " : `${digest.ydayCount} payment(s)`}
              </Typography>

              <Box sx={{ mt: 1.5 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setQuickRange("yesterday")}
                >
                  View Yesterday
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Collected Last 7 Days
              </Typography>
              <Typography sx={{ fontWeight: 900, fontSize: 26 }}>
                {digest.loading ? "…" : toMoney(digest.last7Total)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {digest.loading ? " " : `${digest.last7Count} payment(s)`}
              </Typography>

              <Box sx={{ mt: 1.5, display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setQuickRange("last7")}
                >
                  View Last 7
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setQuickRange("thisMonth")}
                >
                  This Month
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Totals FIRST, Filters BELOW */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Total Collected (Filtered)
              </Typography>
              <Typography sx={{ fontWeight: 900, fontSize: 28 }}>
                {toMoney(totals.total)}
              </Typography>

              <Divider sx={{ my: 1.5 }} />

              <Typography color="text.secondary" variant="body2">
                Payments Count
              </Typography>
              <Typography sx={{ fontWeight: 800, fontSize: 22 }}>
                {totals.count.toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography sx={{ fontWeight: 800, mb: 1 }}>
                Payment History
              </Typography>

              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  label="Start Date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  sx={{ minWidth: 180 }}
                />
                <TextField
                  label="End Date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  sx={{ minWidth: 180 }}
                />

                <TextField
                  label="Recorded By"
                  select
                  value={recordedByFilter}
                  onChange={(e) => setRecordedByFilter(e.target.value)}
                  size="small"
                  sx={{ minWidth: 220 }}
                >
                  <MenuItem value="ALL">All</MenuItem>
                  {recordedByOptions.map((u) => (
                    <MenuItem key={u} value={u}>
                      {u}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  label="Case Type"
                  select
                  value={caseTypeFilter}
                  onChange={(e) => setCaseTypeFilter(e.target.value)}
                  size="small"
                  sx={{ minWidth: 160 }}
                >
                  <MenuItem value="ALL">All</MenuItem>
                  {caseTypeOptions.map((ct) => (
                    <MenuItem key={ct} value={ct}>
                      {ct}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  label="Search Client"
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    setPage(0);
                  }}
                  size="small"
                  sx={{ minWidth: 220 }}
                  placeholder="Type a name…"
                />

                <Button
                  variant="contained"
                  onClick={handleExportCsv}
                  disabled={loading || filteredRows.length === 0}
                >
                  Export CSV
                </Button>
              </Stack>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Date + Recorded By + Case Type filter in Firestore; Client search filters locally.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {loading && (
        <Typography sx={{ p: 2 }} color="text.secondary">
          Loading payments…
        </Typography>
      )}

      {err && !loading && (
        <Typography sx={{ p: 2 }} color="error">
          {err}
        </Typography>
      )}

      {!loading && !err && (
        <Card sx={{ borderRadius: 2 }}>
          <CardContent sx={{ pb: 0 }}>
            <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800 }}>Payment Date</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Amount</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Client</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Case</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Recorded By</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Source</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {paged.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Chip
                          size="small"
                          label={
                            r.paymentDate
                              ? new Date(r.paymentDate).toLocaleDateString()
                              : "—"
                          }
                        />
                      </TableCell>
                      <TableCell>{toMoney(r.amount)}</TableCell>
                      <TableCell>{r.clientName || "—"}</TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {(r.caseType || "—") + " / " + (r.caseStatus || "—")}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {r.recordedBy || "—"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={r.source || "manual"}
                        />
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Box
                          sx={{
                            py: 3,
                            textAlign: "center",
                            color: "text.secondary",
                          }}
                        >
                          No payments found for this range / filters.
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              component="div"
              count={filteredRows.length}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[25, 50, 100]}
            />
          </CardContent>
        </Card>
      )}
    </Box>
  );
}