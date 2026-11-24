// src/pages/CaseSetup.jsx
// MyCase cases that are open, owe money, and have no Collections record yet.
// Billing tags each invoice (initial / installment / other), enters the monthly
// amount for each installment invoice, and saves: the server creates the client
// record and imports the case's payment history from MyCase.
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, InputAdornment, Link, MenuItem, Paper, Select, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography, Tab, Tabs,
} from "@mui/material";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import db, { app } from "../firebase";
import AdjustmentRows from "../billing/AdjustmentRows";
import LinkProblems from "./LinkProblems";

const MYCASE = "https://law-firm-of-moumita-rahman-pllc.mycase.com/court_cases/";
const PAGE = 50;

const money = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Same rules as defaultInvoiceRole in functions/mycaseSync.js: a suggestion only.
function suggestRole(inv) {
  const d = String(inv.description || "");
  if (/^\s*IP\b/i.test(d) || /initial\s+payment/i.test(d)) return "initial";
  if (Math.round(Number(inv.total) * 100) === 15000 || /consult/i.test(d)) return "other";
  if (/install|monthly|payment\s*plan/i.test(d)) return "installment";
  return "";
}

// Same mapping as mapCaseType in functions/mycaseSync.js (keep in step): MyCase practice
// area -> the case type the team chose for it 90%+ of the time. Others: billing picks.
const PRACTICE_AREA_TYPES = {
  VAWASPOUSE: "VAWA SPOUSE", VAWA: "VAWA SPOUSE", WIDOWERI360: "VAWA SPOUSE",
  VAWAPARENT: "PARENT VAWA", PARENTVAWA: "PARENT VAWA", VAWACHILD: "CHILD VAWA", CHILDVAWA: "CHILD VAWA",
  TVISA: "T VISA", TVISALABOR: "T VISA", TVISADV: "T VISA", TVISASMUGGLING: "T VISA",
  UVISA: "U VISA", MARRIAGEAOS: "MARRIAGE AOS", N400: "N400",
  I751REGULAR: "I751 REGULAR", I751DIVORCEWAIVER: "I751 REGULAR", I751ECB: "I751 ECB",
  I90: "I90", ASYLUM: "ASYLUM", REMOVALDEFENSE: "REMOVAL DEFENSE",
};
// The case type comes from MyCase only (functions/mycaseSync.js caseTypeFromMyCase).
const caseTypeFromMyCase = (practiceArea) => {
  const raw = String(practiceArea || "").trim();
  if (!raw || /^[-\s]+$/.test(raw)) return "";
  return PRACTICE_AREA_TYPES[raw.toUpperCase().replace(/[^A-Z0-9]/g, "")] || raw.toUpperCase();
};

function CaseTypeLine({ kase }) {
  const t = caseTypeFromMyCase(kase.practiceArea);
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
      <Typography variant="subtitle2">Case type:</Typography>
      {t ? <Chip size="small" label={t} /> : (
        <Typography variant="body2" color="warning.main">
          No practice area in MyCase yet. Set it in MyCase; the next sync fills it in.
        </Typography>
      )}
      {t && <Typography variant="caption" color="text.secondary">from MyCase</Typography>}
    </Stack>
  );
}

// Filters on the "New MyCase cases" tab. setupGroup and lastPaymentDate are worked out by
// the MyCase sync (functions/mycaseSync.js caseFlags).
const YEAR_MS = 365 * 24 * 3600 * 1000;
function caseGroup(c, now = Date.now()) {
  if (c.setupGroup === "potential") return "potential";
  if (c.setupGroup === "closed") return "closed";
  const last = c.lastPaymentDate || c.openedDate;
  if (last && now - new Date(`${last}T00:00:00`).getTime() > YEAR_MS) return "stale";
  return "client";
}
const GROUPS = [
  ["client", "Clients", "Paid or opened in the last 12 months."],
  ["stale", "No payment in 12+ months", "Nothing paid (or opened) in over a year: may be terminated but not closed in MyCase."],
  ["closed", "Marked closed", "Open in MyCase, but the case stage or name says closed."],
  ["potential", "Potential clients", "Named \"Potential Case\", \"Potential Client\" or \"Case Evaluation\" in MyCase: not signed yet."],
  ["all", "All", ""],
];

const ROLE_LABEL = { initial: "Initial payment", installment: "Installment (monthly plan)", other: "Other (not counted)" };

// mode "setup": a new MyCase case (creates the client).
// mode "plan": a client created automatically from intake's initial-payment invoice; billing
// adds the monthly plan once the installment invoice is in MyCase.
// mode "retag": an existing client whose invoices could not be tagged automatically; its
// payment history is rebuilt from MyCase. The client's existing plan settings stay with
// the first installment invoice, so amounts are only asked for any extra one.
function SetupDialog({ kase, mode = "setup", onClose, onDone }) {
  const [invoices, setInvoices] = useState(null);
  const [roles, setRoles] = useState({});
  const [plans, setPlans] = useState({});
  const [client, setClient] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const retag = mode === "retag";
  const planMode = mode === "plan";

  useEffect(() => {
    let live = true;
    const loadClient = (retag || planMode) && kase.trackedClientId
      ? getDoc(doc(db, "clients", kase.trackedClientId)).then((s) => (s.exists() ? s.data() : null))
      : Promise.resolve(null);
    Promise.all([getDocs(query(collection(db, "mycaseInvoices"), where("caseId", "==", kase.id))), loadClient])
      .then(([snap, existing]) => {
        if (!live) return;
        const list = snap.docs.map((d) => d.data()).filter((i) => i.status !== "draft")
          .sort((a, b) => String(a.invoiceDate || "").localeCompare(String(b.invoiceDate || "")));
        setInvoices(list);
        setClient(existing);
        const known = (existing && (existing.invoiceRoles || existing.rebuild?.suggestedRoles)) || {};
        const r = {}, p = {};
        // Billing's monthly invoice usually covers exactly what the flat fee has left after
        // the intake invoice: pre-select it as the installment invoice.
        const leftOf = (inv) => Math.round(Number(kase.flatFee || 0) * 100) - list
          .filter((o) => o.id !== inv.id && Math.round(Number(o.total) * 100) !== 15000)
          .reduce((t, o) => t + Math.round(Number(o.total) * 100), 0);
        for (const inv of list) {
          const byAmount = kase.flatFee && Math.round(Number(inv.total) * 100) === leftOf(inv) ? "installment" : "";
          r[inv.id] = known[inv.id] || suggestRole(inv) || byAmount;
          p[inv.id] = { monthlyAmount: "", startDate: inv.dueDate || "", adjustments: [] };
        }
        setRoles(r);
        setPlans(p);
      })
      .catch((e) => { console.error(e); setError("Could not load this case's invoices."); setInvoices([]); });
    return () => { live = false; };
  }, [kase.id, kase.trackedClientId, kase.flatFee, retag, planMode]);

  // In retag mode the earliest installment invoice keeps the client's existing plan.
  const primaryId = useMemo(() => {
    if (!retag || !invoices) return null;
    const first = invoices.find((i) => roles[i.id] === "installment");
    return first ? first.id : null;
  }, [retag, invoices, roles]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const installmentIds = Object.keys(roles).filter((id) => roles[id] === "installment" && id !== primaryId);
      const fn = httpsCallable(getFunctions(app), retag ? "retagMyCaseClient" : "setupMyCaseCase");
      const { data } = await fn({
        caseId: kase.id,
        roles,
        plans: installmentIds.map((id) => ({
          invoiceId: id,
          monthlyAmount: Number(plans[id]?.monthlyAmount),
          startDate: plans[id]?.startDate,
          ...(retag ? {} : {
            adjustments: (plans[id]?.adjustments || []).map((a) => ({
              amount: Number(a.amount), start: a.start, months: a.months === "" ? null : Number(a.months), note: a.note,
            })),
          }),
        })),
      });
      onDone(kase, data);
    } catch (e) {
      console.error(e);
      // A timeout does not say whether the server finished, so do not claim either way.
      setError(
        e.code === "functions/deadline-exceeded" || e.code === "functions/unavailable"
          ? "The server took too long to answer. If this case has left the list it was set up; otherwise try again."
          : e.message || "Setup failed."
      );
    } finally {
      setSaving(false);
    }
  };

  const setPlan = (id, field, value) => setPlans((p) => ({ ...p, [id]: { ...p[id], [field]: value } }));

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {retag ? "Tag invoices for" : planMode ? "Add the payment plan for" : "Set up"} {kase.name}
        <Typography variant="body2" color="text.secondary">
          {(kase.clientNames || []).join(", ")} · {kase.practiceArea || "No practice area"} ·{" "}
          <Link href={MYCASE + kase.id} target="_blank" rel="noopener noreferrer">Open in MyCase</Link>
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Choose what each invoice is. Only <b>installment</b> invoices count toward the monthly plan and
          past-due status.{" "}
          {retag
            ? "Saving rebuilds this client's payment history from MyCase; the hand-entered history is kept for comparison."
            : "The plan starts on the invoice's due date in MyCase unless you change it."}
          {planMode && " This client was created from intake's initial-payment invoice; the payments already counted stay as they are."}
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!retag && <CaseTypeLine kase={kase} />}
        {kase.flatFee > 0 && (
          <Typography variant="body2" sx={{ mb: 2 }}>
            MyCase flat fee: <b>{money(kase.flatFee)}</b>
            {kase.uninvoicedFee > 0 ? ` · ${money(kase.uninvoicedFee)} not invoiced yet` : " · fully invoiced"}
          </Typography>
        )}
        {invoices === null ? <CircularProgress size={24} /> : (
          <Stack spacing={1.5}>
            {invoices.map((inv) => (
              <Paper key={inv.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2">
                      Invoice {inv.number || inv.id} · {money(inv.total)}
                      {inv.description ? ` · "${inv.description}"` : ""}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Issued {inv.invoiceDate || "—"} · Due {inv.dueDate || "—"} · Paid {money(inv.paid)} · Balance {money(inv.balance)} · {inv.status}
                    </Typography>
                  </Box>
                  <Select size="small" displayEmpty value={roles[inv.id] || ""} sx={{ minWidth: 230 }}
                    onChange={(e) => setRoles((r) => ({ ...r, [inv.id]: e.target.value }))}>
                    <MenuItem value="" disabled>Choose type…</MenuItem>
                    {Object.entries(ROLE_LABEL).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                  </Select>
                </Stack>
                {roles[inv.id] === "installment" && inv.id === primaryId && (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                    Main plan: keeps this client&apos;s current settings
                    {client?.firstInstallmentDate ? ` (from ${client.firstInstallmentDate})` : ""}.
                  </Typography>
                )}
                {roles[inv.id] === "installment" && inv.id !== primaryId && (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 1.5 }}>
                    <TextField size="small" label="Monthly amount" type="number"
                      value={plans[inv.id]?.monthlyAmount ?? ""}
                      onChange={(e) => setPlan(inv.id, "monthlyAmount", e.target.value)}
                      InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
                    <TextField size="small" label="First installment" type="date"
                      value={plans[inv.id]?.startDate ?? ""}
                      onChange={(e) => setPlan(inv.id, "startDate", e.target.value)}
                      InputLabelProps={{ shrink: true }} />
                  </Stack>
                )}
                {!retag && roles[inv.id] === "installment" && (
                  <AdjustmentRows
                    rows={plans[inv.id]?.adjustments || []}
                    onChange={(rows) => setPlan(inv.id, "adjustments", rows)}
                    plan={{ invoiceId: inv.id, invoiceNumber: inv.number, total: inv.total,
                      monthlyAmount: Number(plans[inv.id]?.monthlyAmount), startDate: plans[inv.id]?.startDate }} />
                )}
              </Paper>
            ))}
          </Stack>
        )}
        {Object.values(roles).filter((r) => r === "installment").length > 1 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            This case has more than one installment plan. Each is tracked separately on the client page,
            and the totals combine them.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !invoices?.length}>
          {saving ? "Saving…" : retag ? "Save tags and rebuild payments" : planMode ? "Save plan and import payments" : "Create client and import payments"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const daysSince = (ymd) => (ymd ? Math.floor((Date.now() - new Date(`${ymd}T00:00:00`).getTime()) / 864e5) : 0);

// "Waiting for a plan" tab: the whole fee was billed (and usually paid) in the intake
// invoice, so this client never gets an installment plan.
function NoPlanDialog({ kase, onClose, onDone }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await httpsCallable(getFunctions(app), "markMyCaseNoPlanNeeded")({ caseId: kase.id });
      onDone(kase);
    } catch (e) {
      console.error(e);
      setError(e.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        Paid in full, no plan needed
        <Typography variant="body2" color="text.secondary">{kase.name}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Use this when the whole fee was billed in the intake invoice, so there will be no
          installment invoice. The client stays in Collections as is and leaves this list. If an
          installment invoice is added in MyCase later, billing can still add a plan from MyCase Review.
        </Typography>
        {kase.openBalance > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            This case still owes {money(kase.openBalance)} in MyCase. If it will be paid monthly, use
            Add plan instead.
          </Alert>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <CaseTypeLine kase={kase} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{saving ? "Saving…" : "Confirm"}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function CaseSetup() {
  const [cases, setCases] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState(null);
  const [noPlan, setNoPlan] = useState(null);
  const [done, setDone] = useState(null);
  // "setup": new MyCase cases. "plan": clients created from intake, waiting for their monthly
  // plan. "retag": existing clients whose invoices need billing's tags (rebuild database only).
  const [tab, setTab] = useState("setup");
  const [group, setGroup] = useState("client");

  useEffect(() => {
    setCases(null);
    if (tab === "links") return undefined; // its own list (LinkProblems)
    const field = { setup: "needsSetup", plan: "needsPlan", retag: "needsTagging" }[tab];
    const q = query(collection(db, "mycaseCases"), where(field, "==", true));
    return onSnapshot(
      q,
      (snap) => setCases(snap.docs.map((d) => d.data()).sort(tab === "plan"
        // Waiting for a plan: oldest initial-payment invoice first (welcome call due 7 days after it).
        ? (a, b) => String(a.ipInvoiceDate || a.openedDate || "").localeCompare(String(b.ipInvoiceDate || b.openedDate || ""))
        : (a, b) => (b.openBalance || 0) - (a.openBalance || 0))),
      (e) => { console.error(e); setError("Could not load cases. You may not have access."); setCases([]); }
    );
  }, [tab]);

  const groupCounts = useMemo(() => {
    const n = { all: 0, client: 0, stale: 0, closed: 0, potential: 0 };
    for (const c of cases || []) { n.all++; n[caseGroup(c)]++; }
    return n;
  }, [cases]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!cases) return [];
    const inGroup = tab !== "setup" || group === "all" ? cases : cases.filter((c) => caseGroup(c) === group);
    if (!s) return inGroup;
    return inGroup.filter((c) =>
      [c.name, c.caseNumber, c.practiceArea, ...(c.clientNames || [])].some((v) => String(v || "").toLowerCase().includes(s)));
  }, [cases, search, tab, group]);

  const total = useMemo(() => filtered.reduce((s, c) => s + (c.openBalance || 0), 0), [filtered]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>Case setup</Typography>
      <Tabs value={tab} onChange={(_, v) => { setTab(v); setSearch(""); setShown(PAGE); }} sx={{ mb: 1 }}>
        <Tab value="setup" label="New MyCase cases" />
        <Tab value="plan" label="Waiting for a plan" />
        <Tab value="retag" label="Existing clients to tag" />
        <Tab value="links" label="Link problems" />
      </Tabs>
      {tab === "links" ? <LinkProblems /> : <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {tab === "setup"
          ? "MyCase cases that are open, have an unpaid balance, and are not in Collections yet. Set each one up to start tracking it; its MyCase payment history is imported automatically."
          : tab === "plan"
          ? "New cases are added to Collections automatically when intake creates the initial-payment invoice in MyCase. Once billing has created the installment invoice in MyCase, add the monthly plan here."
          : "Existing clients whose MyCase invoices could not be identified automatically (for example a removal-defense invoice, or amounts that do not match the plan). Until tagged, their hand-entered payments are kept and nothing is guessed."}
      </Typography>

      {done && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setDone(null)}>
          {done.mode === "noplan" ? `${done.name} is marked paid in full; no installment plan needed.` : <>
          {done.name} is {done.mode === "retag" ? "rebuilt from MyCase" : done.mode === "plan" ? "on its payment plan" : "set up"}: {done.imported} payment{done.imported === 1 ? "" : "s"} imported
          {done.reversedPairs ? `, ${done.reversedPairs} reversed payment${done.reversedPairs === 1 ? "" : "s"} cancelled out` : ""}
          {done.review ? `, ${done.review} held on the MyCase Review page` : ""}.
          </>}
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {tab === "setup" && cases && cases.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {GROUPS.map(([key, label]) => (
              <Chip key={key} clickable label={`${label} (${groupCounts[key] || 0})`}
                color={group === key ? "primary" : "default"} variant={group === key ? "filled" : "outlined"}
                onClick={() => { setGroup(key); setShown(PAGE); }} />
            ))}
          </Stack>
          {GROUPS.find(([k]) => k === group)?.[2] && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              {GROUPS.find(([k]) => k === group)[2]}
            </Typography>
          )}
        </Box>
      )}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }} sx={{ mb: 2 }}>
        <TextField size="small" placeholder="Search client, case or practice area" value={search}
          onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} sx={{ minWidth: 300 }} />
        {cases && (
          <Typography variant="body2" color="text.secondary">
            {filtered.length.toLocaleString()} case{filtered.length === 1 ? "" : "s"} · {money(total)} unpaid
          </Typography>
        )}
      </Stack>

      {cases === null && <CircularProgress />}
      {cases && cases.length === 0 && !error && (
        <Alert severity="success">
          {tab === "setup"
            ? "No cases waiting. Every open MyCase case with a balance is in Collections."
            : tab === "plan"
            ? "No clients waiting for a payment plan."
            : "No clients waiting for tags."}
        </Alert>
      )}

      {filtered.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Case / client</TableCell>
                <TableCell align="right">Unpaid</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.slice(0, shown).map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {(c.clientNames || []).join(", ") || c.name || "(no name)"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="div">
                      {c.name}
                      {c.practiceArea && <Chip size="small" label={c.practiceArea} sx={{ ml: 1, height: 18 }} />}
                    </Typography>
                    <Link variant="caption" href={MYCASE + c.id} target="_blank" rel="noopener noreferrer">
                      {c.caseNumber ? `#${c.caseNumber}` : `Case ${c.id}`}
                    </Link>
                    {c.openedDate && <Typography variant="caption" color="text.secondary"> · opened {c.openedDate}</Typography>}
                    {tab === "plan" && c.ipInvoiceDate && <Typography variant="caption" color="text.secondary"> · initial invoice {c.ipInvoiceDate}</Typography>}
                    {tab === "plan" && (
                      <Box sx={{ mt: 0.5 }}>
                        {c.flatFee > 0 && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            Flat fee {money(c.flatFee)}
                            {c.uninvoicedFee > 0 ? ` · ${money(c.uninvoicedFee)} not invoiced yet` : " · fully invoiced"}
                          </Typography>
                        )}
                        {(() => {
                          // Welcome call: due 7 days after intake's initial-payment invoice.
                          const from = c.ipInvoiceDate || c.openedDate;
                          if (!from) return null;
                          const left = 7 - daysSince(from);
                          const due = new Date(`${from}T12:00:00`);
                          due.setDate(due.getDate() + 7);
                          const when = due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                          return (
                            <Chip size="small" color={left < 0 ? "error" : left <= 2 ? "warning" : "default"} variant={left < 0 ? "filled" : "outlined"} sx={{ height: 20 }}
                              label={left < 0 ? `Welcome call overdue ${-left} day${left === -1 ? "" : "s"} (due ${when})` : left === 0 ? "Welcome call due today" : `Welcome call due ${when} (${left} day${left === 1 ? "" : "s"})`} />
                          );
                        })()}
                      </Box>
                    )}
                    {tab === "setup" && (
                      <Typography variant="caption" color="text.secondary">
                        {" · "}{c.lastPaymentDate ? `last paid ${c.lastPaymentDate}` : "never paid"}
                        {c.caseStage ? ` · stage: ${c.caseStage}` : ""}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    {money(c.openBalance)}
                    <Typography variant="caption" color="text.secondary" component="div">
                      {c.invoiceCount ?? 0} invoice{c.invoiceCount === 1 ? "" : "s"}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1} justifyContent="flex-end" alignItems="flex-end">
                      <Button size="small" variant="outlined" onClick={() => setOpen(c)}>
                        {{ setup: "Set up", plan: "Add plan", retag: "Tag" }[tab]}
                      </Button>
                      {tab === "plan" && !(c.uninvoicedFee > 0) && (
                        <Button size="small" color="inherit" sx={{ whiteSpace: "nowrap" }} onClick={() => setNoPlan(c)}>
                          Paid in full, no plan
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {filtered.length > shown && (
        <Box sx={{ textAlign: "center", mt: 2 }}>
          <Button onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, filtered.length - shown)} more</Button>
        </Box>
      )}

      {noPlan && (
        <NoPlanDialog
          kase={noPlan}
          onClose={() => setNoPlan(null)}
          onDone={(kase) => { setNoPlan(null); setDone({ name: kase.name, mode: "noplan", imported: 0 }); }}
        />
      )}
      {open && (
        <SetupDialog
          kase={open}
          mode={tab}
          onClose={() => setOpen(null)}
          onDone={(kase, data) => { setOpen(null); setDone({ name: kase.name, mode: tab, ...data }); }}
        />
      )}
      </>}
    </Box>
  );
}
