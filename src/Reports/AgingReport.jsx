// src/Reports/AgingReport.jsx
// A/R aging by client: each client sits in ONE bucket (0-30 / 31-60 / 61-90 / 90+ days),
// set by their oldest unpaid installment, with everything they owe. So the list shows one
// Age chip per client instead of four mostly-empty bucket columns; the bucket chips at the
// top pick the bucket. The CSV keeps the full breakdown (by client and by installment) for
// the accountant.
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
import { ago } from "../billing/contact";
import AgingTrend from "./AgingTrend";

const KEYS = AGING_BUCKETS.map((b) => b.key);
// One colour per bucket, from calm to urgent.
const TONE = { b0: "warning", b30: "secondary", b60: "error", b90: "error" };
const bucketOf = (r) => r.aging.oldest || KEYS.find((k) => r.aging[k] > 0.005) || "b0";
const labelOf = (k) => AGING_BUCKETS.find((b) => b.key === k)?.label || "";

export default function AgingReport() {
  const { rows, ready } = useBook();
  const loading = !ready;
  const [bucket, setBucket] = useState("all"); // all | b0 | b30 | b60 | b90
  const [search, setSearch] = useState("");
  const [caseType, setCaseType] = useState("Any");
  const [source, setSource] = useState("Any");
  const [status, setStatus] = useState("active");
  const [sort, setSort] = useState({ by: "owed", dir: "desc" });
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(50);

  const owing = useMemo(() => rows.filter((r) => r.status !== "closed" && r.aging.total > 0.005), [rows]);
  const caseTypes = useMemo(() => ["Any", ...[...new Set(owing.map((r) => r.caseType))].filter((t) => t && t !== "—").sort()], [owing]);
  const sources = useMemo(() => ["Any", ...[...new Set(owing.map((r) => r.source))].filter(Boolean).sort()], [owing]);

  // Everything but the bucket: the chips show counts for the other filters as set.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return owing.filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (caseType === "Any" || r.caseType === caseType) &&
        (source === "Any" || r.source === source) &&
        (!q || r.name.toLowerCase().includes(q) || (r.caseTitle || "").toLowerCase().includes(q))
    );
  }, [owing, search, caseType, source, status]);

  const chips = useMemo(() => {
    const c = { all: { n: filtered.length, amt: 0 } };
    KEYS.forEach((k) => (c[k] = { n: 0, amt: 0 }));
    filtered.forEach((r) => {
      const k = bucketOf(r);
      c[k].n++;
      c[k].amt += r.aging.total;
      c.all.amt += r.aging.total;
    });
    return c;
  }, [filtered]);

  const list = useMemo(() => {
    const out = bucket === "all" ? [...filtered] : filtered.filter((r) => bucketOf(r) === bucket);
    const val = (r) =>
      sort.by === "name" ? r.name
        : sort.by === "behind" ? r.missedMonths
        : sort.by === "age" ? KEYS.indexOf(bucketOf(r)) * 1e9 + r.aging.total
        : sort.by === "paid" ? (r.lastPayment?.date || "")
        : sort.by === "contact" ? (r.lastContact?.at ? r.lastContact.at.getTime() : 0)
        : r.aging.total;
    out.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const d = typeof x === "string" ? x.localeCompare(y) : x - y;
      return sort.dir === "asc" ? d : -d;
    });
    return out;
  }, [filtered, bucket, sort]);

  const shownTotal = useMemo(() => list.reduce((t, r) => t + r.aging.total, 0), [list]);

  const head = (by, label, align = "left") => (
    <TableCell key={by} align={align} sortDirection={sort.by === by ? sort.dir : false}>
      <TableSortLabel active={sort.by === by} direction={sort.by === by ? sort.dir : "desc"} onClick={() => setSort((x) => ({ by, dir: x.by === by && x.dir === "desc" ? "asc" : by === "name" ? "asc" : "desc" }))}>
        {label}
      </TableSortLabel>
    </TableCell>
  );

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    // Accountant detail: the client's bucket, and the same debt split installment by installment.
    const header = ["Client", "Case title", "Case type", "Status", "Source", "Age (oldest unpaid)", "Owed", "Months behind", ...AGING_BUCKETS.map((b) => `By installment ${b.label}`), "Last payment", "Last contact"];
    const body = list.map((r) => [r.name, r.caseTitle, r.caseType, r.status, r.source, labelOf(bucketOf(r)), r.aging.total.toFixed(2), r.missedMonths,
      ...KEYS.map((k) => (r.agingByInstallment?.[k] || 0).toFixed(2)), r.lastPayment ? `${r.lastPayment.date} ${r.lastPayment.amount}` : "", r.lastContact?.at ? r.lastContact.at.toISOString().slice(0, 10) : ""]);
    body.push(["TOTAL", "", "", "", "", "", shownTotal.toFixed(2), "", ...KEYS.map(() => ""), "", ""]);
    const url = URL.createObjectURL(new Blob([[header, ...body].map((x) => x.map(esc).join(",")).join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ar-aging-${bucket}-${new Date().toISOString().slice(0, 10)}.csv`;
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

      {/* Buckets: one card each; clicking picks the bucket below. */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(5, 1fr)" }, gap: 1.5, mb: 2.5 }}>
        {[["all", "All ages", null], ...AGING_BUCKETS.map((b) => [b.key, b.label, b.help])].map(([k, label, help]) => {
          const on = bucket === k;
          const c = chips[k] || { n: 0, amt: 0 };
          return (
            <Card
              key={k}
              onClick={() => reset(setBucket)(k)}
              title={help || "Every client who owes, any age"}
              sx={{
                p: 2, cursor: "pointer", transition: "border-color .15s, box-shadow .15s",
                border: 2, borderColor: on ? (k === "all" ? "primary.main" : `${TONE[k]}.main`) : "transparent",
                "&:hover": { borderColor: on ? undefined : "divider" },
              }}
            >
              <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4 }}>{label}</Typography>
              <Typography variant="h5" fontWeight={800} color={k === "b90" ? "error.main" : "text.primary"}>{money(c.amt)}</Typography>
              <Typography variant="body2" color="text.secondary">
                {c.n.toLocaleString()} clients{k !== "all" && chips.all.amt ? ` · ${pct(c.amt / chips.all.amt)}` : ""}
              </Typography>
            </Card>
          );
        })}
      </Box>

      <AgingTrend />

      <Card>
        <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5} sx={{ p: 2 }} alignItems={{ lg: "center" }}>
          <TextField
            size="small"
            placeholder="Search a client or case"
            value={search}
            onChange={(e) => reset(setSearch)(e.target.value)}
            sx={{ flex: 1, minWidth: 200 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }}
          />
          <TextField size="small" select label="Status" value={status} onChange={(e) => reset(setStatus)(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="paused">Paused</MenuItem>
            <MenuItem value="all">Active + paused</MenuItem>
          </TextField>
          <TextField size="small" select label="Case type" value={caseType} onChange={(e) => reset(setCaseType)(e.target.value)} sx={{ minWidth: 170 }}>
            {caseTypes.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <TextField size="small" select label="Payments from" value={source} onChange={(e) => reset(setSource)(e.target.value)} sx={{ minWidth: 190 }}>
            {sources.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <Button startIcon={<DownloadRounded />} onClick={exportCsv} disabled={!list.length}>CSV</Button>
        </Stack>

        <Box sx={{ px: 2, pb: 1.5, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 1 }}>
          <Typography fontWeight={800}>
            {bucket === "all" ? "All ages" : labelOf(bucket)} · {list.length.toLocaleString()} clients · {money(shownTotal)}
          </Typography>
          <Typography variant="caption" color="text.secondary">Each client is in one bucket, by their oldest unpaid installment, with everything they owe.</Typography>
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {head("name", "Client")}
                <TableCell>Case type</TableCell>
                {head("age", "Age")}
                {head("owed", "Owed", "right")}
                {head("behind", "Months behind", "right")}
                {head("paid", "Last payment")}
                {head("contact", "Last contact")}
              </TableRow>
            </TableHead>
            <TableBody>
              {list.slice(page * perPage, page * perPage + perPage).map((r) => {
                const k = bucketOf(r);
                const quiet = r.lastContact?.at ? Date.now() - r.lastContact.at.getTime() > 30 * 864e5 : true;
                return (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ maxWidth: 320 }}>
                      <MuiLink component={RouterLink} to={`/client/${r.id}`} fontWeight={700} underline="hover">{r.name}</MuiLink>
                      {r.status === "paused" && <Chip size="small" label="Paused" sx={{ ml: 1 }} />}
                      {r.planEnded && <Chip size="small" color="error" variant="outlined" label="Plan ended" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell>{r.caseType}</TableCell>
                    <TableCell><Chip size="small" color={TONE[k]} variant={k === "b90" ? "filled" : "outlined"} label={labelOf(k)} /></TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>{money(r.aging.total)}</TableCell>
                    <TableCell align="right">{r.missedMonths || "—"}</TableCell>
                    <TableCell>{r.lastPayment ? `${money(r.lastPayment.amount)} · ${r.lastPayment.date}` : <Typography variant="body2" color="error.main">Never</Typography>}</TableCell>
                    <TableCell>
                      <Typography variant="body2" color={quiet ? "error.main" : "text.primary"}>{r.lastContact?.at ? ago(r.lastContact.at) : "Never"}</Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && list.length === 0 && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}>No one matches these filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={list.length} page={page} onPageChange={(_, p) => setPage(p)} rowsPerPage={perPage} onRowsPerPageChange={(e) => reset(setPerPage)(parseInt(e.target.value, 10))} rowsPerPageOptions={[25, 50, 100, 250]} />
      </Card>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
        Installments age from the 1st of their month, and payments always go to the oldest installment first, so a client who pays their oldest month moves to a newer bucket right away. Last contact in red: no call or logged contact in 30+ days. The CSV also splits each client's debt installment by installment for the accountant. Closed clients are excluded.
      </Typography>
    </Box>
  );
}
