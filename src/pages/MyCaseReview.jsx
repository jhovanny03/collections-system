// src/pages/MyCaseReview.jsx
// Payments from MyCase that the importer would not guess about: no matching client,
// several matching clients, refunds/reversals, or a possible duplicate of a manual entry.
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Card, Chip, CircularProgress, LinearProgress, Snackbar, TablePagination,
  InputAdornment, Link, Paper, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Tabs, TextField, Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import SearchRounded from "@mui/icons-material/SearchRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import { Link as RouterLink } from "react-router-dom";
import { PageHeader } from "../ui/kit";
import { FONT_HEADING } from "../theme/brand";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import db, { app } from "../firebase";

const MYCASE_CASE = "https://law-firm-of-moumita-rahman-pllc.mycase.com/court_cases/";

const REASONS = {
  no_matching_client: {
    label: "No matching client",
    help: "No client's MyCase link points at this case. Add or fix the link on the client, then Retry.",
  },
  multiple_matching_clients: {
    label: "Several clients on this case",
    help: "More than one client shares this MyCase case. Record the payment by hand on the right one, then Dismiss.",
  },
  refund_or_reversal: {
    label: "Refund / reversal",
    help: "Refunds and bounced payments are cancelled against the payment they reverse automatically; this one had no matching payment (same invoice and amount). Retry once the original payment is in, or adjust by hand and Dismiss.",
  },
  possible_duplicate: {
    label: "Possible duplicate",
    help: "A manual payment with the same date and amount already exists, so this was not added. Dismiss if it is the same payment.",
  },
  new_invoice: {
    label: "New invoice on an existing client",
    help: "Billing added this invoice in MyCase. Say which service it is for and what it is. An additional service (removal defense, derivative...) has two invoices: its initial payment, and a monthly-plan invoice that becomes a plan of its own.",
  },
  untagged_invoice: {
    label: "New invoice, not tagged",
    help: "Billing added an invoice to this case after it was set up. Say what it is; the payment is then counted (or not) accordingly.",
  },
  invalid_date: {
    label: "Missing / invalid date",
    help: "MyCase sent no usable payment date. Record it by hand, then Dismiss.",
  },
};

// What happened to a resolved item, in plain words.
const OUTCOME = {
  imported_on_retry: "Added to the client",
  already_in_ledger: "Already on the client",
  reversal_applied: "Refund applied against the payment it reverses",
  invoice_tagged: "Invoice tagged",
  dismissed: "Dismissed (handled by hand)",
};
const outcomeOf = (it) => (it.status === "dismissed" ? OUTCOME.dismissed : OUTCOME[it.resolution] || (String(it.resolution || "").startsWith("not_counted") ? "Not counted (invoice tagged Other)" : it.resolution || "Resolved"));
const KIND = { initial: "as an initial payment", installment: "as an installment" };

/** Items handled in the last 90 days: where each payment went, as what, and by whom. */
function ResolvedList() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const snap = await getDocs(query(collection(db, "mycasePaymentReview"), where("status", "in", ["resolved", "dismissed"])));
      const since = new Date(Date.now() - 90 * 864e5).toISOString();
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => String(r.resolvedAt || "") >= since);
      rows.sort((a, b) => String(b.resolvedAt || "").localeCompare(String(a.resolvedAt || "")));
      // Older items did not record the client: read it from the payment record.
      await Promise.all(rows.slice(0, 200).map(async (r) => {
        if (r.clientId && r.countedAs) return;
        const pid = r.paymentId || (r.raw && r.raw.id);
        if (!pid) return;
        const rec = await getDoc(doc(db, "payments", `mycase_${pid}`)).catch(() => null);
        if (rec && rec.exists()) {
          r.clientId = r.clientId || rec.data().clientId;
          r.clientName = rec.data().clientName;
          r.countedAs = r.countedAs || (rec.data().kind === "initial" ? "initial" : "installment");
        }
      }));
      if (alive) setItems(rows.slice(0, 200));
    })().catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, []);
  if (items === null) return <CircularProgress />;
  if (!items.length) return <Alert severity="info">Nothing resolved in the last 90 days.</Alert>;
  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Paid on</TableCell>
            <TableCell align="right">Amount</TableCell>
            <TableCell>MyCase client / case</TableCell>
            <TableCell>Was held because</TableCell>
            <TableCell>What happened</TableCell>
            <TableCell>By / when</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((it) => (
            <TableRow key={it.id} hover>
              <TableCell>{it.paymentDate || "—"}</TableCell>
              <TableCell align="right">{money(it.amount)}</TableCell>
              <TableCell>
                <Typography variant="body2">{it.mycaseClientName || it.clientName || "—"}</Typography>
                {it.caseId && <Typography variant="caption" color="text.secondary">Case {it.caseId}</Typography>}
              </TableCell>
              <TableCell><Chip size="small" label={(REASONS[it.reason] || { label: it.reason }).label} /></TableCell>
              <TableCell>
                <Typography variant="body2" fontWeight={700}>
                  {outcomeOf(it)}{it.countedAs && it.resolution === "imported_on_retry" ? ` ${KIND[it.countedAs] || ""}` : ""}
                </Typography>
                {it.taggedAs && <Typography variant="caption" color="text.secondary" display="block">Invoice tagged: {it.taggedAs === "other" ? "Other (not counted)" : it.taggedAs === "installment" ? "monthly plan" : "initial payment"}{it.service ? ` · ${it.service}` : ""}</Typography>}
                {it.clientId && <Link component={RouterLink} to={`/client/${it.clientId}?tab=payments`} variant="caption">Open the client's payments</Link>}
              </TableCell>
              <TableCell>
                <Typography variant="body2">{it.taggedBy || it.resolvedBy || "—"}</Typography>
                <Typography variant="caption" color="text.secondary">{it.resolvedAt ? new Date(it.resolvedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// Which service an invoice pays for. Required once the client already has an initial
// payment or a plan, so an additional service is never filed as the main case's.
const SERVICES = ["Main case", "Removal defense", "Derivative", "Other additional service"];

const money = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

// Reasons grouped for the cards on top (the rarer ones share a card).
const GROUPS = [
  { key: "new_invoice", label: "New invoices", reasons: ["new_invoice"], color: "primary" },
  { key: "untagged_invoice", label: "Payments on untagged invoices", reasons: ["untagged_invoice"], color: "warning" },
  { key: "refund_or_reversal", label: "Refunds & reversals", reasons: ["refund_or_reversal"], color: "error" },
  { key: "other", label: "Other holds", reasons: ["no_matching_client", "multiple_matching_clients", "possible_duplicate", "invalid_date"], color: "info" },
];
const groupOf = (reason) => GROUPS.find((g) => g.reasons.includes(reason)) || GROUPS[3];
const TAGGING = new Set(["new_invoice", "untagged_invoice"]);
const RETRY = new Set(["no_matching_client", "multiple_matching_clients", "refund_or_reversal"]);
const ROLE_WORDS = { initial: "an initial payment", installment: "a monthly plan of its own", other: "not counted (other)" };
const day = (v) => {
  const s = String(v || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
};
const signed = (n) => (Number(n) < 0 ? `−${money(-Number(n))}` : money(n));

// Suggestions only (same idea as the sync's defaultInvoiceRole): from the invoice text.
function suggest(inv) {
  const d = String((inv && inv.description) || "");
  const role = /^\s*IP\b/i.test(d) || /initial\s+payment/i.test(d) || /\bIP\b/.test(d) ? "initial"
    : /install|monthly|payment\s*plan/i.test(d) ? "installment"
    : inv && (Math.round(Number(inv.total) * 100) === 15000 || /consult/i.test(d)) ? "other" : "";
  const service = /removal/i.test(d) ? "Removal defense" : /derivative/i.test(d) ? "Derivative" : role && role !== "other" ? "Main case" : "";
  return { role, service };
}

function Choice({ on, label, sub, suggested, onClick, disabled }) {
  const theme = useTheme();
  return (
    <Box component="button" type="button" onClick={onClick} disabled={disabled}
      sx={{
        border: 1.5, borderColor: on ? "primary.main" : suggested ? alpha(theme.palette.success.main, 0.6) : "divider", borderRadius: 2.5, px: 1.75, py: 1,
        bgcolor: on ? "primary.main" : "background.paper", color: on ? "primary.contrastText" : "text.primary", font: "inherit", fontWeight: 800, fontSize: 13,
        textAlign: "left", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, transition: ".12s", "&:hover": disabled ? undefined : { borderColor: "primary.main" },
      }}>
      {label}
      {suggested && !on && <Box component="span" sx={{ ml: 0.75, fontSize: 11, color: "success.main" }}>suggested</Box>}
      {sub && <Box component="span" sx={{ display: "block", fontSize: 11, fontWeight: 700, opacity: 0.7 }}>{sub}</Box>}
    </Box>
  );
}

function StepTitle({ n, children }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5, mb: 1 }}>
      <Box sx={{ width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, bgcolor: "primary.main", color: "primary.contrastText" }}>{n}</Box>
      <Typography variant="body2" fontWeight={800} color="text.secondary">{children}</Typography>
    </Stack>
  );
}

/** The selected held payment: what it is, why it is held, and the decision step by step. */
function ReviewPanel({ it, busy, note, onAct }) {
  const theme = useTheme();
  const [kase, setKase] = useState(null);
  const [client, setClient] = useState(null);
  const [inv, setInv] = useState(null);
  const [role, setRole] = useState("");
  const [svc, setSvc] = useState("");
  const [plan, setPlan] = useState({ monthlyAmount: "", startDate: "" });
  const [err, setErr] = useState("");
  const id = it?.id;

  useEffect(() => {
    setKase(null); setClient(null); setInv(null); setRole(""); setSvc(""); setErr("");
    if (!it) return undefined;
    let alive = true;
    (async () => {
      const [k, i] = await Promise.all([
        it.caseId ? getDoc(doc(db, "mycaseCases", String(it.caseId))).catch(() => null) : null,
        it.invoiceId ? getDoc(doc(db, "mycaseInvoices", String(it.invoiceId))).catch(() => null) : null,
      ]);
      const kd = k && k.exists() ? k.data() : null;
      const id_ = i && i.exists() ? i.data() : null;
      let cd = null;
      const cid = it.clientId || (kd && kd.trackedClientId && kd.trackedClientId !== "multiple" ? kd.trackedClientId : null);
      if (cid) {
        const c = await getDoc(doc(db, "clients", cid)).catch(() => null);
        cd = c && c.exists() ? { id: c.id, ...c.data() } : null;
      }
      if (!alive) return;
      setKase(kd); setInv(id_); setClient(cd);
      const s = suggest(id_ || { description: it.description, total: it.amount });
      setRole(""); setSvc(s.service || "");
      setPlan({ monthlyAmount: "", startDate: (id_ && id_.dueDate) || "" });
    })();
    return () => { alive = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- reload only when another item is picked

  if (!it) {
    return <Card sx={{ p: 6, textAlign: "center" }}><Typography color="text.secondary">Pick a payment on the left.</Typography></Card>;
  }
  const r = REASONS[it.reason] || { label: it.reason, help: "" };
  const g = groupOf(it.reason);
  const gc = theme.palette[g.color].main;
  const tagging = TAGGING.has(it.reason);
  const sug = suggest(inv || { description: it.description, total: it.amount });
  const invTotal = inv ? inv.total : it.reason === "new_invoice" ? it.amount : null;
  const invPaid = inv ? inv.paid : it.paid;
  const plans = (client && client.plans) || [];
  const ready = tagging && role && (role === "other" || svc) && (role !== "installment" || (Number(plan.monthlyAmount) > 0 && plan.startDate));
  const months = role === "installment" && Number(plan.monthlyAmount) > 0 && invTotal ? Math.ceil(invTotal / Number(plan.monthlyAmount)) : null;
  const who = (client && `${client.firstName || ""} ${client.lastName || ""}`.trim()) || it.mycaseClientName || "The client";
  const sentence = !tagging
    ? RETRY.has(it.reason)
      ? it.reason === "refund_or_reversal"
        ? `Retry looks again for the ${money(Math.abs(it.amount))} payment this ${String(it.transactionType || "reversal").toLowerCase()} cancels (same invoice and amount). If it still isn't there, adjust it by hand on the client and dismiss.`
        : "Fix the client's MyCase link (or the duplicate record in Case Setup), then Retry to add the payment."
      : "Handle it by hand on the client, then Dismiss."
    : !role ? "Pick what the invoice is." : role !== "other" && !svc ? "Pick which service it's for."
    : `${who}'s invoice ${it.invoiceNumber || (inv && inv.number) || it.invoiceId} becomes ${ROLE_WORDS[role]}${role !== "other" ? ` for ${svc}` : ""}${months ? `: ${money(plan.monthlyAmount)} a month for about ${months} months from ${day(plan.startDate)}` : ""}.${invPaid ? ` ${money(invPaid)} already paid on it ${role === "other" ? "won't count" : "is added to the client"}.` : ""}`;

  const save = async () => {
    setErr("");
    if (role === "installment" && !(Number(plan.monthlyAmount) > 0)) return setErr("Enter the monthly amount.");
    if (role === "installment" && !plan.startDate) return setErr("Enter the first installment date.");
    await onAct(it.id, "tag", role, role === "installment" ? { monthlyAmount: Number(plan.monthlyAmount), startDate: plan.startDate } : null, role === "other" ? null : svc);
  };

  const Stat = ({ label, value, color }) => (
    <Box sx={{ px: 2.5, py: 1.5, minWidth: 0 }}>
      <Typography variant="caption" fontWeight={800} color="text.secondary">{label}</Typography>
      <Typography sx={{ font: `700 19px ${FONT_HEADING}`, color }} noWrap>{value}</Typography>
    </Box>
  );

  return (
    <Card key={it.id} sx={{ overflow: "hidden", animation: "rvIn .25s ease-out", "@keyframes rvIn": { from: { opacity: 0, transform: "translateY(6px)" } } }}>
      <Stack direction={{ xs: "column", xl: "row" }} spacing={2} sx={{ p: 2.5, pb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h5">{who}</Typography>
          <Typography variant="body2" color="text.secondary" noWrap title={kase?.name}>{kase?.name || (it.caseId ? `Case ${it.caseId}` : "No MyCase case")}</Typography>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
            <Chip size="small" label={r.label} sx={{ fontWeight: 800, color: gc, bgcolor: alpha(gc, 0.12) }} />
            {plans.map((p, i) => <Chip key={i} size="small" variant="outlined" label={`${p.service || "Main case"} · ${money(p.monthlyAmount)}/mo`} />)}
            {client && !plans.length && <Chip size="small" variant="outlined" label="No plan yet" />}
          </Stack>
        </Box>
        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ flex: "none" }}>
          {it.caseId && <Button variant="outlined" endIcon={<OpenInNewRounded />} href={`${MYCASE_CASE}${it.caseId}/invoices`} target="_blank" rel="noopener noreferrer">Invoices in MyCase</Button>}
          {client && <Button variant="outlined" component={RouterLink} to={`/client/${client.id}?tab=payments`}>Profile</Button>}
        </Stack>
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, borderBottom: 1, borderColor: "divider", "& > div + div": { borderLeft: { md: 1 }, borderColor: { md: "divider" } } }}>
        <Stat label={it.reason === "new_invoice" ? "Invoice amount" : it.amount < 0 ? String(it.transactionType || "Reversal") : "Payment"} value={signed(it.amount)} color={it.amount < 0 ? "error.main" : "success.main"} />
        <Stat label="Date" value={day(it.paymentDate || (inv && inv.invoiceDate))} />
        <Stat label={`Invoice ${it.invoiceNumber || (inv && inv.number) || ""}`} value={invTotal != null ? money(invTotal) : "—"} />
        <Stat label="Paid on the invoice" value={invPaid != null ? money(invPaid) : "—"} />
      </Box>

      <Box sx={{ mx: 2.5, mt: 2, p: 1.5, px: 1.75, borderRadius: 3, bgcolor: alpha(gc, 0.08) }}>
        <Typography variant="body2" fontWeight={800} sx={{ color: gc }}>Why it's held</Typography>
        <Typography variant="body2" color="text.secondary">
          {r.help} {inv ? (inv.description ? `MyCase description: “${inv.description}”.` : "No description in MyCase.") : it.description ? `MyCase description: “${it.description}”.` : ""}
        </Typography>
      </Box>

      <Box sx={{ px: 2.5, pb: 1 }}>
        {tagging ? (
          <>
            <StepTitle n={1}>What is this invoice?</StepTitle>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {[["initial", "Initial payment", "intake's down payment"], ["installment", "Monthly plan", "a plan of its own"], ["other", "Other", "not counted"]].map(([k, l, d]) => (
                <Choice key={k} on={role === k} label={l} sub={d} suggested={sug.role === k} onClick={() => setRole(k)} />
              ))}
            </Stack>
            {role && role !== "other" && (
              <>
                <StepTitle n={2}>Which service is it for?</StepTitle>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {SERVICES.map((s) => <Choice key={s} on={svc === s} label={s} suggested={sug.service === s} onClick={() => setSvc(s)} />)}
                </Stack>
              </>
            )}
            {role === "installment" && (
              <>
                <StepTitle n={3}>The plan</StepTitle>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
                  <TextField size="small" label="Monthly amount" type="number" value={plan.monthlyAmount} onChange={(e) => setPlan((p) => ({ ...p, monthlyAmount: e.target.value }))}
                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} sx={{ bgcolor: "background.paper" }} />
                  <TextField size="small" label="First installment" type="date" value={plan.startDate} onChange={(e) => setPlan((p) => ({ ...p, startDate: e.target.value }))}
                    InputLabelProps={{ shrink: true }} helperText={inv?.dueDate ? "From the invoice's due date" : undefined} sx={{ bgcolor: "background.paper" }} />
                  <Box sx={{ alignSelf: "center" }}>
                    <Typography variant="caption" fontWeight={800} color="text.secondary">Plan total</Typography>
                    <Typography fontWeight={800}>{invTotal != null ? money(invTotal) : "—"}{months ? ` · ${months} months` : ""}</Typography>
                  </Box>
                </Stack>
              </>
            )}
          </>
        ) : (
          <StepTitle n={1}>{RETRY.has(it.reason) ? "Retry once it's fixed, or handle it by hand and dismiss" : "Handle it by hand, then dismiss"}</StepTitle>
        )}
      </Box>

      <Box sx={{ mx: 2.5, mt: 1, p: 1.5, borderRadius: 3, border: "1.5px dashed", borderColor: ready ? alpha(theme.palette.success.main, 0.5) : "divider", bgcolor: ready ? alpha(theme.palette.success.main, 0.08) : "transparent" }}>
        <Typography variant="body2" fontWeight={700} color={ready ? "success.dark" : "text.secondary"}>{sentence}</Typography>
      </Box>
      {(err || note) && <Alert severity={err ? "error" : "warning"} sx={{ mx: 2.5, mt: 1.5 }}>{err || note}</Alert>}

      <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ px: 2.5, py: 1.75, mt: 2, borderTop: 1, borderColor: "divider", bgcolor: alpha(theme.palette.primary.main, 0.025) }}>
        <Button color="inherit" variant="outlined" disabled={busy} onClick={() => onAct(it.id, "dismiss")}>Dismiss (handled by hand)</Button>
        {tagging ? (
          <Button variant="contained" disabled={busy || !ready} onClick={save}>{busy ? "Saving…" : role === "installment" ? "Save plan and count payments" : "Save and add the payment"}</Button>
        ) : RETRY.has(it.reason) ? (
          <Button variant="contained" disabled={busy} onClick={() => onAct(it.id, "retry")}>{busy ? "Checking…" : "Retry"}</Button>
        ) : null}
      </Stack>
    </Card>
  );
}

export default function MyCaseReview() {
  const theme = useTheme();
  const [tab, setTab] = useState("open");
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState({});
  const [notes, setNotes] = useState({});
  const [filter, setFilter] = useState(null); // a GROUPS key
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "mycasePaymentReview"), where("status", "==", "open"));
    return onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // A new invoice that already has a payment waiting shows once (as the payment):
        // tagging either settles both.
        const paidInvoices = new Set(all.filter((r) => r.reason === "untagged_invoice").map((r) => String(r.invoiceId)));
        const rows = all.filter((r) => !(r.reason === "new_invoice" && paidInvoices.has(String(r.invoiceId))));
        rows.sort((a, b) => String(b.paymentDate || "").localeCompare(String(a.paymentDate || "")));
        setItems(rows);
      },
      (e) => {
        console.error(e);
        setError("Could not load review items. You may not have access.");
        setItems([]);
      }
    );
  }, []);

  const act = async (id, action, role, plan, svc) => {
    setBusy((b) => ({ ...b, [id]: true }));
    setNotes((n) => ({ ...n, [id]: "" }));
    try {
      const fn = httpsCallable(getFunctions(app), "resolveMyCaseReview");
      const { data } = await fn({ reviewId: id, action, ...(role ? { role } : {}), ...(plan ? { plan } : {}), ...(svc ? { service: svc } : {}) });
      if (data.status === "open") {
        const why = REASONS[data.detail]?.label || data.detail;
        setNotes((n) => ({ ...n, [id]: `Still unresolved: ${why}` }));
      } else {
        setToast(action === "dismiss" ? "Dismissed." : "Done: the payment is on the client.");
      }
      return true;
    } catch (e) {
      console.error(e);
      setNotes((n) => ({ ...n, [id]: e.message || "Action failed." }));
      return false;
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  const stats = useMemo(() => {
    const out = Object.fromEntries(GROUPS.map((g) => [g.key, { n: 0, held: 0 }]));
    for (const it of items || []) {
      const g = groupOf(it.reason);
      out[g.key].n++;
      out[g.key].held += Math.abs(Number(it.amount || 0));
    }
    return out;
  }, [items]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items || []).filter((it) => (!filter || groupOf(it.reason).key === filter)
      && (!q || [it.mycaseClientName, it.invoiceNumber, it.caseId, it.description].some((v) => String(v || "").toLowerCase().includes(q))));
  }, [items, filter, search]);
  const pageList = useMemo(() => list.slice(page * perPage, page * perPage + perPage), [list, page, perPage]);
  const selected = list.find((it) => it.id === selectedId) || null;
  useEffect(() => {
    if (pageList.length && !pageList.some((it) => it.id === selectedId)) setSelectedId(pageList[0].id);
  }, [pageList, selectedId]);
  useEffect(() => setPage(0), [filter, search]);
  const index = selected ? pageList.indexOf(selected) : -1;
  // ↑/↓ move through the list. Ignored while typing.
  useEffect(() => {
    if (tab !== "open") return undefined;
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.closest?.("[role=dialog],[role=listbox],[role=menu]"))) return;
      if (!pageList.length || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedId(pageList[Math.min(pageList.length - 1, index + 1)].id); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedId(pageList[Math.max(0, index - 1)].id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Box>
      <PageHeader
        title="MyCase Review"
        subtitle="Payments and new invoices from MyCase that were held back instead of guessed. Nothing here is counted until someone decides."
        actions={
          <TextField size="small" placeholder="Search client, invoice or case" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 260 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }} />
        }
      />

      {/* What is held, by reason */}
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4, 1fr)" }, mb: 2 }}>
        {GROUPS.map((g) => {
          const c = theme.palette[g.color].main;
          const on = filter === g.key;
          return (
            <Card key={g.key} component="button" type="button" onClick={() => { setFilter(on ? null : g.key); setTab("open"); }}
              sx={{ p: 2, textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", border: 1, borderColor: "divider", borderTop: 4, borderTopColor: c, display: "block",
                boxShadow: on ? `0 0 0 2px ${theme.palette.primary.main}` : undefined, transition: "transform .15s", "&:hover": { transform: "translateY(-2px)" } }}>
              <Typography variant="caption" fontWeight={800} color="text.secondary">{g.label}</Typography>
              <Typography sx={{ font: `700 26px ${FONT_HEADING}` }}>{items ? stats[g.key].n : "—"}</Typography>
              <Typography variant="caption" fontWeight={700} color="text.secondary">{stats[g.key].held ? `${money(stats[g.key].held)} held` : "nothing held"}</Typography>
            </Card>
          );
        })}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: tab === "open" ? "400px minmax(0, 1fr)" : "1fr" }, alignItems: "start" }}>
        <Card sx={{ position: { lg: tab === "open" ? "sticky" : "static" }, top: { lg: 100 }, display: "flex", flexDirection: "column", maxHeight: { lg: tab === "open" ? "calc(100vh - 120px)" : "none" }, overflow: "hidden" }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: "divider", minHeight: 46, px: 0.5 }}>
            <Tab value="open" sx={{ textTransform: "none", fontWeight: 800, minHeight: 46 }}
              label={<Stack direction="row" spacing={0.75} alignItems="center"><span>To review</span><Chip size="small" label={items ? items.length : "…"} color={tab === "open" ? "primary" : "default"} sx={{ height: 19, fontSize: 11, fontWeight: 800 }} /></Stack>} />
            <Tab value="resolved" sx={{ textTransform: "none", fontWeight: 800, minHeight: 46 }} label="Resolved · last 90 days" />
          </Tabs>
          {tab === "resolved" ? (
            <Box sx={{ p: 1.5 }}><ResolvedList /></Box>
          ) : (
            <>
              {filter && (
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 1.75, py: 0.75, borderBottom: 1, borderColor: "divider", bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
                  <Typography variant="caption" fontWeight={800} color="primary.main">{GROUPS.find((g) => g.key === filter).label}</Typography>
                  <Button size="small" onClick={() => setFilter(null)}>Show all</Button>
                </Stack>
              )}
              {items === null && <LinearProgress />}
              {items && list.length === 0 && (
                <Typography color="text.secondary" sx={{ p: 4, textAlign: "center" }}>{search || filter ? "Nothing matches." : "Nothing to review. Every MyCase payment is accounted for."}</Typography>
              )}
              <Box sx={{ overflowY: "auto", flex: 1 }}>
                {pageList.map((it) => {
                  const on = it.id === selectedId;
                  const g = groupOf(it.reason);
                  const c = theme.palette[g.color].main;
                  return (
                    <Box key={it.id} onClick={() => setSelectedId(it.id)}
                      sx={{
                        display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "2px 10px", px: 1.75, py: 1.25, cursor: "pointer", position: "relative", borderBottom: 1, borderColor: "divider",
                        bgcolor: on ? alpha(theme.palette.primary.main, 0.08) : "transparent", "&:hover": { bgcolor: on ? alpha(theme.palette.primary.main, 0.1) : alpha(theme.palette.primary.main, 0.03) },
                        "&::before": on ? { content: '""', position: "absolute", left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, bgcolor: "primary.main" } : undefined,
                      }}>
                      <Typography variant="body2" fontWeight={800} noWrap>{it.mycaseClientName || `Case ${it.caseId || "?"}`}</Typography>
                      <Typography sx={{ font: `700 15px ${FONT_HEADING}`, textAlign: "right", color: it.amount < 0 ? "error.main" : "text.primary" }}>{signed(it.amount)}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap component="div">
                        <Box component="span" sx={{ color: c, fontWeight: 800 }}>● {g.label}</Box> · {day(it.paymentDate)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ textAlign: "right" }}>{it.invoiceNumber || (it.invoiceId ? `#${it.invoiceId}` : "")}</Typography>
                      {notes[it.id] && <Typography variant="caption" color="warning.main" fontWeight={800} sx={{ gridColumn: "1 / 3" }}>{notes[it.id]}</Typography>}
                    </Box>
                  );
                })}
              </Box>
              {list.length > 0 && (
                <TablePagination component="div" count={list.length} page={Math.min(page, Math.max(0, Math.ceil(list.length / perPage) - 1))} onPageChange={(_, p) => setPage(p)}
                  rowsPerPage={perPage} rowsPerPageOptions={[25, 50, 100]} labelRowsPerPage="Per page" onRowsPerPageChange={(e) => { setPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                  sx={{ borderTop: 1, borderColor: "divider", "& .MuiTablePagination-toolbar": { px: 1 } }} />
              )}
            </>
          )}
        </Card>

        {tab === "open" && <ReviewPanel it={selected} busy={!!(selected && busy[selected.id])} note={selected ? notes[selected.id] : ""} onAct={act} />}
      </Box>

      <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast(null)}>
        {toast ? <Alert severity="success" variant="filled">{toast}</Alert> : <span />}
      </Snackbar>
    </Box>
  );
}
