// src/Reports/ForecastReport.jsx
// What should come in over the next 3 months: installments the plans schedule (minus
// anything already paid ahead), and a likely figure from how each group has paid lately.
import React, { useEffect, useState } from "react";
import { Alert, Box, LinearProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { BarChart } from "@mui/x-charts/BarChart";
import { useClients } from "../data/ClientsProvider";
import { collectionForecast } from "../billing/insights";
import { money, pct, monthLabel } from "../billing/portfolio";
import { chartColors } from "../theme/brand";
import { StatCard, Section, Tiles } from "../ui/kit";

export default function ForecastReport() {
  const theme = useTheme();
  const colors = chartColors(theme.palette.mode);
  const { clients } = useClients();
  const [f, setF] = useState(null);

  useEffect(() => {
    if (!clients.length) return undefined;
    const t = setTimeout(() => setF(collectionForecast(clients, 3)), 50);
    return () => clearTimeout(t);
  }, [clients]);

  if (!f) {
    return (
      <Box sx={{ py: 4 }}>
        <LinearProgress />
        <Typography variant="caption" color="text.secondary">Projecting every plan forward…</Typography>
      </Box>
    );
  }

  const total = f.months.reduce((s, m) => s + m.scheduled, 0);
  const likely = f.months.reduce((s, m) => s + m.likely, 0);
  const data = f.months.map((m) => ({ ...m, label: monthLabel(m.key, "long") }));

  return (
    <Box>
      <Tiles min={210} sx={{ mb: 3 }}>
        <StatCard label="Scheduled, next 3 months" value={money(total)} sub="Installments the plans call for" />
        <StatCard label="Likely to come in" value={money(likely)} sub={`${pct(likely / Math.max(1, total))} of scheduled`} tone="good" help="Up-to-date clients at their recent rate, behind clients at theirs (see below)." />
        <StatCard label="Up-to-date clients pay" value={pct(f.currentRate)} sub="of their installment (last 6 months)" />
        <StatCard label="Behind clients pay" value={pct(f.behindRate)} sub="of their installment a month (last 3 months)" tone="warn" />
        {f.restThisMonth > 0 && <StatCard label="Still to come this month" value={money(f.restThisMonth)} sub="Installments due on the 15th, not paid yet" />}
      </Tiles>

      <Section title="Next 3 months" subtitle="Scheduled installments, split by whether the client is up to date today, and the likely amount" sx={{ mb: 3 }}>
        <Box sx={{ height: 300 }}>
          <BarChart
            dataset={data}
            xAxis={[{ scaleType: "band", dataKey: "label" }]}
            yAxis={[{ valueFormatter: (v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`), width: 60 }]}
            series={[
              { dataKey: "upToDate", label: "From clients up to date", stack: "s", color: colors[1], valueFormatter: (v) => money(v) },
              { dataKey: "behind", label: "From clients behind", stack: "s", color: theme.palette.mode === "dark" ? "#7A5A2E" : "#F2C9A8", valueFormatter: (v) => money(v) },
              { dataKey: "likely", label: "Likely", color: colors[0], valueFormatter: (v) => money(v) },
            ]}
            borderRadius={4}
            margin={{ left: 8, right: 8, top: 16, bottom: 8 }}
          />
        </Box>
      </Section>

      <Section title="By month" pad={false} sx={{ mb: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Month</TableCell>
                <TableCell align="right">Clients</TableCell>
                <TableCell align="right">Scheduled</TableCell>
                <TableCell align="right">Up to date today</TableCell>
                <TableCell align="right">Behind today</TableCell>
                <TableCell align="right">Likely</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((m) => (
                <TableRow key={m.key} hover>
                  <TableCell sx={{ fontWeight: 700 }}>{m.label}</TableCell>
                  <TableCell align="right">{m.clients.toLocaleString()}</TableCell>
                  <TableCell align="right">{money(m.scheduled)}</TableCell>
                  <TableCell align="right">{money(m.upToDate)}</TableCell>
                  <TableCell align="right">{money(m.behind)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800 }}>{money(m.likely)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Section>

      <Alert severity="info" variant="outlined">
        How it is worked out: every active plan is projected forward month by month (paused and closed clients are left out;
        anything paid ahead is subtracted). "Likely" applies each group's real behaviour: clients up to date have paid{" "}
        {pct(f.currentRate)} of their installments over the last 6 months; clients who were behind paid {pct(f.behindRate)} of
        their installment amount per month over the last 3. Catch-up payments, new clients and plan changes are not included.
      </Alert>
    </Box>
  );
}
