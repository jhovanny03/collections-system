// src/Reports/AgingReport.jsx
// A/R aging the way the accountant reads it: what each client owes, split by how long
// ago the installment's month started (0-30 / 31-60 / 61-90 / 90+ days from the 1st).
// The current month's installment is in 0-30 even before its due date (the 15th).
import React, { useMemo, useState } from "react";
import {
  Box, Button, Card, Chip, InputAdornment, LinearProgress, MenuItem, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, TableSortLabel, TextField, Typography, Link as MuiLink,
} from "@mui/material";
import SearchRounded from "@mui/icons-material/SearchRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import { Link as RouterLink } from "react-router-dom";
import { useBook } from "../data/BookProvider";
import { money, pct, AGING_BUCKETS } from "../billing/portfolio";
import { StatCard, Tiles } from "../ui/kit";
import AgingTrend from "./AgingTrend";

const KEYS = AGING_BUCKETS.map((b) => b.key);

export default function AgingReport() {
  const { rows, summary: s, ready } = useBook();
  const loading = !ready;
  const [search, setSearch] = useState("");
  const [caseType, setCaseType] = useState("Any");
  const [source, setSource] = useState("Any");
  const [status, setStatus] = useState("active");
  const [oldest, setOldest] = useState("any"); // any | b30 | b60 | b90
  const [sort, setSort] = useState({ by: "total", dir: "desc" });
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(50);

  const owing = useMemo(() => rows.filter((r) => r.status !== "closed" && r.aging.total > 0.005), [rows]);
  const caseTypes = useMemo(() => ["Any", ...[...new Set(owing.map((r) => r.caseType))].filter((t) => t && t !== "—").sort()], [owing]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minAge = { any: 0, b30: 1, b60: 2, b90: 3 }[oldest];
    const out = owing.filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (caseType === "Any" || r.caseType === caseType) &&
        (source === "Any" || r.source === source) &&
        (!minAge || KEYS.slice(minAge).some((k) => r.aging[k] > 0.005)) &&
        (!q || r.name.toLowerCase().includes(q) || r.caseTitle.toLowerCase().includes(q))
    );
    const val = (r) => (sort.by === "name" ? r.name : sort.by === "total" ? r.aging.total : r.aging[sort.by]);
    out.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const d = typeof x === "string" ? x.localeCompare(y) : x - y;
      return sort.dir === "asc" ? d : -d;
    });
    return out;
  }, [owing, search, caseType, source, status, oldest, sort]);

  const totals = useMemo(() => {
    const t = { b0: 0, b30: 0, b60: 0, b90: 0, total: 0 };
    list.forEach((r) => [...KEYS, "total"].forEach((k) => (t[k] += r.aging[k])));
    return t;
  }, [list]);

  const head = (by, label, align = "right") => (
    <TableCell key={by} align={align} sortDirection={sort.by === by ? sort.dir : false}>
      <TableSortLabel active={sort.by === by} direction={sort.by === by ? sort.dir : "desc"} onClick={() => setSort((x) => ({ by, dir: x.by === by && x.dir === "desc" ? "asc" : by === "name" ? "asc" : "desc" }))}>
        {label}
      </TableSortLabel>
    </TableCell>
  );

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    // Bucket = by client (oldest unpaid month). The by-installment split is added for the accountant.
    const header = ["Client", "Case title", "Case type", "Status", "Source", ...AGING_BUCKETS.map((b) => b.label), "Total", ...AGING_BUCKETS.map((b) => `By installment ${b.label}`), "Last payment"];
    const body = list.map((r) => [r.name, r.caseTitle, r.caseType, r.status, r.source, ...KEYS.map((k) => r.aging[k].toFixed(2)), r.aging.total.toFixed(2), ...KEYS.map((k) => (r.agingByInstallment?.[k] || 0).toFixed(2)), r.lastPayment?.date || ""]);
    body.push(["TOTAL", "", "", "", "", ...KEYS.map((k) => totals[k].toFixed(2)), totals.total.toFixed(2), ...KEYS.map(() => ""), ""]);
    const url = URL.createObjectURL(new Blob([[header, ...body].map((x) => x.map(esc).join(",")).join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ar-aging-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = (fn) => (v) => {
    fn(v);
    setPage(0);
  };

  return (
    <Box>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      <Tiles min={180} sx={{ mb: 2.5 }}>
        {s.buckets.map((b, i) => (
          <StatCard
            key={b.key}
            label={b.label}
            value={money(b.amount)}
            sub={`${b.clients.toLocaleString()} clients · ${pct(b.amount / Math.max(1, s.receivable.amount))}`}
            tone={i === 0 ? "warn" : i === 3 ? "danger" : "bad"}
            help={b.help}
            onClick={() => reset(setOldest)(i === 0 ? "any" : b.key)}
          />
        ))}
        <StatCard label="Total receivable" value={money(s.receivable.amount)} sub={`${s.receivable.clients.toLocaleString()} clients`} help="Everything owed on installments, this month included." />
      </Tiles>

      <AgingTrend />

      <Card>
        <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5} sx={{ p: 2 }} alignItems={{ lg: "center" }}>
          <TextField
            placeholder="Search a client or case"
            value={search}
            onChange={(e) => reset(setSearch)(e.target.value)}
            sx={{ flex: 1, minWidth: 200 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }}
          />
          <TextField select label="Status" value={status} onChange={(e) => reset(setStatus)(e.target.value)} sx={{ minWidth: 140 }}>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="paused">Paused</MenuItem>
            <MenuItem value="all">Active + paused</MenuItem>
          </TextField>
          <TextField select label="Oldest debt" value={oldest} onChange={(e) => reset(setOldest)(e.target.value)} sx={{ minWidth: 170 }}>
            <MenuItem value="any">Anything owed</MenuItem>
            <MenuItem value="b30">31+ days</MenuItem>
            <MenuItem value="b60">61+ days</MenuItem>
            <MenuItem value="b90">90+ days</MenuItem>
          </TextField>
          <TextField select label="Case type" value={caseType} onChange={(e) => reset(setCaseType)(e.target.value)} sx={{ minWidth: 170 }}>
            {caseTypes.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <TextField select label="Source" value={source} onChange={(e) => reset(setSource)(e.target.value)} sx={{ minWidth: 170 }}>
            {["Any", "MyCase", "Rebuilt from MyCase", "MyCase, invoices to tag", "Typed by hand"].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <Button startIcon={<DownloadRounded />} onClick={exportCsv} disabled={!list.length}>CSV</Button>
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {head("name", "Client", "left")}
                <TableCell>Case type</TableCell>
                {AGING_BUCKETS.map((b) => head(b.key, b.label))}
                {head("total", "Total")}
                <TableCell>Last payment</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow sx={{ bgcolor: "action.hover" }}>
                <TableCell sx={{ fontWeight: 800 }}>{list.length.toLocaleString()} clients</TableCell>
                <TableCell />
                {KEYS.map((k) => <TableCell key={k} align="right" sx={{ fontWeight: 800 }}>{money(totals[k])}</TableCell>)}
                <TableCell align="right" sx={{ fontWeight: 800 }}>{money(totals.total)}</TableCell>
                <TableCell />
              </TableRow>
              {list.slice(page * perPage, page * perPage + perPage).map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={{ maxWidth: 300 }}>
                    <MuiLink component={RouterLink} to={`/client/${r.id}`} fontWeight={700} underline="hover">{r.name}</MuiLink>
                    {r.status === "paused" && <Chip size="small" label="Paused" sx={{ ml: 1 }} />}
                    {r.planEnded && <Chip size="small" color="error" variant="outlined" label="Plan ended" sx={{ ml: 1 }} />}
                  </TableCell>
                  <TableCell>{r.caseType}</TableCell>
                  {KEYS.map((k, i) => (
                    <TableCell key={k} align="right" sx={{ color: r.aging[k] > 0.005 ? (i === 3 ? "error.main" : i === 0 ? "text.primary" : "secondary.main") : "text.disabled", fontWeight: r.aging[k] > 0.005 ? 700 : 400 }}>
                      {r.aging[k] > 0.005 ? money(r.aging[k]) : "—"}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 800 }}>{money(r.aging.total)}</TableCell>
                  <TableCell>{r.lastPayment ? `${money(r.lastPayment.amount)} · ${r.lastPayment.date}` : "—"}</TableCell>
                </TableRow>
              ))}
              {!loading && list.length === 0 && (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}>No one matches these filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={list.length} page={page} onPageChange={(_, p) => setPage(p)} rowsPerPage={perPage} onRowsPerPageChange={(e) => reset(setPerPage)(parseInt(e.target.value, 10))} rowsPerPageOptions={[25, 50, 100, 250]} />
      </Card>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
        Each client sits in one bucket, set by their oldest unpaid installment (aged from the 1st of its month), with everything they owe; payments always go to the oldest installment first, so a client who pays their oldest month moves to a newer bucket right away. The CSV also has the split installment by installment. Closed clients are excluded.
      </Typography>
    </Box>
  );
}
