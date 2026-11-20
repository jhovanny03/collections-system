// src/Reports/DueCollectedReport.jsx
// Due vs collected per month: installments due from clients who were up to date going
// into the month (a client who catches up during the month moves into it), and how much
// of them was paid. Pick a month to see it by case type and who has not paid yet.
import React, { useMemo, useState } from "react";
import {
  Box, Button, Card, Chip, LinearProgress, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography, Link as MuiLink,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { BarChart } from "@mui/x-charts/BarChart";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import { Link as RouterLink } from "react-router-dom";
import { useClients } from "../data/ClientsProvider";
import { collectionRateByMonth, money, pct, monthLabel, clientName } from "../billing/portfolio";
import { monthDueCollected } from "../billing/ledger";
import { chartColors } from "../theme/brand";
import { StatCard, Section, Tiles } from "../ui/kit";

export default function DueCollectedReport() {
  const theme = useTheme();
  const colors = chartColors(theme.palette.mode);
  const { clients, loading } = useClients();
  const months = useMemo(() => (clients.length ? collectionRateByMonth(clients, 12) : []), [clients]);
  const [ym, setYm] = useState(null);
  const sel = ym || months[months.length - 1]?.key;
  const selMonth = months.find((m) => m.key === sel);

  // Per client for the chosen month.
  const detail = useMemo(() => {
    if (!sel) return [];
    const [y, m] = sel.split("-").map(Number);
    const now = new Date();
    const isCurrent = y === now.getFullYear() && m === now.getMonth() + 1;
    const cutoff = isCurrent ? now : new Date(y, m, 0, 23, 59, 59);
    return clients
      .filter((c) => String(c.status || "active").toLowerCase() !== "closed")
      .map((c) => ({ c, ...monthDueCollected(c, sel, cutoff) }))
      .filter((r) => r.due > 0);
  }, [clients, sel]);

  const byType = useMemo(() => {
    const map = new Map();
    for (const r of detail) {
      const t = r.c.caseType || "—";
      const e = map.get(t) || { type: t, clients: 0, due: 0, collected: 0 };
      e.clients++;
      e.due += r.due;
      e.collected += r.collected;
      map.set(t, e);
    }
    return [...map.values()].sort((a, b) => b.due - a.due);
  }, [detail]);
  const unpaid = useMemo(() => detail.filter((r) => r.collected < r.due - 0.005).sort((a, b) => b.due - b.collected - (a.due - a.collected)), [detail]);

  const exportUnpaid = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Client", "Case type", "Due", "Paid", "Missing"], ...unpaid.map((r) => [clientName(r.c), r.c.caseType || "", r.due, r.collected, (r.due - r.collected).toFixed(2)])];
    const url = URL.createObjectURL(new Blob([rows.map((x) => x.map(esc).join(",")).join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `not-paid-${sel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !months.length) return <LinearProgress />;
  const avg = months.slice(0, -1).filter((m) => m.rate != null);
  const avgRate = avg.length ? avg.reduce((s, m) => s + m.collected, 0) / avg.reduce((s, m) => s + m.expected, 0) : null;

  return (
    <Box>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        <TextField select label="Month" value={sel} onChange={(e) => setYm(e.target.value)} sx={{ minWidth: 200 }}>
          {[...months].reverse().map((m) => <MenuItem key={m.key} value={m.key}>{monthLabel(m.key, "long")}</MenuItem>)}
        </TextField>
      </Stack>

      <Tiles min={200} sx={{ mb: 3 }}>
        <StatCard label={`Due in ${monthLabel(sel, "long")}`} value={money(selMonth?.expected)} sub={`${selMonth?.clients || 0} clients up to date going in`} />
        <StatCard label="Collected" value={money(selMonth?.collected)} sub={`${pct(selMonth?.rate)} of what was due`} tone={selMonth?.rate >= 0.85 ? "good" : "warn"} />
        <StatCard label="Not paid" value={money(selMonth?.missed)} sub={`${unpaid.length} clients`} tone="bad" />
        <StatCard label="Average (last 11 months)" value={pct(avgRate)} sub="collected of due" />
      </Tiles>

      <Section title="Last 12 months" subtitle="Due from clients up to date going into each month, and how much was paid" sx={{ mb: 3 }}>
        <Box sx={{ height: 300 }}>
          <BarChart
            dataset={months}
            xAxis={[{ scaleType: "band", dataKey: "label" }]}
            yAxis={[{ valueFormatter: (v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`), width: 56 }]}
            series={[
              { dataKey: "expected", label: "Due", color: theme.palette.mode === "dark" ? "#4A5080" : "#C9CDEB", valueFormatter: (v, c) => `${money(v)} · ${months[c.dataIndex]?.clients} clients` },
              { dataKey: "collected", label: "Collected", color: colors[0], valueFormatter: (v, c) => `${money(v)} (${pct(months[c.dataIndex]?.rate)})` },
            ]}
            onItemClick={(_, d) => months[d.dataIndex] && setYm(months[d.dataIndex].key)}
            borderRadius={4}
            margin={{ left: 8, right: 8, top: 16, bottom: 8 }}
          />
        </Box>
        <Typography variant="caption" color="text.secondary">Click a month to see its details below.</Typography>
      </Section>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "2fr 3fr" } }}>
        <Section title={`By case type · ${monthLabel(sel, "long")}`} pad={false}>
          <TableContainer sx={{ maxHeight: 440 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Case type</TableCell>
                  <TableCell align="right">Clients</TableCell>
                  <TableCell align="right">Due</TableCell>
                  <TableCell align="right">Collected</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {byType.map((t) => (
                  <TableRow key={t.type} hover>
                    <TableCell>{t.type}</TableCell>
                    <TableCell align="right">{t.clients}</TableCell>
                    <TableCell align="right">{money(t.due)}</TableCell>
                    <TableCell align="right">
                      {money(t.collected)} <Chip size="small" label={pct(t.collected / Math.max(1, t.due))} color={t.collected / Math.max(1, t.due) >= 0.85 ? "success" : "warning"} variant="outlined" sx={{ ml: 0.5 }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Section>
        <Section title={`Not paid · ${monthLabel(sel, "long")}`} subtitle="Were up to date, did not pay this month's installment in full" action={<Button size="small" startIcon={<DownloadRounded />} onClick={exportUnpaid} disabled={!unpaid.length}>CSV</Button>} pad={false}>
          <TableContainer sx={{ maxHeight: 440 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Client</TableCell>
                  <TableCell>Case type</TableCell>
                  <TableCell align="right">Due</TableCell>
                  <TableCell align="right">Paid</TableCell>
                  <TableCell align="right">Missing</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {unpaid.slice(0, 300).map((r) => (
                  <TableRow key={r.c.id} hover>
                    <TableCell><MuiLink component={RouterLink} to={`/client/${r.c.id}`} fontWeight={700} underline="hover">{clientName(r.c)}</MuiLink></TableCell>
                    <TableCell>{r.c.caseType || "—"}</TableCell>
                    <TableCell align="right">{money(r.due)}</TableCell>
                    <TableCell align="right">{r.collected ? money(r.collected) : "—"}</TableCell>
                    <TableCell align="right"><Typography fontWeight={800} color="secondary.main" component="span">{money(r.due - r.collected)}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Section>
      </Box>
    </Box>
  );
}
