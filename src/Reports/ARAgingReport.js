// src/Reports/ARAgingReport.js
import React, { useEffect, useMemo, useState } from "react";
import db from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import {
  Box,
  Stack,
  Button,
  TextField,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
  TablePagination,
  TableSortLabel,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import * as XLSX from "xlsx";
import { computeBillingSnapshot } from "./utils/billingCompute";

const overdueOptions = ["Any", "Current", "Past Due"];
const paymentStatusOptions = ["Any", "Active", "Paused", "Closed"];
const pastDueBucketOptions = ["Any", "1 month", "2 months", "3 months", "4+ months"];

// ------- helpers for case age -------
const parseInitialPaymentDate = (raw) => {
  if (!raw) return null;
  // Firestore timestamp
  if (raw.seconds) {
    const d = new Date(raw.seconds * 1000);
    return isNaN(d) ? null : d;
  }
  // String 'YYYY-MM-DD' or Date-like
  const d = new Date(raw);
  return isNaN(d) ? null : d;
};

const computeCaseAgeMonths = (client) => {
  const start = parseInitialPaymentDate(client.initialPaymentDate);
  if (!start) return null;

  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let diff = years * 12 + months;

  // Only count *full* months
  if (now.getDate() < start.getDate()) diff -= 1;

  return Math.max(0, diff);
};

export default function ARAgingReport() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [caseType, setCaseType] = useState("Any");
  const [caseStatus, setCaseStatus] = useState("Any");
  const [overdue, setOverdue] = useState("Any");
  const [pastDueBucket, setPastDueBucket] = useState("Any"); // ✅ NEW
  const [payStatus, setPayStatus] = useState("Any");
  const [showPaidInFull, setShowPaidInFull] = useState(false);

  // Sorting
  const [sortBy, setSortBy] = useState("amountDue"); // default sort
  const [sortDir, setSortDir] = useState("desc"); // 'asc' | 'desc'

  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const snap = await getDocs(collection(db, "clients"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setClients(list);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const caseTypes = useMemo(() => {
    const set = new Set();
    clients.forEach((c) => c.caseType && set.add(c.caseType));
    return ["Any", ...Array.from(set)];
  }, [clients]);

  const caseStatuses = useMemo(() => {
    const set = new Set();
    clients.forEach((c) => c.caseStatus && set.add(c.caseStatus));
    return ["Any", ...Array.from(set)];
  }, [clients]);

  // Build rows using our centralized snapshot
  const rows = useMemo(() => {
    const asOf = new Date();
    return clients.map((c) => {
      const snap = computeBillingSnapshot(c, asOf);

      const isActiveCase =
        (c.caseStatus || "").toString().toUpperCase() === "ACTIVE";
      const caseAgeMonths = isActiveCase ? computeCaseAgeMonths(c) : null;

      return {
        id: c.id,
        name: `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.id,
        caseType: c.caseType || "—",
        caseStatus: c.caseStatus || "—",
        paymentStatus: String(snap.status || "active").toUpperCase(),
        amountDue: snap.amountDue || 0,
        missedMonths: snap.missedMonths || 0,
        remainingBalance: snap.remainingBalance || 0,
        lastPaymentDate: snap.lastPayment?.date || "—",
        lastPaymentAmount: snap.lastPayment?.amount || 0,
        nextExpectedLabel: snap.nextExpectedLabel || "—",
        // invoice math fields
        invoiceBase: snap.invoiceBase || 0,
        adjNetToBalance: snap.adjNetToBalance || 0,
        invoiceEffective: snap.invoiceEffective || 0,
        // Case age in months (only for ACTIVE cases)
        caseAgeMonths,
      };
    });
  }, [clients]);

  // Sorting handler (fixed)
  const handleSort = (columnKey) => {
    if (sortBy === columnKey) {
      // toggle direction
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      // new column: start ascending
      setSortBy(columnKey);
      setSortDir("asc");
    }
  };

  // Apply filters + sorting
  const filtered = useMemo(() => {
    let arr = [...rows];

    const q = search.trim().toLowerCase();
    if (q) {
      arr = arr.filter((r) => r.name.toLowerCase().includes(q));
    }
    if (caseType !== "Any") arr = arr.filter((r) => r.caseType === caseType);
    if (caseStatus !== "Any")
      arr = arr.filter((r) => r.caseStatus === caseStatus);

    if (overdue !== "Any") {
      if (overdue === "Current")
        arr = arr.filter((r) => (r.missedMonths || 0) === 0);
      if (overdue === "Past Due")
        arr = arr.filter((r) => (r.missedMonths || 0) > 0);
    }

    // ✅ NEW: Past Due bucket filter (1,2,3,4+ months)
    if (pastDueBucket !== "Any") {
      arr = arr.filter((r) => {
        const m = r.missedMonths || 0;
        if (pastDueBucket === "1 month") return m === 1;
        if (pastDueBucket === "2 months") return m === 2;
        if (pastDueBucket === "3 months") return m === 3;
        if (pastDueBucket === "4+ months") return m >= 4;
        return true;
      });
    }

    if (payStatus !== "Any") {
      arr = arr.filter((r) => r.paymentStatus === payStatus.toUpperCase());
    }

    if (showPaidInFull) {
      // Remaining balance <= 0 and not closed
      arr = arr.filter(
        (r) => (r.remainingBalance || 0) <= 0 && r.paymentStatus !== "CLOSED"
      );
    }

    // Sort
    const dir = sortDir === "asc" ? 1 : -1;

    const getVal = (row) => {
      switch (sortBy) {
        case "name":
          return row.name.toLowerCase();
        case "caseType":
          return row.caseType.toLowerCase();
        case "caseStatus":
          return row.caseStatus.toLowerCase();
        case "paymentStatus":
          return row.paymentStatus.toLowerCase();
        default:
          return row[sortBy] ?? 0;
      }
    };

    arr.sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);

      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * dir;
      }
      return (Number(av) - Number(bv)) * dir;
    });

    return arr;
  }, [
    rows,
    search,
    caseType,
    caseStatus,
    overdue,
    pastDueBucket, // ✅ NEW
    payStatus,
    showPaidInFull,
    sortBy,
    sortDir,
  ]);

  // ✅ NEW: Results summary line for current filtered view
  const summary = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.count += 1;
        acc.amountDue += r.amountDue || 0;
        acc.remaining += r.remainingBalance || 0;
        return acc;
      },
      { count: 0, amountDue: 0, remaining: 0 }
    );
  }, [filtered]);

  // Paginated rows
  const paginated = useMemo(() => {
    const start = page * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const handleExport = () => {
    const exportRows = filtered.map((r) => ({
      Client: r.name,
      CaseType: r.caseType,
      CaseStatus: r.caseStatus,
      BillingStatus: r.paymentStatus,
      CaseAgeMonths: r.caseAgeMonths ?? "",
      AmountDue: r.amountDue,
      MissedMonths: r.missedMonths,
      RemainingBalance: r.remainingBalance,
      InvoiceBase: r.invoiceBase,
      AdjNetToBalance: r.adjNetToBalance,
      InvoiceEffective: r.invoiceEffective,
      LastPaymentDate: r.lastPaymentDate,
      LastPaymentAmount: r.lastPaymentAmount,
      NextExpectedMonth: r.nextExpectedLabel,
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Aging");
    XLSX.writeFile(wb, "AR_Aging.xlsx");
  };

  const money = (n) => `$${Number(n || 0).toLocaleString()}`;

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setPageSize(parseInt(event.target.value, 10));
    setPage(0);
  };

  return (
    <Box>
      {/* Filters */}
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          placeholder="Search by client name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          sx={{ width: { xs: "100%", md: 280 } }}
        />
        <TextField
          select
          size="small"
          label="Case Type"
          sx={{ minWidth: 180 }}
          value={caseType}
          onChange={(e) => setCaseType(e.target.value)}
        >
          {caseTypes.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Case Status"
          sx={{ minWidth: 160 }}
          value={caseStatus}
          onChange={(e) => setCaseStatus(e.target.value)}
        >
          {caseStatuses.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Overdue"
          sx={{ minWidth: 140 }}
          value={overdue}
          onChange={(e) => setOverdue(e.target.value)}
        >
          {overdueOptions.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>

        {/* ✅ NEW: Past Due (Months) */}
        <TextField
          select
          size="small"
          label="Past Due (Months)"
          sx={{ minWidth: 160 }}
          value={pastDueBucket}
          onChange={(e) => setPastDueBucket(e.target.value)}
        >
          {pastDueBucketOptions.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          label="Payment Status"
          sx={{ minWidth: 170 }}
          value={payStatus}
          onChange={(e) => setPayStatus(e.target.value)}
        >
          {paymentStatusOptions.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>

        <FormControlLabel
          control={
            <Checkbox
              checked={showPaidInFull}
              onChange={(e) => setShowPaidInFull(e.target.checked)}
              size="small"
            />
          }
          label="Show paid in full only"
        />

        <Box flexGrow={1} />
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={handleExport}
          sx={{ alignSelf: { xs: "stretch", md: "center" } }}
        >
          Export Excel
        </Button>
      </Stack>

      {/* ✅ NEW: Results summary */}
      <Box sx={{ mb: 1.5, color: "text.secondary", fontSize: 14 }}>
        <strong>{summary.count}</strong> clients •{" "}
        <strong>${summary.amountDue.toLocaleString()}</strong> due •{" "}
        <strong>${summary.remaining.toLocaleString()}</strong> remaining balance
      </Box>

      {/* Table */}
      {loading ? (
        <LinearProgress />
      ) : (
        <Paper sx={{ borderRadius: 2 }}>
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ "& th": { fontWeight: 700, whiteSpace: "nowrap" } }}>
                  <TableCell sortDirection={sortBy === "name" ? sortDir : false}>
                    <TableSortLabel
                      active={sortBy === "name"}
                      direction={sortBy === "name" ? sortDir : "asc"}
                      onClick={() => handleSort("name")}
                    >
                      Client
                    </TableSortLabel>
                  </TableCell>

                  <TableCell sortDirection={sortBy === "caseType" ? sortDir : false}>
                    <TableSortLabel
                      active={sortBy === "caseType"}
                      direction={sortBy === "caseType" ? sortDir : "asc"}
                      onClick={() => handleSort("caseType")}
                    >
                      Case Type
                    </TableSortLabel>
                  </TableCell>

                  <TableCell sortDirection={sortBy === "caseStatus" ? sortDir : false}>
                    <TableSortLabel
                      active={sortBy === "caseStatus"}
                      direction={sortBy === "caseStatus" ? sortDir : "asc"}
                      onClick={() => handleSort("caseStatus")}
                    >
                      Case Status
                    </TableSortLabel>
                  </TableCell>

                  <TableCell
                    align="right"
                    sortDirection={sortBy === "caseAgeMonths" ? sortDir : false}
                  >
                    <TableSortLabel
                      active={sortBy === "caseAgeMonths"}
                      direction={sortBy === "caseAgeMonths" ? sortDir : "asc"}
                      onClick={() => handleSort("caseAgeMonths")}
                    >
                      Case Age (mo)
                    </TableSortLabel>
                  </TableCell>

                  <TableCell sortDirection={sortBy === "paymentStatus" ? sortDir : false}>
                    <TableSortLabel
                      active={sortBy === "paymentStatus"}
                      direction={sortBy === "paymentStatus" ? sortDir : "asc"}
                      onClick={() => handleSort("paymentStatus")}
                    >
                      Payment Status
                    </TableSortLabel>
                  </TableCell>

                  <TableCell
                    align="right"
                    sortDirection={sortBy === "amountDue" ? sortDir : false}
                  >
                    <TableSortLabel
                      active={sortBy === "amountDue"}
                      direction={sortBy === "amountDue" ? sortDir : "asc"}
                      onClick={() => handleSort("amountDue")}
                    >
                      Amount Due
                    </TableSortLabel>
                  </TableCell>

                  <TableCell sortDirection={sortBy === "missedMonths" ? sortDir : false}>
                    <TableSortLabel
                      active={sortBy === "missedMonths"}
                      direction={sortBy === "missedMonths" ? sortDir : "asc"}
                      onClick={() => handleSort("missedMonths")}
                    >
                      Months Past Due
                    </TableSortLabel>
                  </TableCell>

                  <TableCell
                    align="right"
                    sortDirection={sortBy === "remainingBalance" ? sortDir : false}
                  >
                    <TableSortLabel
                      active={sortBy === "remainingBalance"}
                      direction={sortBy === "remainingBalance" ? sortDir : "asc"}
                      onClick={() => handleSort("remainingBalance")}
                    >
                      Remaining Balance
                    </TableSortLabel>
                  </TableCell>

                  <TableCell align="right" sortDirection={sortBy === "invoiceBase" ? sortDir : false}>
                    <TableSortLabel
                      active={sortBy === "invoiceBase"}
                      direction={sortBy === "invoiceBase" ? sortDir : "asc"}
                      onClick={() => handleSort("invoiceBase")}
                    >
                      Invoice (Base)
                    </TableSortLabel>
                  </TableCell>

                  <TableCell align="right" sortDirection={sortBy === "adjNetToBalance" ? sortDir : false}>
                    <TableSortLabel
                      active={sortBy === "adjNetToBalance"}
                      direction={sortBy === "adjNetToBalance" ? sortDir : "asc"}
                      onClick={() => handleSort("adjNetToBalance")}
                    >
                      Adj. to Balance (Net)
                    </TableSortLabel>
                  </TableCell>

                  <TableCell align="right" sortDirection={sortBy === "invoiceEffective" ? sortDir : false}>
                    <TableSortLabel
                      active={sortBy === "invoiceEffective"}
                      direction={sortBy === "invoiceEffective" ? sortDir : "asc"}
                      onClick={() => handleSort("invoiceEffective")}
                    >
                      Invoice (Effective)
                    </TableSortLabel>
                  </TableCell>

                  <TableCell>Last Payment</TableCell>
                  <TableCell>Next Expected</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {paginated.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.caseType}</TableCell>
                    <TableCell>{r.caseStatus}</TableCell>
                    <TableCell align="right">
                      {r.caseAgeMonths != null ? r.caseAgeMonths : "—"}
                    </TableCell>
                    <TableCell>
                      {r.paymentStatus === "CLOSED" ? (
                        <Chip size="small" label="Closed" variant="outlined" />
                      ) : r.paymentStatus === "PAUSED" ? (
                        <Chip size="small" label="Paused" color="warning" />
                      ) : (
                        <Chip size="small" label="Active" color="success" />
                      )}
                    </TableCell>
                    <TableCell align="right">{money(r.amountDue)}</TableCell>
                    <TableCell>
                      {r.missedMonths ? (
                        <Chip
                          size="small"
                          label={r.missedMonths}
                          color="error"
                          variant="outlined"
                        />
                      ) : (
                        <Chip size="small" label="Current" color="success" />
                      )}
                    </TableCell>
                    <TableCell align="right">{money(r.remainingBalance)}</TableCell>

                    <TableCell align="right">{money(r.invoiceBase)}</TableCell>
                    <TableCell align="right">{money(r.adjNetToBalance)}</TableCell>
                    <TableCell align="right">{money(r.invoiceEffective)}</TableCell>

                    <TableCell>
                      {r.lastPaymentDate === "—"
                        ? "—"
                        : `${r.lastPaymentDate} – ${money(r.lastPaymentAmount)}`}
                    </TableCell>
                    <TableCell>{r.nextExpectedLabel}</TableCell>
                  </TableRow>
                ))}

                {filtered.length === 0 && !loading && (
                  <TableRow>
                    <TableCell
                      colSpan={13}
                      align="center"
                      sx={{ py: 6, color: "text.secondary" }}
                    >
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination controls */}
          <TablePagination
            component="div"
            count={filtered.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={pageSize}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </Paper>
      )}
    </Box>
  );
}