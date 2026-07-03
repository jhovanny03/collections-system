import React, { useMemo, useCallback } from "react";
import {
  Box,
  Paper,
  Stack,
  Typography,
  Divider,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@mui/material";
import { BarChart } from "@mui/x-charts/BarChart";
import { LineChart } from "@mui/x-charts/LineChart";
import { computeTrends } from "./trends.service";
import CurrentOnlyTrend from "./CurrentOnlyTrend";
// Optional controls (if you’re using them)
import TrendsControls from "./TrendsControls";

const fmtMoney = (n) =>
  typeof n === "number" ? `$${Math.round(n).toLocaleString()}` : "—";
const fmtPct = (n) =>
  typeof n === "number" ? `${Math.round(n).toLocaleString()}%` : "—";

export default function TrendsPanel({
  clients = [],
  monday,
  sunday,
  month,
  dueDay = 15,
  weeksWindow = 12,
}) {
  const trends = useMemo(() => {
    if (!Array.isArray(clients) || clients.length === 0 || !sunday || !monday) {
      return null;
    }
    return computeTrends({ clients, monday, sunday, month, dueDay, weeksWindow });
  }, [clients, monday, sunday, month, dueDay, weeksWindow]);

  // ✅ Define hooks BEFORE any early return to satisfy react-hooks rules
  const onExportCsv = useCallback(() => {
    if (!trends) return;
    const rows = computeCsvRows(trends);
    const csv = toCsv(rows);
    downloadCsv(csv, `trends_${month}.csv`);
  }, [trends, month]);

  if (!trends) return null;

  const { series, concentrationNow } = trends;

  // Compact week labels (use end date MM/DD)
  const weekLabels = series.agingMix.map((w) => {
    const [, to] = w.key.split("..");
    const parts = to.split("-"); // YYYY-MM-DD
    return `${parts[1]}/${parts[2]}`;
  });

  const latestIdx = Math.max(0, series.timeToCure.length - 1);

  const latestTimeToCure = series.timeToCure[latestIdx] || {
    medianDays: 0,
    p75Days: 0,
    sampleSize: 0,
  };
  const latestOnlyCurrent = series.onlyCurrentMonth[latestIdx] || {
    count: 0,
    pctOfPD: 0,
    pastDueCount: 0,
  };
  const latestPromises = series.promises[latestIdx] || {
    keptRate: 0,
    totalPromises: 0,
    keptCount: 0,
    promisedAmount: 0,
    keptAmount: 0,
  };
  const latestAtRisk = series.atRisk[latestIdx] || {
    newEntrants: 0,
    netChangeLt60: 0,
    lt60Sun: 0,
  };

  // Chart data series
  const aging_current = series.agingMix.map((w) => w.percents.current);
  const aging_lt60 = series.agingMix.map((w) => w.percents.lt60);
  const aging_60_89 = series.agingMix.map((w) => w.percents.mid60_89);
  const aging_90p = series.agingMix.map((w) => w.percents.over90);

  const ttc_median = series.timeToCure.map((w) => w.medianDays);
  const ttc_p75 = series.timeToCure.map((w) => w.p75Days);

  const onlyCurrent_count = series.onlyCurrentMonth.map((w) => w.count);
  const onlyCurrent_pct = series.onlyCurrentMonth.map((w) => w.pctOfPD);

  const kept_rate = series.promises.map((w) => w.keptRate);
  const kept_amt = series.promises.map((w) => w.keptAmount);
  const promised_amt = series.promises.map((w) => w.promisedAmount);

  const atRisk_new = series.atRisk.map((w) => w.newEntrants);
  const atRisk_pool = series.atRisk.map((w) => w.lt60Sun);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h6" fontWeight={700}>
          Data Analysis (Trends)
        </Typography>
        <Chip label={`${weeksWindow}-week window`} size="small" variant="outlined" />
      </Stack>

      {/* Optional control bar (weeks window + export) */}
      <TrendsControls
        weeksWindow={weeksWindow}
        setWeeksWindow={() => { /* controlled by parent; no-op here */ }}
        onExport={onExportCsv}
      />

      <Divider sx={{ mb: 2 }} />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
          gap: 2,
        }}
      >
        {/* Time to Cure */}
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
            Time to Cure (days)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontStyle: "italic" }}>
            Shows how long it takes for past-due clients to become current again. A lower median means faster recovery and stronger payment behavior.
          </Typography>
          <LineChart
            height={220}
            xAxis={[{ data: weekLabels, scaleType: "point" }]}
            series={[
              { label: "Median", data: ttc_median },
              { label: "P75", data: ttc_p75 },
            ]}
            slotProps={{ legend: { hidden: false } }}
            grid={{ horizontal: true }}
          />
        </Paper>

        {/* Aging Mix Trend */}
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
            Aging Mix Trend (% of total AR)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontStyle: "italic" }}>
            Tracks the proportion of total receivables that are Current, &lt;60, 60–89, and 90+ days past due. A healthier portfolio shows more “Current” and fewer older buckets.
          </Typography>
          <BarChart
            height={220}
            xAxis={[{ data: weekLabels, scaleType: "band" }]}
            series={[
              { label: "Current", data: aging_current, stack: "mix" },
              { label: "<60", data: aging_lt60, stack: "mix" },
              { label: "60–89", data: aging_60_89, stack: "mix" },
              { label: "90+", data: aging_90p, stack: "mix" },
            ]}
            slotProps={{ legend: { hidden: false } }}
            grid={{ horizontal: true }}
          />
        </Paper>

        {/* Clients Owing Only Current Month */}
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
            Clients Owing Only Current Month
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontStyle: "italic" }}>
            Indicates how many clients are only behind on the current month’s payment. High counts here mean most clients are staying close to schedule.
          </Typography>
        <LineChart
            height={220}
            xAxis={[{ data: weekLabels, scaleType: "point" }]}
            series={[
              { label: "Count", data: onlyCurrent_count },
              { label: "% of PD", data: onlyCurrent_pct },
            ]}
            slotProps={{ legend: { hidden: false } }}
            grid={{ horizontal: true }}
          />
        </Paper>

        {/* Promise-to-Pay Kept Rate */}
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
            Promise-to-Pay Kept Rate (weekly)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontStyle: "italic" }}>
            Measures how many clients keep their payment promises and the dollar value of kept vs. promised amounts. Higher rates signal stronger follow-through.
          </Typography>
          <LineChart
            height={220}
            xAxis={[{ data: weekLabels, scaleType: "point" }]}
            series={[{ label: "Kept Rate %", data: kept_rate }]}
            slotProps={{ legend: { hidden: false } }}
            grid={{ horizontal: true }}
          />
          <BarChart
            height={180}
            xAxis={[{ data: weekLabels, scaleType: "band" }]}
            series={[
              { label: "Kept $", data: kept_amt },
              { label: "Promised $", data: promised_amt },
            ]}
            slotProps={{ legend: { hidden: false } }}
            grid={{ horizontal: true }}
            sx={{ mt: 1 }}
          />
        </Paper>

        {/* Growing At-Risk Pool (<60 days) */}
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
            Growing At-Risk Pool (&lt; 60 days past due)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontStyle: "italic" }}>
            Shows changes in the number of clients who recently became past due (&lt;60 days). A growing pool suggests emerging risk; decline indicates early recovery success.
          </Typography>
          <LineChart
            height={220}
            xAxis={[{ data: weekLabels, scaleType: "point" }]}
            series={[{ label: "At-Risk Pool (count)", data: atRisk_pool }]}
            slotProps={{ legend: { hidden: false } }}
            grid={{ horizontal: true }}
          />
          <BarChart
            height={180}
            xAxis={[{ data: weekLabels, scaleType: "band" }]}
            series={[{ label: "New Entrants (this week)", data: atRisk_new }]}
            slotProps={{ legend: { hidden: false } }}
            grid={{ horizontal: true }}
            sx={{ mt: 1 }}
          />
        </Paper>

        {/* Concentration Risk (Top 10) */}
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
            Concentration Risk — Top 10 by Remaining Balance
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontStyle: "italic" }}>
            Displays the top 10 clients holding the largest portion of your receivables. High concentration means more dependency on a few accounts for cash flow.
          </Typography>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Client</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Balance
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Cum. %
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {concentrationNow.top10.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{r.name}</TableCell>
                    <TableCell align="right">{fmtMoney(r.balance)}</TableCell>
                    <TableCell align="right">{fmtPct(r.cumulativePct)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Paper>
      </Box>

      {/* Monthly trend for “Clients Owing Only Current Month” */}
      <Box sx={{ mt: 2 }}>
        <CurrentOnlyTrend clients={clients} dueDay={dueDay} monthsBack={6} />
      </Box>
    </Paper>
  );
}

/* ----- helpers for CSV export (kept local to this file) ----- */
function computeCsvRows(trends) {
  const rows = [];
  // Example: one section; expand as desired
  trends.series.timeToCure.forEach((w) => {
    rows.push({
      section: "time_to_cure",
      week: w.key,
      median_days: w.medianDays,
      p75_days: w.p75Days,
      sample: w.sampleSize,
    });
  });
  return rows;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => String(r[h]).replaceAll(",", "")).join(","));
  }
  return lines.join("\n");
}

function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}