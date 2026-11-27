// src/pages/LinkProblems.jsx
// Case Setup, "Link problems" tab: Collections records the MyCase sync cannot match to
// exactly one case (built by the sync: functions/linkIssues.js).
//   - Not linked to a case: their payments never sync. The record and the suggested MyCase
//     case are shown side by side, field by field, with what matches, so billing can tell
//     whether they are the same before linking.
//   - Two records on one case: usually a duplicate; both records are shown side by side
//     against the case, and billing keeps one for MyCase.
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, Chip, CircularProgress, Link, MenuItem, Stack, TablePagination, TextField, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { collection, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Link as RouterLink } from "react-router-dom";
import db, { app } from "../firebase";
import { caseTypeFromMyCase } from "../billing/caseTypes";
import { displayPhone } from "../billing/contact";

const MYCASE = "https://law-firm-of-moumita-rahman-pllc.mycase.com/court_cases/";
const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const day = (v) => {
  const s = String(v || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  return new Date(`${s}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const words = (s) => String(s || "").toUpperCase().replace(/[^A-Z\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);
// "A (03-25) VENTURA, MARISOL (SPOUSE I-360) Queens - (HOLD ...)" -> "VENTURA MARISOL SPOUSE I 360 QUEENS"
const caseCore = (s) => String(s || "").toUpperCase().replace(/^\s*[A-Z]\s*\(\s*\d{1,2}\s*-\s*\d{2}\s*\)\s*/, "").replace(/\s+-\s+\(.*$/, "").replace(/[^A-Z0-9]+/g, " ").trim();

/** same | close | differs | unknown, for each field compared. */
function compare(rec, k) {
  const out = {};
  // Name: same words in any order; close when they share a word (e.g. a middle name).
  const a = new Set(words(rec.clientName));
  const best = (k.clientNames || []).map((n) => {
    const b = words(n);
    const shared = b.filter((w) => a.has(w)).length;
    return shared === a.size && shared === b.length ? 2 : shared ? 1 : 0;
  });
  out.name = !a.size || !(k.clientNames || []).length ? "unknown" : Math.max(...best) === 2 ? "same" : Math.max(...best) === 1 ? "close" : "differs";
  // Case: the title typed in Collections vs the MyCase case name (ignoring the A/F prefix).
  const t1 = caseCore(rec.caseTitle), t2 = caseCore(k.name);
  out.case = !t1 ? "unknown" : t1 === t2 ? "same" : t1 && t2 && (t2.includes(t1) || t1.includes(t2) || words(t1).filter((w) => words(t2).includes(w)).length >= 3) ? "close" : "differs";
  const ct = caseTypeFromMyCase(k.practiceArea);
  out.type = !rec.caseType || !ct ? "unknown" : rec.caseType.toUpperCase() === ct ? "same" : "differs";
  // Started: first payment / plan start vs the date the case was opened.
  const s1 = Date.parse(rec.startDate || ""), s2 = Date.parse(k.openedDate || "");
  const gap = Math.abs(s1 - s2) / 864e5;
  out.start = !s1 || !s2 ? "unknown" : gap <= 45 ? "same" : gap <= 120 ? "close" : "differs";
  const t = Number(rec.invoiceTotal || 0), kt = Number(k.invoiceTotal || 0);
  out.total = !t || !kt ? "unknown" : Math.abs(t - kt) <= 1 ? "same" : Math.abs(t - kt) / Math.max(t, kt) <= 0.2 ? "close" : "differs";
  const p = Number(rec.paid || 0), kp = Number(k.invoicePaid || 0);
  out.paid = !p && !kp ? "unknown" : Math.abs(p - kp) <= 1 ? "same" : Math.abs(p - kp) / Math.max(p, kp, 1) <= 0.2 ? "close" : "differs";
  const known = Object.values(out).filter((v) => v !== "unknown");
  const points = known.reduce((s, v) => s + (v === "same" ? 1 : v === "close" ? 0.5 : 0), 0);
  const share = known.length ? points / known.length : 0;
  return { fields: out, same: known.filter((v) => v === "same").length, of: known.length, level: share >= 0.8 ? "strong" : share >= 0.5 ? "possible" : "weak" };
}

function Mark({ v }) {
  const theme = useTheme();
  if (v === "unknown") return <Typography variant="caption" color="text.disabled" fontWeight={800}>—</Typography>;
  const c = { same: theme.palette.success.main, close: theme.palette.warning.main, differs: theme.palette.error.main }[v];
  return (
    <Box component="span" sx={{ fontSize: 11, fontWeight: 800, px: 1, py: 0.2, borderRadius: 99, color: c, bgcolor: alpha(c, 0.12), whiteSpace: "nowrap" }}>
      {{ same: "✓ same", close: "≈ close", differs: "✕ differs" }[v]}
    </Box>
  );
}

function Side({ title, color, rows }) {
  return (
    <Box sx={{ p: 2, minWidth: 0 }}>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color }} />
        <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ letterSpacing: ".1em", textTransform: "uppercase" }}>{title}</Typography>
      </Stack>
      {rows.map(([label, value], i) => (
        <Box key={label} sx={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: 1, alignItems: "center", minHeight: 36, py: 0.5, borderTop: i ? "1px dashed" : 0, borderColor: "divider" }}>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>{label}</Typography>
          <Typography variant="body2" fontWeight={700} sx={{ wordBreak: "break-word" }}>{value || "—"}</Typography>
        </Box>
      ))}
    </Box>
  );
}

const FIELDS = [["name", "Name"], ["case", "Case"], ["type", "Case type"], ["start", "Started"], ["total", "Billed"], ["paid", "Paid"]];

function UnlinkedCard({ u, busy, note, onLink }) {
  const theme = useTheme();
  const [pick, setPick] = useState(0);
  const k = (u.candidates || [])[pick];
  const cmp = k ? compare(u, k) : null;
  const levelColor = cmp ? { strong: theme.palette.success.main, possible: theme.palette.warning.main, weak: theme.palette.error.main }[cmp.level] : theme.palette.text.secondary;
  const recRows = [
    ["Name", <Link component={RouterLink} to={`/client/${u.clientId}`} underline="hover" fontWeight={800}>{u.clientName}</Link>],
    ["Case", u.caseTitle || "(no case title)"],
    ["Case type", u.caseType],
    ["Started", day(u.startDate) || (u.createdAt ? `record created ${day(u.createdAt)}` : "")],
    ["Billed", u.invoiceTotal ? `${money(u.invoiceTotal)}${u.initialPaymentAmount ? ` · initial ${money(u.initialPaymentAmount)}` : ""}` : ""],
    ["Paid", u.payments ? `${money(u.paid)} · ${u.payments} payment${u.payments === 1 ? "" : "s"}${u.lastPayment ? ` · last ${day(u.lastPayment)}` : ""}` : "no payments"],
  ];
  const caseRows = k
    ? [
        ["Name", (k.clientNames || []).join(", ")],
        ["Case", <Link href={MYCASE + k.caseId} target="_blank" rel="noopener noreferrer" underline="hover" fontWeight={800}>{k.name}</Link>],
        ["Case type", caseTypeFromMyCase(k.practiceArea) ? `${caseTypeFromMyCase(k.practiceArea)} (${k.practiceArea})` : k.practiceArea],
        ["Started", day(k.openedDate) ? `opened ${day(k.openedDate)}` : ""],
        ["Billed", k.invoiceTotal != null ? `${money(k.invoiceTotal)} · ${k.invoiceCount || 0} invoice${k.invoiceCount === 1 ? "" : "s"}` : ""],
        ["Paid", k.invoicePaid != null ? `${money(k.invoicePaid)}${k.lastPaymentDate ? ` · last ${day(k.lastPaymentDate)}` : ""}${k.openBalance ? ` · ${money(k.openBalance)} open` : ""}` : ""],
      ]
    : [];
  return (
    <Card sx={{ mb: 1.5, overflow: "hidden" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: "divider" }} useFlexGap flexWrap="wrap">
        <Typography fontWeight={800}>{u.clientName}</Typography>
        {cmp ? (
          <Box component="span" sx={{ fontSize: 12.5, fontWeight: 800, px: 1.25, py: 0.4, borderRadius: 99, color: levelColor, bgcolor: alpha(levelColor, 0.12) }}>
            {cmp.level === "strong" ? "✓ Strong match" : cmp.level === "possible" ? "? Possible match" : "✕ Weak match"} · {cmp.same} of {cmp.of} the same
          </Box>
        ) : (
          <Chip size="small" label="No case suggested" />
        )}
      </Stack>
      {k ? (
        // One row per field (record | match | case) so the three columns always line up.
        <Box sx={{ px: 2, py: 1.25 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "84px minmax(0,1fr) 96px minmax(0,1fr)" }, columnGap: 1.5, pb: 0.75 }}>
            <span />
            {[["In Collections", theme.palette.primary.main], ["Match", null], [`Suggested MyCase case${u.candidates.length > 1 ? ` (${pick + 1} of ${u.candidates.length})` : ""}`, theme.palette.secondary.main]].map(([t, c]) => (
              <Stack key={t} direction="row" spacing={0.75} alignItems="center" justifyContent={c ? "flex-start" : "center"} sx={{ display: { xs: c ? "flex" : "none", md: "flex" } }}>
                {c && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: c }} />}
                <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ letterSpacing: ".1em", textTransform: "uppercase" }}>{t}</Typography>
              </Stack>
            ))}
          </Box>
          {FIELDS.map(([f, label], i) => (
            <Box key={f} sx={{ display: "grid", gridTemplateColumns: { xs: "84px 1fr", md: "84px minmax(0,1fr) 96px minmax(0,1fr)" }, columnGap: 1.5, rowGap: 0.5, alignItems: "center", py: 0.9, borderTop: "1px dashed", borderColor: "divider" }}>
              <Typography variant="caption" color="text.secondary" fontWeight={700}>{label}</Typography>
              <Typography variant="body2" fontWeight={700} sx={{ wordBreak: "break-word" }}>{recRows[i][1] || "—"}</Typography>
              <Box sx={{ textAlign: "center", gridColumn: { xs: "1 / 2", md: "auto" } }}><Mark v={cmp.fields[f]} /></Box>
              <Typography variant="body2" fontWeight={700} sx={{ wordBreak: "break-word", color: "text.primary" }}>{caseRows[i][1] || "—"}</Typography>
            </Box>
          ))}
        </Box>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
          <Side title="In Collections" color={theme.palette.primary.main} rows={recRows} />
          <Box sx={{ p: 2, borderLeft: { md: 1 }, borderColor: "divider" }}>
            <Typography variant="body2" color="text.secondary">
              No MyCase case could be found from the link or the case title. Find the case in MyCase and paste its link on the client&apos;s Edit Client.
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, wordBreak: "break-all" }}>Current link: {u.link || "(empty)"}</Typography>
          </Box>
        </Box>
      )}
      <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }} sx={{ px: 2, py: 1.25, borderTop: 1, borderColor: "divider", bgcolor: alpha(theme.palette.primary.main, 0.025) }}>
        <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ flex: 1 }}>
          {k ? `${k.reason} ${k.phone ? `MyCase phone: ${displayPhone(k.phone)}.` : ""}` : "The record keeps its hand-entered payments until it is linked."}
        </Typography>
        {note && <Typography variant="caption" color={/link/i.test(note) ? "success.main" : "warning.main"} fontWeight={800}>{note}</Typography>}
        {u.candidates?.length > 1 && (
          <TextField size="small" select value={pick} onChange={(e) => setPick(Number(e.target.value))} sx={{ minWidth: 220 }}>
            {u.candidates.map((c, i) => <MenuItem key={c.caseId} value={i}>{`Compare with: ${c.name}`.slice(0, 60)}</MenuItem>)}
          </TextField>
        )}
        <Button size="small" component={RouterLink} to={`/client/${u.clientId}`}>Open record</Button>
        {k && <Button size="small" variant="contained" disabled={busy} onClick={() => onLink(u, k)}>Link these</Button>}
      </Stack>
    </Card>
  );
}

function SharedCard({ s, busy, notes, onKeep }) {
  const theme = useTheme();
  const k = s.case || {};
  const rowsFor = (c) => [
    ["Name", <Link component={RouterLink} to={`/client/${c.clientId}`} underline="hover" fontWeight={800}>{c.clientName}</Link>],
    ["Created", c.createdAt ? `${day(c.createdAt)}${c.source ? ` · ${c.source === "rebuilt" ? "rebuilt from MyCase" : "typed by hand"}` : ""}` : ""],
    ["Case type", c.caseType || c.caseStatus],
    ["Started", day(c.startDate)],
    ["Billed", c.invoiceTotal ? `${money(c.invoiceTotal)}${c.initialPaymentAmount ? ` · initial ${money(c.initialPaymentAmount)}` : ""}` : "no plan"],
    ["Paid", c.payments ? `${money(c.paid)} · ${c.payments} payment${c.payments === 1 ? "" : "s"}${c.lastPayment ? ` · last ${day(c.lastPayment)}` : ""}` : "no payments"],
  ];
  // Which record's amounts line up with the case.
  const near = (a, b) => a && b && Math.abs(a - b) / Math.max(a, b) <= 0.2;
  return (
    <Card sx={{ mb: 1.5, overflow: "hidden" }}>
      <Box sx={{ px: 2, py: 1.25, bgcolor: alpha(theme.palette.primary.main, 0.07), borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="body2" fontWeight={800} color="primary.main">
          MyCase case: <Link href={MYCASE + s.caseId} target="_blank" rel="noopener noreferrer" underline="hover">{s.caseName || `Case ${s.caseId}`}</Link>
        </Typography>
        <Typography variant="caption" color="text.secondary" fontWeight={700}>
          {[k.practiceArea, k.openedDate ? `opened ${day(k.openedDate)}` : null, k.invoiceTotal != null ? `${money(k.invoiceTotal)} billed · ${money(k.invoicePaid)} paid` : null, k.phone ? displayPhone(k.phone) : null].filter(Boolean).join(" · ")}
        </Typography>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: `repeat(${Math.min(3, s.clients.length)}, 1fr)` } }}>
        {s.clients.map((c, i) => {
          const key = `${s.id}_${c.clientId}`;
          const fits = !!(near(c.invoiceTotal, k.invoiceTotal) || near(c.paid, k.invoicePaid));
          return (
            <Box key={c.clientId} sx={{ borderLeft: { md: i ? 1 : 0 }, borderTop: { xs: i ? 1 : 0, md: 0 }, borderColor: "divider" }}>
              <Side title={`Record ${i + 1} in Collections`} color={i ? theme.palette.secondary.main : theme.palette.primary.main} rows={rowsFor(c)} />
              <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 2, pb: 2 }}>
                <Button size="small" variant="contained" disabled={!!busy[key]} onClick={() => onKeep(s, c, key)}>Keep this one</Button>
                {fits && <Chip size="small" color="success" variant="outlined" label="Amounts match the case" />}
                {notes[key] && <Typography variant="caption" color="warning.main" fontWeight={800}>{notes[key]}</Typography>}
              </Stack>
            </Box>
          );
        })}
      </Box>
      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: "block", px: 2, py: 1.25, borderTop: 1, borderColor: "divider", bgcolor: alpha(theme.palette.primary.main, 0.025) }}>
        The other record stays in Collections as it is, but stops getting this case&apos;s MyCase payments.
      </Typography>
    </Card>
  );
}

export default function LinkProblems({ search = "" }) {
  const [issues, setIssues] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState({});
  const [notes, setNotes] = useState({});
  const [sub, setSub] = useState("unlinked");
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  useEffect(() => setPage(0), [search, sub]);

  useEffect(() => onSnapshot(
    collection(db, "mycaseLinkIssues"),
    (snap) => setIssues(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => { console.error(e); setError("Could not load link problems."); setIssues([]); }
  ), []);

  const call = async (key, fn, payload, done) => {
    setBusy((b) => ({ ...b, [key]: true }));
    setNotes((n) => ({ ...n, [key]: "" }));
    try {
      await httpsCallable(getFunctions(app), fn)(payload);
      setNotes((n) => ({ ...n, [key]: done }));
    } catch (e) {
      console.error(e);
      setNotes((n) => ({ ...n, [key]: e.message || "Could not save." }));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  const q = search.trim().toLowerCase();
  const { unlinked, shared } = useMemo(() => {
    const list = issues || [];
    const match = (txt) => !q || txt.toLowerCase().includes(q);
    const level = (u) => (u.candidates?.length ? { strong: 0, possible: 1, weak: 2 }[compare(u, u.candidates[0]).level] : 3);
    return {
      unlinked: list.filter((i) => i.type === "unlinked" && match(`${i.clientName} ${i.caseTitle}`))
        .sort((a, b) => level(a) - level(b) || a.clientName.localeCompare(b.clientName)),
      shared: list.filter((i) => i.type === "shared" && match(`${i.caseName} ${(i.clients || []).map((c) => c.clientName).join(" ")}`)),
    };
  }, [issues, q]);

  if (issues === null) return <CircularProgress />;
  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack direction="row" spacing={0.75} sx={{ mb: 1.5 }} useFlexGap flexWrap="wrap">
        {[["unlinked", `Not linked to a case · ${unlinked.length}`], ["shared", `Two records on one case · ${shared.length}`]].map(([k, l]) => (
          <Chip key={k} label={l} onClick={() => setSub(k)} color={sub === k ? "primary" : "default"} variant={sub === k ? "filled" : "outlined"} sx={{ fontWeight: 800 }} />
        ))}
      </Stack>
      {sub === "unlinked" ? (
        unlinked.length === 0 ? (
          <Alert severity="success">Every open record is linked to a MyCase case.</Alert>
        ) : (
          unlinked.slice(page * perPage, page * perPage + perPage).map((u) => (
            <UnlinkedCard key={u.id} u={u} busy={Object.keys(busy).some((k) => k.startsWith(u.id) && busy[k])}
              note={Object.entries(notes).find(([k]) => k.startsWith(u.id))?.[1]}
              onLink={(rec, k) => call(`${rec.id}_${k.caseId}`, "linkMyCaseClient", { clientId: rec.clientId, caseId: k.caseId }, "Linked. It moves to Existing clients to tag.")} />
          )).concat(unlinked.length > 25 ? [
            <Card key="pager">
              <TablePagination component="div" count={unlinked.length} page={Math.min(page, Math.max(0, Math.ceil(unlinked.length / perPage) - 1))}
                onPageChange={(_, p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                rowsPerPage={perPage} rowsPerPageOptions={[25, 50, 100]} labelRowsPerPage="Records per page"
                onRowsPerPageChange={(e) => { setPerPage(parseInt(e.target.value, 10)); setPage(0); }} />
            </Card>,
          ] : [])
        )
      ) : shared.length === 0 ? (
        <Alert severity="success">No MyCase case has more than one record.</Alert>
      ) : (
        shared.map((s) => (
          <SharedCard key={s.id} s={s} busy={busy} notes={notes}
            onKeep={(sh, c, key) => call(key, "keepMyCaseRecord", { caseId: sh.caseId, clientId: c.clientId }, "Kept for MyCase.")} />
        ))
      )}
    </Box>
  );
}
