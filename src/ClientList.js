// src/ClientList.js
// Clients as a work queue: pick a list on the left and go down it; the selected client's
// money, last 12 months, history and a quick call log open on the right
// (src/Clients/ClientPanel.jsx). Numbers come from the prepared rows (src/billing/book.js).
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, LinearProgress,
  MenuItem, Snackbar, Stack, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import SearchRounded from "@mui/icons-material/SearchRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import TuneRounded from "@mui/icons-material/TuneRounded";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import { doc, deleteDoc, getDoc } from "firebase/firestore";
import db from "./firebase";
import EditClient from "./EditClient.jsx";
import { useAuth } from "./auth/useAuth";
import { useBook } from "./data/BookProvider";
import { money } from "./billing/portfolio";
import { PageHeader } from "./ui/kit";
import { callLink } from "./billing/contact";
import ClientPanel, { initials } from "./Clients/ClientPanel";

const VIEWS = [
  // Same rule as Home and Reports: active plans only (paused clients have their own view).
  { key: "pastdue", label: "Past due", test: (r) => r.amountDue > 0 && r.status === "active" && r.inPlan },
  { key: "ended", label: "Plan ended", test: (r) => r.planEnded && r.status === "active" && r.inPlan },
  { key: "nocontact", label: "No contact 30d+", test: (r) => r.needsContact },
  { key: "waiting", label: "Waiting for a plan", test: (r) => r.awaitingPlan && r.status !== "closed" },
  { key: "current", label: "Current", test: (r) => r.inPlan && r.amountDue <= 0 && r.balance > 0 && r.status === "active" },
  { key: "all", label: "All", test: () => true },
  { key: "paused", label: "Paused", test: (r) => r.status === "paused" },
  { key: "hold", label: "On hold", test: (r) => r.onHold },
  { key: "paid", label: "Paid in full", test: (r) => r.paidInFull },
  { key: "closed", label: "Closed", test: (r) => r.status === "closed" },
];
const contactTime = (r) => (r.lastContact?.at ? new Date(r.lastContact.at).getTime() : 0);
const SORTS = {
  owed: { label: "Owed now", fn: (a, b) => b.amountDue - a.amountDue || a.name.localeCompare(b.name) },
  behind: { label: "Months behind", fn: (a, b) => b.missedMonths - a.missedMonths || b.amountDue - a.amountDue },
  contact: { label: "Longest since contact", fn: (a, b) => contactTime(a) - contactTime(b) },
  balance: { label: "Balance left", fn: (a, b) => b.balance - a.balance },
  lastPayment: { label: "Oldest last payment", fn: (a, b) => String(a.lastPayment?.date || "").localeCompare(String(b.lastPayment?.date || "")) },
  name: { label: "Name", fn: (a, b) => a.name.localeCompare(b.name) },
};
const PAGE = 100;

function statusChip(r) {
  if (r.status === "closed") return <Chip size="small" label="Closed" />;
  if (r.status === "paused") return <Chip size="small" label="Paused" color="warning" variant="outlined" />;
  if (r.awaitingPlan) return <Chip size="small" label="Waiting for plan" color="info" variant="outlined" />;
  if (r.paidInFull) return <Chip size="small" label="Paid in full" color="success" variant="outlined" />;
  if (r.amountDue > 0) return <Chip size="small" label={r.planEnded ? "Plan ended" : `${r.missedMonths} mo behind`} color={r.missedMonths >= 3 || r.planEnded ? "error" : "secondary"} />;
  if (r.inPlan) return <Chip size="small" label="Current" color="success" />;
  return <Chip size="small" label="No plan" variant="outlined" />;
}
function statusDot(r) {
  if (r.status === "closed") return ["Closed", "text.disabled"];
  if (r.status === "paused") return ["Paused", "warning.main"];
  if (r.awaitingPlan) return ["Waiting for plan", "info.main"];
  if (r.paidInFull) return ["Paid in full", "success.main"];
  if (r.amountDue > 0) return [r.planEnded ? "Plan ended" : `${r.missedMonths} mo behind`, r.missedMonths >= 3 || r.planEnded ? "error.main" : "secondary.main"];
  if (r.inPlan) return ["Current", "success.main"];
  return ["No plan", "text.disabled"];
}
const daysSince = (d) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 864e5)) : null);

export default function ClientList() {
  const theme = useTheme();
  const { isEditorOrHigher, canManageUsers } = useAuth();
  const editor = isEditorOrHigher();
  const admin = canManageUsers();
  // Prepared rows (src/data/BookProvider.jsx); the full record is read for the selected client.
  const { rows, ready } = useBook();
  const loading = !ready;
  const [params, setParams] = useSearchParams();

  const [view, setView] = useState(params.get("view") || "pastdue");
  const [search, setSearch] = useState("");
  const [caseType, setCaseType] = useState("Any");
  const [source, setSource] = useState("Any");
  const [sort, setSort] = useState("owed");
  const [showFilters, setShowFilters] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [selectedId, setSelectedId] = useState(params.get("id") || null);
  const [loggedNow, setLoggedNow] = useState({});
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast] = useState(null);
  const listRef = useRef(null);

  const caseTypes = useMemo(() => ["Any", ...[...new Set(rows.map((r) => r.caseType).filter((t) => t && t !== "—"))].sort()], [rows]);
  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.key, rows.filter(v.test).length])), [rows]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const test = (VIEWS.find((v) => v.key === view) || VIEWS[0]).test;
    const out = rows.filter(
      (r) =>
        // A search looks through every client, whatever list is open.
        (q ? true : test(r)) &&
        (caseType === "Any" || r.caseType === caseType) &&
        (source === "Any" || r.source === source) &&
        (!q || r.name.toLowerCase().includes(q) || r.caseTitle.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) ||
          (digits.length >= 4 && (r.phones || []).some((p) => String(p).replace(/\D/g, "").includes(digits))))
    );
    out.sort(SORTS[sort].fn);
    return out;
  }, [rows, view, search, caseType, source, sort]);

  // Keep a selection inside the list; remember view + client in the address (Back works).
  const selected = list.find((r) => r.id === selectedId) || null;
  useEffect(() => {
    if (!loading && list.length && !list.some((r) => r.id === selectedId)) setSelectedId(list[0].id);
  }, [list, selectedId, loading]);
  useEffect(() => {
    const next = new URLSearchParams();
    next.set("view", view);
    if (selectedId) next.set("id", selectedId);
    setParams(next, { replace: true });
  }, [view, selectedId, setParams]);

  const index = selected ? list.indexOf(selected) : -1;
  const move = (step) => {
    if (!list.length) return;
    const i = Math.max(0, Math.min(list.length - 1, (index < 0 ? 0 : index) + step));
    if (i >= shown) setShown((s) => s + PAGE);
    setSelectedId(list[i].id);
  };
  // ↑/↓ (or J/K) move through the list, C calls the selected client. Ignored while typing.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.closest?.("[role=dialog],[role=listbox],[role=menu]"))) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); move(-1); }
      else if ((e.key === "c" || e.key === "C") && selected?.phones?.[0]) window.location.href = callLink(selected.phones[0]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-id="${selectedId}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const pickView = (v) => {
    setView(v);
    setShown(PAGE);
    setSelectedId(null);
    setSort(v === "nocontact" ? "contact" : v === "all" || v === "paid" || v === "closed" || v === "waiting" ? "name" : "owed");
  };

  const openEditor = async (id) => {
    const s = await getDoc(doc(db, "clients", id));
    if (s.exists()) setEditing({ id: s.id, ...s.data() });
  };
  const confirmDelete = async () => {
    try {
      await deleteDoc(doc(db, "clients", deleting.id));
      setToast({ type: "success", msg: `${deleting.name} deleted.` });
      setSelectedId(null);
    } catch (e) {
      setToast({ type: "error", msg: e.message || "Could not delete." });
    } finally {
      setDeleting(null);
    }
  };

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Client", "Case title", "Case type", "MyCase stage", "Status", "Months behind", "Owed now", "Balance left", "Last payment", "Source", "MyCase link"];
    const body = list.map((r) => [r.name, r.caseTitle, r.caseType, r.mycaseStage || "", r.status, r.missedMonths, r.amountDue.toFixed(2), r.balance.toFixed(2), r.lastPayment?.date || "", r.source, r.myCaseLink]);
    const url = URL.createObjectURL(new Blob([[head, ...body].map((x) => x.map(esc).join(",")).join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `clients-${view}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtersOn = caseType !== "Any" || source !== "Any";

  return (
    <Box>
      <PageHeader
        title="Clients"
        subtitle="Pick a list and work it top to bottom: the client's money, last 12 months and history open on the right."
        actions={
          <>
            <Button startIcon={<DownloadRounded />} onClick={exportCsv} disabled={!list.length}>CSV ({list.length.toLocaleString()})</Button>
            {editor && <Button variant="contained" component={RouterLink} to="/create-client">New client</Button>}
          </>
        }
      />

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "400px minmax(0, 1fr)" }, alignItems: "start" }}>
        {/* The list */}
        <Card sx={{ position: { lg: "sticky" }, top: { lg: 80 }, display: "flex", flexDirection: "column", maxHeight: { lg: "calc(100vh - 100px)" }, overflow: "hidden" }}>
          <Tabs value={view} onChange={(e, v) => pickView(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ borderBottom: 1, borderColor: "divider", minHeight: 46, px: 0.5 }}>
            {VIEWS.map((v) => (
              <Tab key={v.key} value={v.key} sx={{ textTransform: "none", fontWeight: 800, minHeight: 46, px: 1.25, minWidth: 0 }}
                label={<Stack direction="row" spacing={0.75} alignItems="center"><span>{v.label}</span><Chip size="small" label={(counts[v.key] || 0).toLocaleString()} color={view === v.key ? "primary" : "default"} sx={{ height: 19, fontSize: 11, fontWeight: 800 }} /></Stack>} />
            ))}
          </Tabs>
          <Stack direction="row" spacing={1} sx={{ p: 1.25, borderBottom: 1, borderColor: "divider" }}>
            <TextField size="small" placeholder="Search name, case or phone" value={search} onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} sx={{ flex: 1 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }} />
            <TextField size="small" select value={sort} onChange={(e) => setSort(e.target.value)} sx={{ width: 150 }} SelectProps={{ renderValue: (v) => `Sort: ${SORTS[v].label}` }}>
              {Object.entries(SORTS).map(([k, s]) => <MenuItem key={k} value={k}>{s.label}</MenuItem>)}
            </TextField>
            <Button size="small" variant={filtersOn ? "contained" : "outlined"} onClick={() => setShowFilters((v) => !v)} sx={{ minWidth: 40, px: 1 }} title="Case type and source"><TuneRounded fontSize="small" /></Button>
          </Stack>
          {showFilters && (
            <Stack direction="row" spacing={1} sx={{ p: 1.25, pt: 0, borderBottom: 1, borderColor: "divider" }}>
              <TextField size="small" select label="Case type" value={caseType} onChange={(e) => { setCaseType(e.target.value); setShown(PAGE); }} sx={{ flex: 1 }}>
                {caseTypes.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
              <TextField size="small" select label="Source" value={source} onChange={(e) => { setSource(e.target.value); setShown(PAGE); }} sx={{ flex: 1 }}>
                {["Any", "MyCase", "Rebuilt from MyCase", "MyCase, invoices to tag", "Typed by hand"].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
            </Stack>
          )}
          {loading && <LinearProgress />}
          <Box ref={listRef} sx={{ overflowY: "auto", flex: 1, maxHeight: { xs: 420, lg: "none" } }}>
            {list.slice(0, shown).map((r) => {
              const on = r.id === selectedId;
              const [label, color] = statusDot(r);
              const contactAt = loggedNow[r.id] || r.lastContact?.at;
              const days = daysSince(contactAt);
              return (
                <Box key={r.id} data-id={r.id} onClick={() => setSelectedId(r.id)}
                  sx={{
                    display: "grid", gridTemplateColumns: "34px minmax(0,1fr) auto", gap: 1.25, alignItems: "center", px: 1.75, py: 1.25, cursor: "pointer", position: "relative",
                    borderBottom: 1, borderColor: "divider", bgcolor: on ? alpha(theme.palette.primary.main, 0.08) : "transparent",
                    "&:hover": { bgcolor: on ? alpha(theme.palette.primary.main, 0.1) : alpha(theme.palette.primary.main, 0.03) },
                    "&::before": on ? { content: '""', position: "absolute", left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, bgcolor: "primary.main" } : undefined,
                  }}>
                  <Box sx={{ width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 12, bgcolor: alpha(theme.palette.primary.main, 0.1), color: "primary.main" }}>{initials(r.name)}</Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={800} noWrap>{r.name}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap component="div">
                      {r.caseType && r.caseType !== "—" ? `${r.caseType} · ` : ""}
                      <Box component="span" sx={{ color, fontWeight: 800 }}>● {label}</Box>
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "right" }}>
                    <Typography variant="body2" fontWeight={800} color={r.amountDue > 0 ? "secondary.main" : "success.main"}>{r.amountDue > 0 ? money(r.amountDue) : r.awaitingPlan ? "—" : "$0"}</Typography>
                    <Typography variant="caption" color={days == null || days >= 30 ? "error.main" : "text.secondary"} fontWeight={700} noWrap component="div">
                      {days == null ? "never contacted" : days === 0 ? "contacted today" : `${days}d since contact`}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
            {list.length > shown && (
              <Box sx={{ p: 1.5, textAlign: "center" }}><Button size="small" onClick={() => setShown((s) => s + PAGE)}>Show {Math.min(PAGE, list.length - shown)} more</Button></Box>
            )}
            {!loading && list.length === 0 && <Typography color="text.secondary" sx={{ p: 4, textAlign: "center" }}>No clients match. Try another list or clear the search.</Typography>}
          </Box>
          <Stack direction="row" justifyContent="space-between" sx={{ px: 1.75, py: 1, borderTop: 1, borderColor: "divider", color: "text.secondary" }}>
            <Typography variant="caption" fontWeight={700}>{index >= 0 ? `${(index + 1).toLocaleString()} of ` : ""}{list.length.toLocaleString()} clients{search.trim() ? " · searching all clients" : ""}</Typography>
            <Typography variant="caption" fontWeight={700} sx={{ display: { xs: "none", sm: "block" } }}>↑ ↓ move · C call</Typography>
          </Stack>
        </Card>

        {/* The selected client */}
        <ClientPanel
          row={selected}
          status={selected ? statusChip(selected) : null}
          editor={editor}
          admin={admin}
          onEdit={openEditor}
          onDelete={setDeleting}
          onLogged={(id, at) => setLoggedNow((m) => ({ ...m, [id]: at }))}
          notify={setToast}
        />
      </Box>

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
