// src/Reports/CohortReport.js
import React, { useMemo, useState } from "react";
import {
  Card, CardContent, CardHeader,
  Box, Stack, TextField, MenuItem,
  Table, TableBody, TableCell, TableHead, TableRow,
  TableContainer, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Chip, Switch, FormControlLabel, Tooltip
} from "@mui/material";
import * as XLSX from "xlsx";
import { buildCohorts } from "./utils/cohortCompute";

const WINDOWS = [30, 60, 90, 120]; // 120+ handled separately
const DAYS_PER_MONTH = 30.44;

// Only the first column is sticky
const FIRST_COL_WIDTH = 180;

export default function CohortReport({ clients }) {
  // Filters
  const [caseType, setCaseType] = useState("Any");
  const [caseStatus, setCaseStatus] = useState("Any");
  const [billingStatus, setBillingStatus] = useState("Any");
  const [cohortStart, setCohortStart] = useState(""); // YYYY-MM
  const [cohortEnd, setCohortEnd] = useState("");     // YYYY-MM

  // UI options
  const [dense, setDense] = useState(true);
  const [showBuckets, setShowBuckets] = useState(true);
  const [showRevenue, setShowRevenue] = useState(true); // 🔹 NEW: toggle for revenue columns

  const now = new Date();

  const caseTypes = useMemo(() => {
    const set = new Set();
    clients.forEach((c) => c.caseType && set.add(c.caseType));
    return ["Any", ...Array.from(set)];
  }, [clients]);

  const rows = useMemo(() => {
    const start = cohortStart
      ? new Date(
          Number(cohortStart.slice(0, 4)),
          Number(cohortStart.slice(5)) - 1,
          1
        )
      : null;
    const end = cohortEnd
      ? new Date(
          Number(cohortEnd.slice(0, 4)),
          Number(cohortEnd.slice(5)) - 1,
          1
        )
      : null;

    return buildCohorts(clients, {
      windows: WINDOWS,
      cohortStart: start,
      cohortEnd: end,
      now,
      filters: { caseType, caseStatus, billingStatus },
    });
  }, [clients, caseType, caseStatus, billingStatus, cohortStart, cohortEnd]);

  // Drilldown
  const [open, setOpen] = useState(false);
  const [drill, setDrill] = useState({ label: "", list: [] });
  const openDrill = (row, windowKey) => {
    const list =
      windowKey === "120plus"
        ? row.byWindow["120plus"]?.list || []
        : row.byWindow[windowKey]?.list || [];
    const title = windowKey === "120plus" ? "PD@120+" : `PD@${windowKey}d`;
    setDrill({ label: `${row.label} – ${title}`, list });
    setOpen(true);
  };

  // 🔹 NEW: helper to compute revenue per cohort row
  function computeRevenueForRow(row) {
    const clientsInCohort = row.clients || [];
    let totalInvoiced = 0;
    let totalCollected = 0;

    clientsInCohort.forEach((c) => {
      // Try multiple possible invoice fields, fall back safely
      const invoice =
        c.invoiceTotal ??
        c.totalInvoice ??
        (c.billing && c.billing.invoiceTotal) ??
        0;
      totalInvoiced += Number(invoice || 0);

      // Collected: prefer a precomputed total if you have it, else sum payments
      let collected = 0;
      if (c.totalPaidAfterInstallment != null) {
        collected = Number(c.totalPaidAfterInstallment || 0);
      } else if (Array.isArray(c.payments)) {
        collected = c.payments.reduce(
          (sum, p) => sum + Number(p.amount || 0),
          0
        );
      } else if (c.totalPaid != null) {
        collected = Number(c.totalPaid || 0);
      }

      totalCollected += collected;
    });

    const collectionPct =
      totalInvoiced > 0
        ? Math.round((totalCollected / totalInvoiced) * 100)
        : 0;

    return { totalInvoiced, totalCollected, collectionPct };
  }

  const exportGrid = () => {
    const data = rows.map((r) => {
      const size = r.totals.size || 0;
      const retentionPct = size
        ? Math.round((r.totals.current / size) * 100)
        : 0;
      const avgMonths =
        r.avgDaysToPD == null
          ? ""
          : (r.avgDaysToPD / DAYS_PER_MONTH).toFixed(1);

      const { totalInvoiced, totalCollected, collectionPct } =
        computeRevenueForRow(r); // 🔹 use same logic as UI

      const out = {
        "Sign Up Month": r.label,
        Clients: size,
        Paused: r.totals.paused,
        "Current (Now)": r.totals.current,
        "Past Due (Now)": r.totals.pastDue,
        "Retention %": `${retentionPct}%`,
        "Avg Months to PD": avgMonths,
        "Total Due (Now)": r.totalDueNow,
        "Total Invoiced": totalInvoiced,
        "Total Collected": totalCollected,
        "Collection %": `${collectionPct}%`,
      };

      if (showBuckets) {
        WINDOWS.forEach((w) => {
          const pd = r.byWindow[w]?.pd || 0;
          const pct = size ? Math.round((pd / size) * 100) : 0;
          out[`PD@${w}d (count)`] = pd;
          out[`PD@${w}d (%)`] = `${pct}%`;
        });
        const pd120p = r.byWindow["120plus"]?.pd || 0;
        const pct120p = size ? Math.round((pd120p / size) * 100) : 0;
        out["PD@120+ (count)"] = pd120p;
        out["PD@120+ (%)"] = `${pct120p}%`;
      }
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cohorts");
    XLSX.writeFile(wb, `cohort_analysis_${Date.now()}.xlsx`);
  };

  const exportDrill = () => {
    const data = drill.list.map((c) => ({
      Name: `${c.firstName || ""} ${c.lastName || ""}`.trim(),
      CaseType: c.caseType || "",
      CaseStatus: c.caseStatus || "",
      BillingStatus: c.status || "active",
      InitialPaymentDate: c.initialPaymentDate || "",
      MyCase: c.myCaseLink || "",
      ClientId: c.id,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Drilldown");
    XLSX.writeFile(wb, `cohort_drill_${Date.now()}.xlsx`);
  };

  // ------- UI helpers -------
  const stickyHeadCell = (txt) => (
    <TableCell
      sx={{
        position: "sticky",
        left: 0,
        zIndex: 4,
        backgroundColor: "background.paper",
        fontWeight: 700,
        minWidth: FIRST_COL_WIDTH,
        whiteSpace: "nowrap",
      }}
    >
      {txt}
    </TableCell>
  );

  const headerCell = (txt) => (
    <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
      {txt}
    </TableCell>
  );

  const chipColorForPct = (pct) => {
    if (pct === 0) return "success";
    if (pct >= 40) return "error";
    return "warning";
  };

  const chipCell = (count, size, onClick) => {
    const pct = size ? Math.round((count / size) * 100) : 0;
    return (
      <Chip
        size="small"
        label={`${count} (${pct}%)`}
        color={chipColorForPct(pct)}
        variant="outlined"
        sx={{ minWidth: 92, justifyContent: "center" }}
        onClick={count > 0 ? onClick : undefined}
      />
    );
  };

  const retentionChip = (pct) => {
    const color =
      pct >= 70 ? "success" : pct >= 40 ? "warning" : "error";
    return (
      <Chip
        size="small"
        label={`${pct}%`}
        color={color}
        variant="outlined"
        sx={{ minWidth: 72, justifyContent: "center" }}
      />
    );
  };

  const formatAvgMonths = (days) =>
    days == null ? "—" : (days / DAYS_PER_MONTH).toFixed(1);

  // column count for empty state
  const baseColsWithoutRevenue = 8; // Month + Clients + Paused + Current + PastDue + Retention + AvgMonths + TotalDue
  const revenueCols = showRevenue ? 3 : 0; // Total Invoiced, Total Collected, Collection %
  const bucketCols = showBuckets ? WINDOWS.length + 1 : 0; // PD windows + 120+
  const totalCols = baseColsWithoutRevenue + revenueCols + bucketCols + 1; // +Actions

  return (
    <Card sx={{ borderRadius: 3 }}>
      <CardHeader
        title="Cohort Analysis"
        subheader="How signup month, past-due behavior, and collections performance evolve over time."
        sx={{ "& .MuiCardHeader-title": { fontWeight: 700 }, pb: 0 }}
      />
      <CardContent>
        {/* Filters + Controls */}
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", md: "center" }}
          sx={{ mb: 2 }}
        >
          <TextField
            select
            label="Case Type"
            value={caseType}
            onChange={(e) => setCaseType(e.target.value)}
            size="small"
            sx={{ minWidth: 180 }}
          >
            {["Any", ...new Set(clients.map((c) => c.caseType).filter(Boolean))].map(
              (t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              )
            )}
          </TextField>

          <TextField
            select
            label="Case Status"
            value={caseStatus}
            onChange={(e) => setCaseStatus(e.target.value)}
            size="small"
            sx={{ minWidth: 160 }}
          >
            {["Any", "ACTIVE", "FILED", "APPROVED"].map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Billing Status"
            value={billingStatus}
            onChange={(e) => setBillingStatus(e.target.value)}
            size="small"
            sx={{ minWidth: 160 }}
          >
            {["Any", "Active", "Paused", "Closed"].map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Cohort Start (YYYY-MM)"
            type="month"
            value={cohortStart}
            onChange={(e) => setCohortStart(e.target.value)}
            size="small"
            sx={{ minWidth: 190 }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Cohort End (YYYY-MM)"
            type="month"
            value={cohortEnd}
            onChange={(e) => setCohortEnd(e.target.value)}
            size="small"
            sx={{ minWidth: 190 }}
            InputLabelProps={{ shrink: true }}
          />

          <Box flexGrow={1} />

          <FormControlLabel
            control={
              <Switch
                checked={showBuckets}
                onChange={(e) => setShowBuckets(e.target.checked)}
              />
            }
            label="Show aging buckets"
          />
          <FormControlLabel
            control={
              <Switch
                checked={showRevenue}
                onChange={(e) => setShowRevenue(e.target.checked)}
              />
            }
            label="Show revenue columns"
          />
          <FormControlLabel
            control={
              <Switch
                checked={dense}
                onChange={(e) => setDense(e.target.checked)}
              />
            }
            label="Dense rows"
          />

          <Button variant="outlined" onClick={exportGrid}>
            Export Grid
          </Button>
        </Stack>

        {/* Scroll container; sticky header + ONLY first column sticky */}
        <TableContainer
          sx={{
            overflowX: "auto",
            maxHeight: 560,
            borderRadius: 2,
            border: (theme) => `1px solid ${theme.palette.divider}`,
          }}
        >
          <Table
            stickyHeader
            size={dense ? "small" : "medium"}
            sx={{
              minWidth: showBuckets || showRevenue ? 1800 : 1100,
              "& th, & td": { whiteSpace: "nowrap" },
            }}
          >
            <TableHead>
              <TableRow>
                {stickyHeadCell("Sign Up Month")}
                {headerCell("Clients")}
                {headerCell("Paused")}
                {headerCell("Current (Now)")}
                {headerCell("Past Due (Now)")}
                {headerCell("Retention %")}
                {headerCell("Avg Months to PD")}
                {headerCell("Total Due (Now)")}
                {showRevenue && headerCell("Total Invoiced")}
                {showRevenue && headerCell("Total Collected")}
                {showRevenue && headerCell("Collection %")}
                {showBuckets && WINDOWS.map((w) => headerCell(`PD@${w}d`))}
                {showBuckets && headerCell("PD@120+")}
                {headerCell("Actions")}
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.map((r) => {
                const size = r.totals.size || 0;
                const retentionPct = size
                  ? Math.round((r.totals.current / size) * 100)
                  : 0;

                const {
                  totalInvoiced,
                  totalCollected,
                  collectionPct,
                } = computeRevenueForRow(r);

                return (
                  <TableRow key={r.key} hover>
                    <TableCell
                      sx={{
                        position: "sticky",
                        left: 0,
                        zIndex: 2,
                        backgroundColor: "background.paper",
                        minWidth: FIRST_COL_WIDTH,
                        fontWeight: 600,
                      }}
                    >
                      {r.label}
                    </TableCell>

                    <TableCell align="right">{size}</TableCell>
                    <TableCell align="right">{r.totals.paused}</TableCell>
                    <TableCell align="right">{r.totals.current}</TableCell>
                    <TableCell align="right">{r.totals.pastDue}</TableCell>
                    <TableCell align="right">
                      {retentionChip(retentionPct)}
                    </TableCell>
                    <TableCell align="right">
                      {formatAvgMonths(r.avgDaysToPD)}
                    </TableCell>
                    <TableCell align="right">
                      ${Number(r.totalDueNow || 0).toLocaleString()}
                    </TableCell>

                    {showRevenue && (
                      <TableCell align="right">
                        ${Number(totalInvoiced || 0).toLocaleString()}
                      </TableCell>
                    )}
                    {showRevenue && (
                      <TableCell align="right">
                        ${Number(totalCollected || 0).toLocaleString()}
                      </TableCell>
                    )}
                    {showRevenue && (
                      <TableCell align="right">{collectionPct}%</TableCell>
                    )}

                    {showBuckets &&
                      WINDOWS.map((w) => (
                        <TableCell key={w} align="right">
                          <Tooltip title="Click to see client list" arrow>
                            <span>
                              {chipCell(
                                r.byWindow[w]?.pd || 0,
                                size,
                                () => openDrill(r, w)
                              )}
                            </span>
                          </Tooltip>
                        </TableCell>
                      ))}

                    {showBuckets && (
                      <TableCell align="right">
                        <Tooltip title="Click to see client list" arrow>
                          <span>
                            {chipCell(
                              r.byWindow["120plus"]?.pd || 0,
                              size,
                              () => openDrill(r, "120plus")
                            )}
                          </span>
                        </Tooltip>
                      </TableCell>
                    )}

                    <TableCell align="center">
                      <Button
                        size="small"
                        onClick={() =>
                          (setDrill({
                            label: r.label + " – All Clients",
                            list: r.clients,
                          }),
                          setOpen(true))
                        }
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={totalCols}
                    align="center"
                    sx={{ py: 6, color: "text.secondary" }}
                  >
                    No cohorts found for selected filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Drilldown dialog */}
        <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
          <DialogTitle>{drill.label}</DialogTitle>
          <DialogContent dividers>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Client</TableCell>
                  <TableCell>Case Type</TableCell>
                  <TableCell>Case Status</TableCell>
                  <TableCell>Billing</TableCell>
                  <TableCell>Initial Payment</TableCell>
                  <TableCell>MyCase</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {drill.list.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell>
                      <a
                        href={`/client/${c.id}`}
                        style={{ textDecoration: "none" }}
                      >
                        {c.firstName} {c.lastName}
                      </a>
                    </TableCell>
                    <TableCell>{c.caseType || "—"}</TableCell>
                    <TableCell>{c.caseStatus || "—"}</TableCell>
                    <TableCell>
                      {(c.status || "active").toUpperCase()}
                    </TableCell>
                    <TableCell>
                      {c.initialPaymentDate || "—"}
                    </TableCell>
                    <TableCell>
                      {c.myCaseLink ? (
                        <a
                          href={c.myCaseLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(!drill.list || drill.list.length === 0) && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      align="center"
                      sx={{ py: 4, color: "text.secondary" }}
                    >
                      No clients.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DialogContent>
          <DialogActions>
            <Button onClick={exportDrill} variant="outlined">
              Export
            </Button>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}