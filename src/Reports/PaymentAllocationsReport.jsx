// src/Reports/PaymentAllocationsReport.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  MenuItem,
  Stack,
  Chip,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Button,
} from "@mui/material";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import db from "../firebase";
import { computeCollectionsByPeriod } from "./utils/collectionsCompute";

// ---------- helpers ----------
const toMoney = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const monthKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const currentMonthKey = monthKey(new Date());

const currentMonthLabel = new Date().toLocaleString("default", {
  month: "long",
  year: "numeric",
});

const startOfMonthFromKey = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1);
};

const toExcelValue = (v) => {
  if (v === null || v === undefined) return "";
  return String(v);
};

const downloadExcelCompatibleFile = (filename, htmlTableString) => {
  const blob = new Blob([htmlTableString], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export default function PaymentAllocationsReport({ clients = [] }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [recordedByFilter, setRecordedByFilter] = useState("ALL");
  const [clientSearch, setClientSearch] = useState("");

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setErr("");

      try {
        const qy = query(
          collection(db, "paymentAllocations"),
          orderBy("dueMonthKey", "desc"),
          limit(5000)
        );

        const snap = await getDocs(qy);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (!mounted) return;
        setRows(data);
      } catch (e) {
        console.error(e);
        if (!mounted) return;
        setErr(e?.message || "Failed to load payment allocations.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const monthOptions = useMemo(() => {
    const map = new Map();

    rows.forEach((r) => {
      if (r.dueMonthKey && r.dueMonthLabel) {
        map.set(r.dueMonthKey, r.dueMonthLabel);
      }
    });

    if (!map.has(currentMonthKey)) {
      map.set(currentMonthKey, currentMonthLabel);
    }

    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, label]) => ({ key, label }));
  }, [rows]);

  const recordedByOptions = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => {
      if (r.recordedBy) set.add(r.recordedBy);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const selectedMonthRows = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();

    return rows.filter((r) => {
      const monthOk = r.dueMonthKey === selectedMonth;
      const recordedByOk =
        recordedByFilter === "ALL" || r.recordedBy === recordedByFilter;
      const clientOk =
        !q ||
        String(r.caseTitle || r.clientName || "")
          .toLowerCase()
          .includes(q);

      return monthOk && recordedByOk && clientOk;
    });
  }, [rows, selectedMonth, recordedByFilter, clientSearch]);

  const selectedMonthLabel = useMemo(() => {
    return (
      monthOptions.find((m) => m.key === selectedMonth)?.label ||
      currentMonthLabel
    );
  }, [monthOptions, selectedMonth]);

  const collectionsMonthSummary = useMemo(() => {
    const monthStart = startOfMonthFromKey(selectedMonth);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);

    const result = computeCollectionsByPeriod(clients, monthStart, monthEnd);
    const row = result.rows?.find((r) => r.ym === selectedMonth);

    return {
      expected: Number(row?.expected || 0),
      collected: Number(row?.collected || 0),
      collectionRate: Number(row?.collectionRate || 0),
    };
  }, [clients, selectedMonth]);

  const remainingToCollect = useMemo(() => {
    return Math.max(
      0,
      Number(collectionsMonthSummary.expected || 0) -
        Number(collectionsMonthSummary.collected || 0)
    );
  }, [collectionsMonthSummary]);

  const allocationSummary = useMemo(() => {
    return {
      allocationRows: selectedMonthRows.length,
      paidCount: selectedMonthRows.filter((r) => r.allocationStatus === "paid").length,
      partialCount: selectedMonthRows.filter((r) => r.allocationStatus === "partial").length,
    };
  }, [selectedMonthRows]);

  const handleExportExcel = () => {
    const title = `Payment Allocations - ${selectedMonthLabel}`;

    const html = `
      <html>
        <head>
          <meta charset="UTF-8" />
        </head>
        <body>
          <table border="1">
            <tr><th colspan="7">${toExcelValue(title)}</th></tr>
            <tr><td>Total Collected</td><td>${toExcelValue(toMoney(collectionsMonthSummary.collected))}</td></tr>
            <tr><td>Expected Amount</td><td>${toExcelValue(toMoney(collectionsMonthSummary.expected))}</td></tr>
            <tr><td>% Collected</td><td>${toExcelValue(`${collectionsMonthSummary.collectionRate}%`)}</td></tr>
            <tr><td>Remaining to Collect</td><td>${toExcelValue(toMoney(remainingToCollect))}</td></tr>
            <tr><td>Allocation Rows</td><td>${toExcelValue(allocationSummary.allocationRows)}</td></tr>
          </table>
          <br />
          <table border="1">
            <thead>
              <tr>
                <th>Case Title</th>
                <th>Payment Date</th>
                <th>Applied</th>
                <th>Expected</th>
                <th>Status</th>
                <th>Recorded By</th>
                <th>Case</th>
              </tr>
            </thead>
            <tbody>
              ${selectedMonthRows
                .map(
                  (r) => `
                <tr>
                  <td>${toExcelValue(r.caseTitle || r.clientName || "—")}</td>
                  <td>${toExcelValue(
                    r.paymentDate ? new Date(r.paymentDate).toLocaleDateString() : "—"
                  )}</td>
                  <td>${toExcelValue(toMoney(r.appliedAmount))}</td>
                  <td>${toExcelValue(toMoney(r.expectedInstallmentAmount))}</td>
                  <td>${toExcelValue(r.allocationStatus || "—")}</td>
                  <td>${toExcelValue(r.recordedBy || "—")}</td>
                  <td>${toExcelValue(
                    `${r.caseType || "—"} / ${r.caseStatus || "—"}`
                  )}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const fileName = `payment_allocations_${selectedMonth}.xls`;
    downloadExcelCompatibleFile(fileName, html);
  };

  return (
    <Box>
      {/* Summary for selected month only */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={3}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Total Collected
              </Typography>
              <Typography sx={{ fontWeight: 900, fontSize: 28 }}>
                {toMoney(collectionsMonthSummary.collected)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedMonthLabel}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Expected Amount
              </Typography>
              <Typography sx={{ fontWeight: 900, fontSize: 28 }}>
                {toMoney(collectionsMonthSummary.expected)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Based on Collections logic
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                % Collected
              </Typography>
              <Typography sx={{ fontWeight: 900, fontSize: 28 }}>
                {collectionsMonthSummary.collectionRate}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Selected month
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Remaining to Collect
              </Typography>
              <Typography sx={{ fontWeight: 900, fontSize: 28 }}>
                {toMoney(remainingToCollect)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {allocationSummary.allocationRows} allocation row(s)
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ borderRadius: 2, mb: 2 }}>
        <CardContent>
          <Typography sx={{ fontWeight: 800, mb: 1.5 }}>
            Payment Allocations
          </Typography>

          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              label="Month"
              select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              size="small"
              sx={{ minWidth: 220 }}
            >
              {monthOptions.map((m) => (
                <MenuItem key={m.key} value={m.key}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>

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
              label="Search Case Title"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              size="small"
              sx={{ minWidth: 260 }}
              placeholder="Type a case title…"
            />

            <Button
              variant="contained"
              onClick={handleExportExcel}
              disabled={loading || selectedMonthRows.length === 0}
            >
              Export Excel
            </Button>
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Showing allocations for the selected month only. Default view is the current month.
          </Typography>
        </CardContent>
      </Card>

      {/* States */}
      {loading && (
        <Typography sx={{ p: 2 }} color="text.secondary">
          Loading payment allocations…
        </Typography>
      )}

      {err && !loading && (
        <Typography sx={{ p: 2 }} color="error">
          {err}
        </Typography>
      )}

      {!loading && !err && selectedMonthRows.length === 0 && (
        <Card sx={{ borderRadius: 2 }}>
          <CardContent>
            <Typography color="text.secondary">
              No payment allocations found for {selectedMonthLabel}.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Single-month table */}
      {!loading && !err && selectedMonthRows.length > 0 && (
        <Card sx={{ borderRadius: 2 }}>
          <CardContent>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: { xs: "flex-start", md: "center" },
                flexDirection: { xs: "column", md: "row" },
                gap: 1.5,
                mb: 1.5,
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 20 }}>
                  {selectedMonthLabel}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedMonthRows.length} allocation row(s)
                </Typography>
              </Box>

              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip
                  label={`Collected: ${toMoney(collectionsMonthSummary.collected)}`}
                  color="success"
                  variant="outlined"
                />
                <Chip
                  label={`Expected: ${toMoney(collectionsMonthSummary.expected)}`}
                  variant="outlined"
                />
                <Chip
                  label={`Remaining: ${toMoney(remainingToCollect)}`}
                  variant="outlined"
                />
              </Stack>
            </Box>

            <Divider sx={{ mb: 2 }} />

            <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800 }}>Case Title</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Payment Date</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Applied</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Expected</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Recorded By</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Case</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {selectedMonthRows.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell>{r.caseTitle || r.clientName || "—"}</TableCell>
                      <TableCell>
                        {r.paymentDate
                          ? new Date(r.paymentDate).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell>{toMoney(r.appliedAmount)}</TableCell>
                      <TableCell>{toMoney(r.expectedInstallmentAmount)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={r.allocationStatus || "—"}
                          color={
                            r.allocationStatus === "paid"
                              ? "success"
                              : r.allocationStatus === "partial"
                              ? "warning"
                              : "default"
                          }
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{r.recordedBy || "—"}</TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {(r.caseType || "—") + " / " + (r.caseStatus || "—")}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}