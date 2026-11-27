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
import { asDate, formatDate } from "../utils/dates";
import { callsByClient, creditFor, CREDIT_DAYS } from "../billing/callCredit";
import { useBook } from "../data/BookProvider";
import { isReceived } from "../billing/mycaseOverlay";

// ---------- helpers ----------
const toMoney = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const yyyyMmDd = (d) => d.toISOString().slice(0, 10);

const startOfDay = (yyyy_mm_dd) => asDate(`${yyyy_mm_dd}T00:00:00`);
const endOfDay = (yyyy_mm_dd) => asDate(`${yyyy_mm_dd}T23:59:59.999`);

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

  // Clients whose invoices are still to tag count their MyCase payments (mycaseOverlay), but
  // the sync files payment records only for tagged clients: add those payments here so
  // this report matches Home. Keyed by MyCase case id, from the prepared rows.
  const { rows: bookRows } = useBook();
  const untaggedByCase = useMemo(() => {
    const m = new Map();
    for (const r of bookRows) {
      if (r.source !== "MyCase, invoices to tag" || r.status === "closed") continue;
      const id = (String(r.myCaseLink || "").match(/court_cases\/(\d+)/) || [])[1];
      if (id) m.set(id, r);
    }
    return m;
  }, [bookRows]);
  const myCaseExtra = async (startStr, endStr, have) => {
    if (!untaggedByCase.size || (recordedByFilter !== "ALL" && recordedByFilter !== "MyCase sync")) return [];
    const snap = await getDocs(query(collection(db, "mycasePayments"), where("date", ">=", startStr), where("date", "<=", endStr)));
    const out = [];
    snap.forEach((d) => {
      const p = d.data();
      const r = untaggedByCase.get(String(p.caseId || ""));
      const id = `mycase_${p.id || d.id}`;
      if (!r || !isReceived(p) || have.has(id)) return;
      if (caseTypeFilter !== "ALL" && r.caseType !== caseTypeFilter) return;
      out.push({ id, clientId: r.id, clientName: r.name, caseType: r.caseType, caseStatus: r.caseStatus, amount: Number(p.amount), paymentDate: String(p.date).slice(0, 10), recordedBy: "MyCase sync", source: "mycase (invoices to tag)" });
    });
    return out;
  };
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

        // Payment-plan money, like Home: initial payments are counted apart (intake's).
        const tally = async (snap, a, b) => {
          const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          const extra = await myCaseExtra(a, b, new Set(docs.map((x) => x.id)));
          const all = [...docs, ...extra];
          const plan = all.filter((x) => x.kind !== "initial");
          return { total: plan.reduce((t, x) => t + Number(x.amount || 0), 0), count: plan.length, initial: all.filter((x) => x.kind === "initial").reduce((t, x) => t + Number(x.amount || 0), 0) };
        };
        const [tT, tY, t7] = await Promise.all([tally(snapToday, todayStr, todayStr), tally(snapYday, ydayStr, ydayStr), tally(snapLast7, last7StartStr, last7EndStr)]);

        if (!mounted) return;

        setDigest({
          todayTotal: tT.total, todayCount: tT.count, todayInitial: tT.initial,
          ydayTotal: tY.total, ydayCount: tY.count, ydayInitial: tY.initial,
          last7Total: t7.total, last7Count: t7.count, last7Initial: t7.initial,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildPaymentsQuery only reads the filters listed here
  }, [recordedByFilter, caseTypeFilter, untaggedByCase]);

  // ----- Table loader (range-selected + server-side filters) -----
  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setErr("");
      setPage(0);

      try {
        if (!startDate || !endDate) throw new Error("Missing date range.");
        if (asDate(startDate) > asDate(endDate)) {
          throw new Error("Start date cannot be after end date.");
        }

        const qy = buildPaymentsQuery(startDate, endDate);

        const snap = await getDocs(qy);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const extra = await myCaseExtra(startDate, endDate, new Set(data.map((x) => x.id)));

        if (!mounted) return;
        setRows([...data, ...extra].sort((a, b) => String(b.paymentDate || "").localeCompare(String(a.paymentDate || ""))));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildPaymentsQuery only reads the filters listed here
  }, [startDate, endDate, recordedByFilter, caseTypeFilter, untaggedByCase]);

  // "After a call by": RingCentral call that reached the client up to CREDIT_DAYS days before
  // the payment (src/billing/callCredit.js). Initial payments are left out.
  const [credit, setCredit] = useState(new Map());
  useEffect(() => {
    let alive = true;
    const days = rows.map((r) => String(r.paymentDate || "").slice(0, 10)).filter(Boolean).sort();
    if (!days.length) { setCredit(new Map()); return undefined; }
    const since = new Date(`${days[0]}T00:00:00`);
    since.setDate(since.getDate() - CREDIT_DAYS);
    const until = new Date(`${days[days.length - 1]}T23:59:59`);
    getDocs(query(collection(db, "ringcentralCalls"), where("at", ">=", since.toISOString()), where("at", "<=", until.toISOString())))
      .then((snap) => {
        if (!alive) return;
        const byClient = callsByClient(snap.docs.map((d) => d.data()));
        setCredit(new Map(rows.map((r) => [r.id, creditFor({ clientId: r.clientId, date: String(r.paymentDate || "").slice(0, 10), initial: r.kind === "initial" }, byClient)])));
      })
      .catch(() => alive && setCredit(new Map()));
    return () => { alive = false; };
  }, [rows]);

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
      "After a call by",
      "Payment Doc ID",
    ];

    const lines = [
      headers.map(toCsvValue).join(","),
      ...filteredRows.map((r) => {
        const paymentDate = formatDate(r.paymentDate, undefined, "");

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
          credit.get(r.id)?.by || "",
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
                {digest.loading ? " " : `${digest.todayCount} plan payment(s)${digest.todayInitial ? ` · + ${toMoney(digest.todayInitial)} initial` : ""}`}
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
                {digest.loading ? " " : `${digest.ydayCount} plan payment(s)${digest.ydayInitial ? ` · + ${toMoney(digest.ydayInitial)} initial` : ""}`}
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
                {digest.loading ? " " : `${digest.last7Count} plan payment(s)${digest.last7Initial ? ` · + ${toMoney(digest.last7Initial)} initial` : ""}`}
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
                    <TableCell sx={{ fontWeight: 800 }}>After a call by</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {paged.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Chip
                          size="small"
                          label={formatDate(r.paymentDate)}
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
                      <TableCell>
                        {credit.get(r.id) ? (
                          <Typography variant="body2" fontWeight={700} title={`Talked with the client ${credit.get(r.id).daysBefore ? `${credit.get(r.id).daysBefore} day(s)` : "the same day"} before this payment (RingCentral)`}>
                            {credit.get(r.id).by}
                            <Typography component="span" variant="caption" color="text.secondary">
                              {credit.get(r.id).daysBefore ? ` · ${credit.get(r.id).daysBefore}d before` : " · same day"}
                            </Typography>
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7}>
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