// src/ClientList.js
// Clients: find anyone fast and see where they stand. Numbers come from the same
// calculation as the client profile and Reports (src/billing/portfolio.js).
import React, { useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, LinearProgress,
  MenuItem, Snackbar, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow,
  TableSortLabel, TextField, Tooltip, Typography, Link as MuiLink, Card,
} from "@mui/material";
import SearchRounded from "@mui/icons-material/SearchRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import { Link as RouterLink } from "react-router-dom";
import { doc, deleteDoc } from "firebase/firestore";
import db from "./firebase";
import EditClient from "./EditClient.jsx";
import { useAuth } from "./auth/useAuth";
import { useClients } from "./data/ClientsProvider";
import { usePortfolio, money } from "./billing/portfolio";
import { PageHeader } from "./ui/kit";

/** "A(11-26) • SPOUSE I-360+AOS • QUE" from a long MyCase case title. */
function compactCaseTag(title, name) {
  const raw = (title || "").trim();
  if (!raw) return "";
  const prefix = (raw.match(/^[A-Z]\s*\(\d{2}-\d{2}\)/i) || [""])[0].replace(/\s+/g, "");
  let detail = ((raw.match(/\(([^)]+)\)/g) || []).map((m) => m.slice(1, -1)).find((m) => !/^\d{2}-\d{2}$/.test(m)) || "").replace(/\s*\+\s*/g, "+").trim();
  if (name) detail = detail.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "").trim();
  return [prefix, detail].filter(Boolean).join(" • ") || raw.slice(0, 40);
}

const VIEWS = [
  { key: "all", label: "All", test: () => true },
  // Same rule as Home and Reports: active plans only (paused clients have their own view).
  { key: "pastdue", label: "Past due", test: (r) => r.amountDue > 0 && r.status === "active" && r.inPlan },
  { key: "ended", label: "Plan ended, still owes", test: (r) => r.planEnded && r.status === "active" && r.inPlan },
  { key: "current", label: "Current", test: (r) => r.inPlan && r.amountDue <= 0 && r.balance > 0 && r.status === "active" },
  { key: "waiting", label: "Waiting for a plan", test: (r) => r.awaitingPlan && r.status !== "closed" },
  { key: "paused", label: "Paused", test: (r) => r.status === "paused" },
  { key: "hold", label: "On hold", test: (r) => r.onHold },
  { key: "paid", label: "Paid in full", test: (r) => r.paidInFull },
  { key: "closed", label: "Closed", test: (r) => r.status === "closed" },
];
const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  amountDue: (a, b) => a.amountDue - b.amountDue,
  balance: (a, b) => a.balance - b.balance,
  missedMonths: (a, b) => a.missedMonths - b.missedMonths,
  lastPayment: (a, b) => String(a.lastPayment?.date || "").localeCompare(String(b.lastPayment?.date || "")),
};

function statusChip(r) {
  if (r.status === "closed") return <Chip size="small" label="Closed" />;
  if (r.status === "paused") return <Chip size="small" label="Paused" color="warning" variant="outlined" />;
  if (r.awaitingPlan) return <Chip size="small" label="Waiting for plan" color="info" variant="outlined" />;
  if (r.paidInFull) return <Chip size="small" label="Paid in full" color="success" variant="outlined" />;
  if (r.amountDue > 0) return <Chip size="small" label={r.planEnded ? "Plan ended" : `${r.missedMonths} mo behind`} color={r.missedMonths >= 3 || r.planEnded ? "error" : "secondary"} />;
  if (r.inPlan) return <Chip size="small" label="Current" color="success" />;
  return <Chip size="small" label="No plan" variant="outlined" />;
}

export default function ClientList() {
  const { isEditorOrHigher, canManageUsers } = useAuth();
  const { clients, loading } = useClients();
  const { rows } = usePortfolio(clients);
  const byId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const [view, setView] = useState("all");
  const [search, setSearch] = useState("");
  const [caseType, setCaseType] = useState("Any");
  const [source, setSource] = useState("Any");
  const [sort, setSort] = useState({ by: "name", dir: "asc" });
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast] = useState(null);

  const caseTypes = useMemo(() => ["Any", ...[...new Set(rows.map((r) => r.caseType).filter((t) => t && t !== "—"))].sort()], [rows]);
  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.key, rows.filter(v.test).length])), [rows]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const test = VIEWS.find((v) => v.key === view).test;
    const out = rows.filter(
      (r) =>
        test(r) &&
        (caseType === "Any" || r.caseType === caseType) &&
        (source === "Any" || r.source === source) &&
        (!q || r.name.toLowerCase().includes(q) || r.caseTitle.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
    );
    out.sort((a, b) => (sort.dir === "asc" ? 1 : -1) * SORTS[sort.by](a, b));
    return out;
  }, [rows, view, search, caseType, source, sort]);

  const setSortBy = (by) => setSort((s) => ({ by, dir: s.by === by && s.dir === "desc" ? "asc" : by === "name" ? "asc" : "desc" }));
  const reset = (fn) => (v) => {
    fn(v);
    setPage(0);
  };

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Client", "Case title", "Case type", "Status", "Months behind", "Owed now", "Balance left", "Last payment", "Source", "MyCase link"];
    const body = list.map((r) => [r.name, r.caseTitle, r.caseType, r.status, r.missedMonths, r.amountDue.toFixed(2), r.balance.toFixed(2), r.lastPayment?.date || "", r.source, r.myCaseLink]);
    const url = URL.createObjectURL(new Blob([[head, ...body].map((x) => x.map(esc).join(",")).join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `clients-${view}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const confirmDelete = async () => {
    try {
      await deleteDoc(doc(db, "clients", deleting.id));
      setToast({ type: "success", msg: `${deleting.name} deleted.` });
    } catch (e) {
      setToast({ type: "error", msg: e.message || "Could not delete." });
    } finally {
      setDeleting(null);
    }
  };

  const head = (by, label, align) => (
    <TableCell align={align} sortDirection={sort.by === by ? sort.dir : false}>
      <TableSortLabel active={sort.by === by} direction={sort.by === by ? sort.dir : "asc"} onClick={() => setSortBy(by)}>
        {label}
      </TableSortLabel>
    </TableCell>
  );

  return (
    <Box>
      <PageHeader
        title="Clients"
        subtitle="Search anyone, or pick a view to see who is behind, waiting for a plan or paid in full."
        actions={<Button startIcon={<DownloadRounded />} onClick={exportCsv} disabled={!list.length}>Download {list.length.toLocaleString()} (CSV)</Button>}
      />

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
        {VIEWS.map((v) => (
          <Chip
            key={v.key}
            label={`${v.label} · ${counts[v.key]?.toLocaleString() ?? 0}`}
            onClick={() => reset(setView)(v.key)}
            color={view === v.key ? "primary" : "default"}
            variant={view === v.key ? "filled" : "outlined"}
          />
        ))}
      </Stack>

      <Card>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ p: 2 }}>
          <TextField
            placeholder="Search by name or case title"
            value={search}
            onChange={(e) => reset(setSearch)(e.target.value)}
            sx={{ flex: 1, minWidth: 220 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }}
          />
          <TextField select label="Case type" value={caseType} onChange={(e) => reset(setCaseType)(e.target.value)} sx={{ minWidth: 200 }}>
            {caseTypes.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <TextField select label="Source" value={source} onChange={(e) => reset(setSource)(e.target.value)} sx={{ minWidth: 200 }}>
            {["Any", "MyCase", "Rebuilt from MyCase", "Hand-entered"].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
        </Stack>
        {loading && <LinearProgress />}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {head("name", "Client")}
                <TableCell>Case type</TableCell>
                <TableCell>Status</TableCell>
                {head("amountDue", "Owed now", "right")}
                {head("balance", "Balance left", "right")}
                {head("lastPayment", "Last payment")}
                <TableCell>Promise</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.slice(page * perPage, page * perPage + perPage).map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={{ maxWidth: 320 }}>
                    <MuiLink component={RouterLink} to={`/client/${r.id}`} fontWeight={700} underline="hover">{r.name}</MuiLink>
                    <Typography variant="caption" color="text.secondary" display="block" noWrap title={r.caseTitle}>
                      {compactCaseTag(r.caseTitle, r.name)}
                    </Typography>
                  </TableCell>
                  <TableCell>{r.caseType}</TableCell>
                  <TableCell>{statusChip(r)}</TableCell>
                  <TableCell align="right">
                    {r.amountDue > 0 ? <Typography fontWeight={800} color="secondary.main" component="span">{money(r.amountDue)}</Typography> : "—"}
                  </TableCell>
                  <TableCell align="right">{r.balance > 0 ? money(r.balance) : "—"}</TableCell>
                  <TableCell>
                    {r.lastPayment ? (
                      <>
                        {money(r.lastPayment.amount)}
                        <Typography variant="caption" color="text.secondary" display="block">{r.lastPayment.date}</Typography>
                      </>
                    ) : "—"}
                  </TableCell>
                  <TableCell>{r.promise?.date ? <Chip size="small" variant="outlined" label={`${money(r.promise.amount)} on ${String(r.promise.date).slice(0, 10)}`} /> : "—"}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    {r.myCaseLink && (
                      <Tooltip title="Open in MyCase">
                        <IconButton size="small" href={r.myCaseLink} target="_blank" rel="noopener noreferrer"><OpenInNewRounded fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                    {isEditorOrHigher() && (
                      <Tooltip title="Edit name and case">
                        <IconButton size="small" onClick={() => setEditing(byId.get(r.id))}><EditRounded fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                    {canManageUsers() && (
                      <Tooltip title="Delete client (admins)">
                        <IconButton size="small" color="error" onClick={() => setDeleting(r)}><DeleteOutlineRounded fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && list.length === 0 && (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 5 }}>No clients match. Try another view or clear the search.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={list.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={perPage}
          onRowsPerPageChange={(e) => reset(setPerPage)(parseInt(e.target.value, 10))}
          rowsPerPageOptions={[25, 50, 100]}
        />
      </Card>

      {editing && <EditClient client={editing} onClose={() => setEditing(null)} onSave={() => setEditing(null)} />}

      <Dialog open={!!deleting} onClose={() => setDeleting(null)}>
        <DialogTitle>Delete {deleting?.name}?</DialogTitle>
        <DialogContent>
          <Typography>This permanently removes the client and their payment history from Collections. It cannot be undone. To stop billing someone, close the client from their profile instead.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>Delete permanently</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}>
        {toast ? <Alert severity={toast.type} variant="filled">{toast.msg}</Alert> : <span />}
      </Snackbar>
    </Box>
  );
}
