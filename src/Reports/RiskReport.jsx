// src/Reports/RiskReport.jsx
// Risk & plan health:
//  - Write-off / at risk: owe 90+ days and have paid nothing for 6+ months.
//  - Plan health: every active plan sorted into ended owing / will end owing / behind /
//    finishing soon / on track, with what they would need to pay to finish on time.
import React, { useMemo, useState } from "react";
import {
  Box, Button, Card, Chip, LinearProgress, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, Tabs, TextField, Typography, Link as MuiLink,
} from "@mui/material";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import { Link as RouterLink } from "react-router-dom";
import { useClients } from "../data/ClientsProvider";
import { usePortfolio, money, monthLabel } from "../billing/portfolio";
import { writeOffRisk, planHealth, HEALTH } from "../billing/insights";
import { StatCard, Tiles } from "../ui/kit";

function csv(name, header, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const url = URL.createObjectURL(new Blob([[header, ...rows].map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
const fmtDate = (d) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Never");

function WriteOff({ risk, loading }) {
  const [tier, setTier] = useState("all");
  const [page, setPage] = useState(0);
  const list = risk.filter((r) => tier === "all" || r.tier === tier);
  const sum = (l) => l.reduce((s, r) => s + r.owed, 0);
  const tiers = [
    { key: "6-12", label: "Quiet 6–12 months" },
    { key: "12+", label: "Quiet 12+ months" },
    { key: "never", label: "Never paid an installment" },
  ];
  return (
    <Box>
      <Tiles min={200} sx={{ mb: 2.5 }}>
        <StatCard label="At risk" value={money(sum(risk))} sub={`${risk.length} clients owe 90+ days and paid nothing in 6+ months`} tone="danger" onClick={() => setTier("all")} />
        {tiers.map((t) => {
          const l = risk.filter((r) => r.tier === t.key);
          return <StatCard key={t.key} label={t.label} value={money(sum(l))} sub={`${l.length} clients`} tone="bad" onClick={() => { setTier(t.key); setPage(0); }} />;
        })}
      </Tiles>
      <Card>
        <Stack direction="row" spacing={1.5} sx={{ p: 2 }} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField select label="Show" value={tier} onChange={(e) => { setTier(e.target.value); setPage(0); }} sx={{ minWidth: 220 }}>
            <MenuItem value="all">Everyone at risk ({risk.length})</MenuItem>
            {tiers.map((t) => <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>)}
          </TextField>
          <Box sx={{ flex: 1 }} />
          <Button
            startIcon={<DownloadRounded />}
            disabled={!list.length}
            onClick={() => csv("write-off-review.csv", ["Client", "Case type", "Status", "On hold", "Owed", "90+ days", "Balance left", "Last payment", "Months without paying", "Source", "MyCase"],
              list.map((r) => [r.name, r.caseType, r.status, r.onHold ? "yes" : "", r.owed.toFixed(2), r.over90.toFixed(2), r.balance.toFixed(2), r.lastPayment ? r.lastPayment.toISOString().slice(0, 10) : "never", r.monthsQuiet ?? "", r.source, r.myCaseLink]))}
          >
            CSV for review
          </Button>
        </Stack>
        {loading && <LinearProgress />}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Client</TableCell>
                <TableCell>Case type</TableCell>
                <TableCell align="right">Owed</TableCell>
                <TableCell align="right">90+ days</TableCell>
                <TableCell>Last payment</TableCell>
                <TableCell align="right">Months quiet</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {list.slice(page * 50, page * 50 + 50).map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>
                    <MuiLink component={RouterLink} to={`/client/${r.id}`} fontWeight={700} underline="hover">{r.name}</MuiLink>
                    {r.onHold && <Chip size="small" label="On hold" color="warning" sx={{ ml: 1 }} />}
                    {r.status === "paused" && <Chip size="small" label="Paused" sx={{ ml: 1 }} />}
                  </TableCell>
                  <TableCell>{r.caseType}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800 }}>{money(r.owed)}</TableCell>
                  <TableCell align="right" sx={{ color: "error.main", fontWeight: 700 }}>{money(r.over90)}</TableCell>
                  <TableCell>{fmtDate(r.lastPayment)}</TableCell>
                  <TableCell align="right">{r.monthsQuiet ?? "—"}</TableCell>
                  <TableCell align="right">
                    {r.myCaseLink && <Button size="small" href={r.myCaseLink} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewRounded fontSize="small" />}>MyCase</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={list.length} page={page} onPageChange={(_, p) => setPage(p)} rowsPerPage={50} rowsPerPageOptions={[50]} />
      </Card>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
        A client is listed when part of what they owe is 90+ days old and no payment of any kind has come in for 6 months or more. Use the CSV to review with the team before deciding on termination, outside collections or write-off.
      </Typography>
    </Box>
  );
}

function Health({ health, loading }) {
  const [key, setKey] = useState("endsOwing");
  const [page, setPage] = useState(0);
  const groups = useMemo(() => Object.fromEntries(HEALTH.map((h) => [h.key, health.filter((r) => r.key === h.key)])), [health]);
  const list = useMemo(() => [...(groups[key] || [])].sort((a, b) => b.owed - a.owed || (a.endYm || "").localeCompare(b.endYm || "")), [groups, key]);
  const current = HEALTH.find((h) => h.key === key);
  return (
    <Box>
      <Tiles min={180} sx={{ mb: 2.5 }}>
        {HEALTH.map((h) => (
          <StatCard
            key={h.key}
            label={h.label}
            value={(groups[h.key] || []).length.toLocaleString()}
            sub={(groups[h.key] || []).some((r) => r.owed > 0) ? `${money((groups[h.key] || []).reduce((s, r) => s + r.owed, 0))} owed` : "clients"}
            tone={h.tone === "error" ? "danger" : h.tone === "warning" ? "warn" : h.tone === "success" ? "good" : "default"}
            help={h.help}
            onClick={() => { setKey(h.key); setPage(0); }}
          />
        ))}
      </Tiles>
      <Card>
        <Stack direction="row" spacing={1.5} sx={{ p: 2 }} alignItems="center" flexWrap="wrap" useFlexGap>
          <Box>
            <Typography fontWeight={800}>{current.label} · {list.length}</Typography>
            <Typography variant="body2" color="text.secondary">{current.help}</Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Button
            startIcon={<DownloadRounded />}
            disabled={!list.length}
            onClick={() => csv(`plan-health-${key}.csv`, ["Client", "Case type", "Owed now", "Installments behind", "Installments left", "Plan ends", "Normal monthly", "Needed monthly to finish on time", "Balance left"],
              list.map((r) => [r.name, r.caseType, r.owed.toFixed(2), r.monthsBehind, r.monthsLeft, r.endYm || "", r.regular.toFixed(2), r.neededMonthly.toFixed(2), r.balance.toFixed(2)]))}
          >
            CSV
          </Button>
        </Stack>
        {loading && <LinearProgress />}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Client</TableCell>
                <TableCell>Case type</TableCell>
                <TableCell align="right">Owed now</TableCell>
                <TableCell align="right">Behind</TableCell>
                <TableCell align="right">Left</TableCell>
                <TableCell>Plan ends</TableCell>
                <TableCell align="right">Normal / month</TableCell>
                <TableCell align="right">Needed / month to finish on time</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.slice(page * 50, page * 50 + 50).map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell><MuiLink component={RouterLink} to={`/client/${r.id}`} fontWeight={700} underline="hover">{r.name}</MuiLink></TableCell>
                  <TableCell>{r.caseType}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: r.owed ? 800 : 400 }}>{r.owed ? money(r.owed) : "—"}</TableCell>
                  <TableCell align="right">{r.monthsBehind || "—"}</TableCell>
                  <TableCell align="right">{r.monthsLeft}</TableCell>
                  <TableCell>{r.endYm ? monthLabel(r.endYm) : "—"}</TableCell>
                  <TableCell align="right">{r.regular ? money(r.regular) : "—"}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: r.neededMonthly > r.regular * 1.5 ? "secondary.main" : "text.primary" }}>
                    {key === "ended" ? `${money(r.owed)} now` : money(r.neededMonthly)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={list.length} page={page} onPageChange={(_, p) => setPage(p)} rowsPerPage={50} rowsPerPageOptions={[50]} />
      </Card>
    </Box>
  );
}

export default function RiskReport() {
  const { clients, loading } = useClients();
  const { rows } = usePortfolio(clients);
  const [view, setView] = useState("health");
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const risk = useMemo(() => writeOffRisk(clients, byId, 6), [clients, byId]);
  const health = useMemo(() => planHealth(clients, byId), [clients, byId]);
  return (
    <Box>
      <Card sx={{ mb: 2.5, px: 1 }}>
        <Tabs value={view} onChange={(_, v) => setView(v)}>
          <Tab value="health" label="Plan health" />
          <Tab value="writeoff" label={`Write-off / at risk (${risk.length})`} />
        </Tabs>
      </Card>
      {view === "health" ? <Health health={health} loading={loading} /> : <WriteOff risk={risk} loading={loading} />}
    </Box>
  );
}
