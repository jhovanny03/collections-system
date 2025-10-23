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
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import * as XLSX from "xlsx";
import { computeBillingSnapshot } from "./utils/billingCompute";

const overdueOptions = ["Any", "Current", "Past Due"];
const paymentStatusOptions = ["Any", "Active", "Paused", "Closed"];

export default function ARAgingReport() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [caseType, setCaseType] = useState("Any");
  const [caseStatus, setCaseStatus] = useState("Any");
  const [overdue, setOverdue] = useState("Any");
  const [payStatus, setPayStatus] = useState("Any");

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
        // NEW
        invoiceBase: snap.invoiceBase || 0,
        adjNetToBalance: snap.adjNetToBalance || 0,
        invoiceEffective: snap.invoiceEffective || 0,
      };
    });
  }, [clients]);

  // Apply filters
  const filtered = useMemo(() => {
    let arr = [...rows];

    const q = search.trim().toLowerCase();
    if (q) {
      arr = arr.filter((r) => r.name.toLowerCase().includes(q));
    }
    if (caseType !== "Any") arr = arr.filter((r) => r.caseType === caseType);
    if (caseStatus !== "Any") arr = arr.filter((r) => r.caseStatus === caseStatus);

    if (overdue !== "Any") {
      if (overdue === "Current") arr = arr.filter((r) => (r.missedMonths || 0) === 0);
      if (overdue === "Past Due") arr = arr.filter((r) => (r.missedMonths || 0) > 0);
    }

    if (payStatus !== "Any") {
      arr = arr.filter((r) => r.paymentStatus === payStatus.toUpperCase());
    }

    // Default sort: largest amount due first
    arr.sort((a, b) => (b.amountDue || 0) - (a.amountDue || 0));
    return arr;
  }, [rows, search, caseType, caseStatus, overdue, payStatus]);

  const handleExport = () => {
    const exportRows = filtered.map((r) => ({
      Client: r.name,
      CaseType: r.caseType,
      CaseStatus: r.caseStatus,
      PaymentStatus: r.paymentStatus,
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
          select size="small" label="Case Type" sx={{ minWidth: 180 }}
          value={caseType} onChange={(e) => setCaseType(e.target.value)}
        >
          {caseTypes.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </TextField>
        <TextField
          select size="small" label="Case Status" sx={{ minWidth: 160 }}
          value={caseStatus} onChange={(e) => setCaseStatus(e.target.value)}
        >
          {caseStatuses.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </TextField>
        <TextField
          select size="small" label="Overdue" sx={{ minWidth: 140 }}
          value={overdue} onChange={(e) => setOverdue(e.target.value)}
        >
          {overdueOptions.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </TextField>
        <TextField
          select size="small" label="Payment Status" sx={{ minWidth: 170 }}
          value={payStatus} onChange={(e) => setPayStatus(e.target.value)}
        >
          {paymentStatusOptions.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </TextField>

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

      {/* Table */}
      {loading ? (
        <LinearProgress />
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ "& th": { fontWeight: 700, whiteSpace: "nowrap" } }}>
                <TableCell>Client</TableCell>
                <TableCell>Case Type</TableCell>
                <TableCell>Case Status</TableCell>
                <TableCell>Payment Status</TableCell>
                <TableCell align="right">Amount Due</TableCell>
                <TableCell>Months Past Due</TableCell>
                <TableCell align="right">Remaining Balance</TableCell>
                {/* NEW visibility into the invoice math */}
                <TableCell align="right">Invoice (Base)</TableCell>
                <TableCell align="right">Adj. to Balance (Net)</TableCell>
                <TableCell align="right">Invoice (Effective)</TableCell>
                <TableCell>Last Payment</TableCell>
                <TableCell>Next Expected</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.caseType}</TableCell>
                  <TableCell>{r.caseStatus}</TableCell>
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
                      <Chip size="small" label={r.missedMonths} color="error" variant="outlined" />
                    ) : (
                      <Chip size="small" label="Current" color="success" />
                    )}
                  </TableCell>
                  <TableCell align="right">{money(r.remainingBalance)}</TableCell>

                  {/* NEW columns */}
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
                  <TableCell colSpan={12} align="center" sx={{ py: 6, color: "text.secondary" }}>
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}