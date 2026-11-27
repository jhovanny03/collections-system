// src/pages/CaseSetup.jsx
// MyCase cases that are open, owe money, and have no Collections record yet.
// Billing tags each invoice (initial / installment / other), enters the monthly
// amount for each installment invoice, and saves: the server creates the client
// record and imports the case's payment history from MyCase.
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Card, Chip, CircularProgress, LinearProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, InputAdornment, Link, MenuItem, Paper, Select, Stack, TablePagination, TextField, Typography,
} from "@mui/material";
import { collection, doc, getCountFromServer, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { alpha, useTheme } from "@mui/material/styles";
import SearchRounded from "@mui/icons-material/SearchRounded";
import { PageHeader } from "../ui/kit";
import { FONT_HEADING } from "../theme/brand";
import { getFunctions, httpsCallable } from "firebase/functions";
import db, { app } from "../firebase";
import AdjustmentRows from "../billing/AdjustmentRows";
import LinkProblems from "./LinkProblems";
import { caseTypeFromMyCase } from "../billing/caseTypes";

const MYCASE = "https://law-firm-of-moumita-rahman-pllc.mycase.com/court_cases/";
const PER_PAGE = [25, 50, 100];

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

// Case type from the MyCase practice area: src/billing/caseTypes.js (shared with Link problems).
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
// Which service an invoice pays for. An additional service (removal defense, derivative...)
// is billed as its own initial invoice + monthly invoice, and becomes a plan of its own.
const SERVICES = ["Main case", "Removal defense", "Derivative", "Other additional service"];

// mode "setup": a new MyCase case (creates the client).
// mode "plan": a client created automatically from intake's initial-payment invoice; billing
// adds the monthly plan once the installment invoice is in MyCase.
// mode "retag": an existing client whose invoices could not be tagged automatically; its
// payment history is rebuilt from MyCase. The client's existing plan settings stay with
// the first installment invoice, so amounts are only asked for any extra one.
// mode "fix": an admin re-tags a client that is already set up (profile → "Fix invoices &
// plans"): same form as "retag", saved the same way (plans and payments rebuilt from MyCase).
export function SetupDialog({ kase, mode = "setup", onClose, onDone }) {
  const [invoices, setInvoices] = useState(null);
  const [roles, setRoles] = useState({});
  const [services, setServices] = useState({});
  const [plans, setPlans] = useState({});
  const [client, setClient] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fix = mode === "fix";
  const retag = mode === "retag" || fix;
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
        const knownServices = (existing && existing.invoiceServices) || {};
        const knownPlans = new Map(((existing && existing.plans) || []).map((pl) => [String(pl.invoiceId), pl]));
        const r = {}, p = {}, sv = {};
        // Billing's monthly invoice usually covers exactly what the flat fee has left after
        // the intake invoice: pre-select it as the installment invoice.
        const leftOf = (inv) => Math.round(Number(kase.flatFee || 0) * 100) - list
          .filter((o) => o.id !== inv.id && Math.round(Number(o.total) * 100) !== 15000)
          .reduce((t, o) => t + Math.round(Number(o.total) * 100), 0);
        for (const inv of list) {
          const byAmount = kase.flatFee && Math.round(Number(inv.total) * 100) === leftOf(inv) ? "installment" : "";
          r[inv.id] = known[inv.id] || suggestRole(inv) || byAmount;
          const kp = knownPlans.get(String(inv.id));
          p[inv.id] = { monthlyAmount: kp ? String(kp.monthlyAmount || "") : "", startDate: (kp && kp.startDate) || inv.dueDate || "", adjustments: [] };
          sv[inv.id] = knownServices[inv.id] || "Main case";
        }
        setRoles(r);
        setPlans(p);
        setServices(sv);
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
        services,
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
        {fix ? "Fix invoices & plans for" : retag ? "Tag invoices for" : planMode ? "Add the payment plan for" : "Set up"} {kase.name}
        <Typography variant="body2" color="text.secondary">
          {(kase.clientNames || []).join(", ")} · {kase.practiceArea || "No practice area"} ·{" "}
          <Link href={MYCASE + kase.id} target="_blank" rel="noopener noreferrer">Open in MyCase</Link>
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Choose what each invoice is. Only <b>installment</b> invoices count toward the monthly plan and
          past-due status.{" "}
          {fix
            ? "Admin fix: change what each invoice is and which service it is for. Saving rebuilds this client's plans and payment history from MyCase with these tags."
            : retag
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
                  {(roles[inv.id] === "initial" || roles[inv.id] === "installment") && (
                    <Select size="small" value={services[inv.id] || "Main case"} sx={{ minWidth: 190 }}
                      onChange={(e) => setServices((x) => ({ ...x, [inv.id]: e.target.value }))}>
                      {SERVICES.map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}
                    </Select>
                  )}
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
          {saving ? "Saving…" : fix ? "Save and rebuild plans" : retag ? "Save tags and rebuild payments" : planMode ? "Save plan and import payments" : "Create client and import payments"}
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

// The four jobs, one tab each (most urgent first), with what each one is.
const JOBS = [
  { key: "plan", label: "Welcome calls and plans", color: "error",
    what: ["Already in Collections — needs its monthly plan", "Intake created the initial-payment invoice in MyCase, so the client was added to Collections automatically. Billing makes the welcome call within 7 days of that invoice and, once the installment invoice is in MyCase, adds the monthly plan here."] },
  { key: "setup", label: "New MyCase cases", color: "primary",
    what: ["Not in Collections yet — needs to be set up", "Open MyCase cases with an unpaid balance that nobody has brought into Collections. Tag their invoices to create the client (its MyCase payments come in on their own), or mark it \"Not a client\" if it was terminated or never signed."] },
  { key: "retag", label: "Existing clients to tag", color: "warning",
    what: ["In Collections — invoices the sync couldn't identify", "Clients already in Collections whose MyCase invoices don't match their plan (for example a removal-defense invoice, or amounts that differ). Until tagged, their hand-entered payments are kept and nothing is guessed."] },
  { key: "links", label: "Link problems", color: "secondary",
    what: ["A Collections record and a MyCase case that may be the same", "Records in Collections that aren't linked to a MyCase case, or two records on the same case. Compare them side by side, then link them, pick another suggested case, or keep one record."] },
];
const STEP_NAMES = ["Tag invoices", "Plan", "In Collections"];

function Steps({ current }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1.25 }} useFlexGap flexWrap="wrap">
      {STEP_NAMES.map((n, i) => {
        const done = i < current, cur = i === current;
        return (
          <React.Fragment key={n}>
            {i > 0 && <Box sx={{ width: 22, height: 2, bgcolor: "divider" }} />}
            <Stack direction="row" spacing={0.6} alignItems="center">
              <Box sx={{
                width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, border: 2,
                borderColor: done ? "success.main" : cur ? "primary.main" : "divider", bgcolor: done ? "success.main" : "background.paper",
                color: done ? "#fff" : cur ? "primary.main" : "text.disabled",
              }}>{done ? "✓" : i + 1}</Box>
              <Typography variant="caption" fontWeight={800} color={done ? "text.primary" : cur ? "primary.main" : "text.disabled"}>{n}</Typography>
            </Stack>
          </React.Fragment>
        );
      })}
    </Stack>
  );
}

export default function CaseSetup() {
  const theme = useTheme();
  const [cases, setCases] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  // The job tabs stay under the app's top bar while scrolling: measure its height.
  const [barH, setBarH] = useState(64);
  useEffect(() => {
    const bar = document.querySelector(".MuiAppBar-root");
    if (!bar) return undefined;
    const measure = () => setBarH(bar.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  const [open, setOpen] = useState(null);
  const [noPlan, setNoPlan] = useState(null);
  const [done, setDone] = useState(null);
  const [counts, setCounts] = useState({});
  // "plan": clients created from intake, waiting for their monthly plan. "setup": new MyCase
  // cases. "retag": existing clients whose invoices need billing's tags. "links": records not
  // matched to exactly one case.
  const [tab, setTab] = useState("plan");
  const [group, setGroup] = useState("client");
  const [showRemoved, setShowRemoved] = useState(false);
  const [removing, setRemoving] = useState(null);

  // "Not a client": take a new case off the list (terminated...); "Put back" undoes it.
  const removeCase = async (c, undo) => {
    let reason = "";
    if (!undo) {
      reason = window.prompt(`Why is ${c.name} not a client? (it will stay off this list)`, "Terminated");
      if (reason === null) return;
    }
    setRemoving(c.id);
    setError("");
    try {
      await httpsCallable(getFunctions(app), "dismissMyCaseCaseSetup")({ caseId: c.id, undo, reason });
    } catch (e) {
      setError(`Could not ${undo ? "put back" : "remove"} ${c.name}: ${e.message}`);
    } finally {
      setRemoving(null);
    }
  };

  // Counts for the tab badges (refreshed after each save).
  useEffect(() => {
    const count = (q) => getCountFromServer(q).then((s) => s.data().count).catch(() => null);
    Promise.all([
      count(query(collection(db, "mycaseCases"), where("needsPlan", "==", true))),
      count(query(collection(db, "mycaseCases"), where("needsSetup", "==", true))),
      count(query(collection(db, "mycaseCases"), where("needsTagging", "==", true))),
      count(collection(db, "mycaseLinkIssues")),
    ]).then(([plan, setup, retag, links]) => setCounts({ plan, setup, retag, links }));
  }, [done]);

  useEffect(() => {
    setCases(null);
    if (tab === "links") return undefined; // its own list (LinkProblems)
    const field = { setup: "needsSetup", plan: "needsPlan", retag: "needsTagging" }[tab];
    // "Removed": new cases billing took off the list (terminated, not a client).
    const q = tab === "setup" && showRemoved
      ? query(collection(db, "mycaseCases"), where("setupDismissed.at", ">", ""))
      : query(collection(db, "mycaseCases"), where(field, "==", true));
    return onSnapshot(
      q,
      (snap) => setCases(snap.docs.map((d) => d.data()).sort(tab === "plan"
        // Waiting for a plan: oldest initial-payment invoice first (welcome call due 7 days after it).
        ? (a, b) => String(a.ipInvoiceDate || a.openedDate || "").localeCompare(String(b.ipInvoiceDate || b.openedDate || ""))
        : (a, b) => (b.openBalance || 0) - (a.openBalance || 0))),
      (e) => { console.error(e); setError("Could not load cases. You may not have access."); setCases([]); }
    );
  }, [tab, showRemoved]);

  const groupStats = useMemo(() => {
    const n = { all: [0, 0], client: [0, 0], stale: [0, 0], closed: [0, 0], potential: [0, 0] };
    if (tab !== "setup" || showRemoved) return n;
    for (const c of cases || []) {
      const g = caseGroup(c);
      n.all[0]++; n.all[1] += c.openBalance || 0;
      n[g][0]++; n[g][1] += c.openBalance || 0;
    }
    return n;
  }, [cases, tab, showRemoved]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!cases) return [];
    const inGroup = tab !== "setup" || group === "all" || showRemoved ? cases : cases.filter((c) => caseGroup(c) === group);
    if (!s) return inGroup;
    return inGroup.filter((c) =>
      [c.name, c.caseNumber, c.practiceArea, ...(c.clientNames || [])].some((v) => String(v || "").toLowerCase().includes(s)));
  }, [cases, search, tab, group, showRemoved]);

  const total = useMemo(() => filtered.reduce((s, c) => s + (c.openBalance || 0), 0), [filtered]);
  const job = JOBS.find((j) => j.key === tab);
  const jc = theme.palette[job.color].main;
  const pickTab = (v) => { setTab(v); setSearch(""); setPage(0); setShowRemoved(false); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const welcome = (c) => {
    // Welcome call: due 7 days after intake's initial-payment invoice.
    const from = c.ipInvoiceDate || c.openedDate;
    if (!from) return null;
    const left = 7 - daysSince(from);
    const due = new Date(`${from}T12:00:00`);
    due.setDate(due.getDate() + 7);
    const when = due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return { left, label: left < 0 ? `Welcome call overdue ${-left} day${left === -1 ? "" : "s"} (due ${when})` : left === 0 ? "Welcome call due today" : `Welcome call due ${when} (${left} day${left === 1 ? "" : "s"})` };
  };
  const pill = (label, tone) => {
    const c = tone ? theme.palette[tone].main : theme.palette.text.secondary;
    return <Box key={label} component="span" sx={{ fontSize: 11.5, fontWeight: 800, px: 1, py: 0.25, borderRadius: 99, color: tone === "error" ? "#fff" : c, bgcolor: tone === "error" ? c : alpha(c, tone ? 0.12 : 0.08) }}>{label}</Box>;
  };

  return (
    <Box>
      <PageHeader
        title="Case Setup"
        subtitle="Your to-do list for getting MyCase cases into Collections. One tab per job, most urgent first."
        actions={
          <>
            <TextField size="small" placeholder="Search client, case or practice area" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} sx={{ minWidth: 260 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }} />
            {tab === "setup" && (
              <Button variant={showRemoved ? "contained" : "outlined"} onClick={() => { setShowRemoved((v) => !v); setPage(0); }}>
                {showRemoved ? "Back to cases to set up" : "Removed (not clients)"}
              </Button>
            )}
          </>
        }
      />

      {/* One tab per job: stays visible under the top bar while scrolling */}
      <Stack direction="row" useFlexGap flexWrap="wrap"
        sx={{ position: "sticky", top: barH, zIndex: 5, bgcolor: "background.default", borderBottom: 1, borderColor: "divider", mb: 2, mx: { xs: -1.5, sm: -2.5, md: -3.5 }, px: { xs: 1.5, sm: 2.5, md: 3.5 }, boxShadow: `0 8px 12px -12px ${alpha(theme.palette.common.black, 0.35)}` }}>
        {JOBS.map((j) => {
          const c = theme.palette[j.color].main;
          const on = tab === j.key;
          return (
            <Box key={j.key} component="button" type="button" onClick={() => pickTab(j.key)}
              sx={{
                display: "flex", alignItems: "center", gap: 1, px: 1.75, pt: 1.25, pb: 1.5, mb: "-1px", border: 0, borderBottom: 3, borderColor: on ? c : "transparent",
                bgcolor: "transparent", cursor: "pointer", font: `700 16px ${FONT_HEADING}`, color: on ? "text.primary" : "text.secondary", "&:hover": { color: "text.primary" },
              }}>
              {j.label}
              <Box component="span" sx={{ font: "800 12px 'Nunito Sans'", px: 1, py: 0.2, borderRadius: 99, color: c, bgcolor: alpha(c, 0.12) }}>
                {counts[j.key] == null ? "…" : counts[j.key].toLocaleString()}
              </Box>
            </Box>
          );
        })}
      </Stack>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 300px" }, alignItems: "start" }}>
        <Box sx={{ minWidth: 0 }}>
          {/* What this tab is */}
          <Stack direction="row" spacing={1.5} sx={{ p: 1.5, px: 2, mb: 2, borderRadius: 3, bgcolor: alpha(jc, 0.08) }}>
            <Box sx={{ width: 28, height: 28, flex: "none", borderRadius: 2, display: "grid", placeItems: "center", bgcolor: "background.paper", color: jc, fontWeight: 800 }}>i</Box>
            <Box>
              <Typography variant="body2" fontWeight={800} sx={{ color: jc }}>{job.what[0]}</Typography>
              <Typography variant="body2" color="text.secondary">{job.what[1]}</Typography>
            </Box>
          </Stack>

          {tab === "links" ? <LinkProblems search={search} /> : <>
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

          {tab === "setup" && !showRemoved && cases && cases.length > 0 && (
            <Box sx={{ mb: 1.5 }}>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                {GROUPS.map(([key, label]) => (
                  <Chip key={key} clickable label={`${label} · ${groupStats[key][0]}`} sx={{ fontWeight: 800 }}
                    color={group === key ? "primary" : "default"} variant={group === key ? "filled" : "outlined"}
                    onClick={() => { setGroup(key); setPage(0); }} />
                ))}
              </Stack>
              {GROUPS.find(([k]) => k === group)?.[2] && (
                <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" sx={{ mt: 0.75 }}>
                  {GROUPS.find(([k]) => k === group)[2]} {money(groupStats[group][1])} unpaid.
                </Typography>
              )}
            </Box>
          )}

          {cases === null && <LinearProgress />}
          {cases && cases.length === 0 && !error && (
            <Alert severity="success">
              {tab === "setup"
                ? showRemoved ? "No cases have been removed." : "No cases waiting. Every open MyCase case with a balance is in Collections."
                : tab === "plan"
                ? "No clients waiting for a payment plan."
                : "No clients waiting for tags."}
            </Alert>
          )}
          {cases && filtered.length > 0 && (
            <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: "block", mb: 1 }}>
              {filtered.length.toLocaleString()} case{filtered.length === 1 ? "" : "s"} · {money(total)} unpaid
            </Typography>
          )}

          {filtered.slice(page * perPage, page * perPage + perPage).map((c) => {
            const w = tab === "plan" ? welcome(c) : null;
            const barColor = tab === "plan" ? (w && w.left < 0 ? theme.palette.error.main : theme.palette.warning.main) : jc;
            const step = tab === "plan" ? 1 : 0;
            return (
              <Card key={c.id} sx={{ display: "grid", gridTemplateColumns: "4px minmax(0, 1fr) auto", gap: 2, mb: 1, pr: 2, py: 1.75, alignItems: "center", "&::before": { content: '""', alignSelf: "stretch", borderRadius: "0 4px 4px 0", bgcolor: barColor } }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={800}>{(c.clientNames || []).join(", ") || c.name || "(no name)"}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap component="div" title={c.name}>
                    {c.name} · <Link href={MYCASE + c.id} target="_blank" rel="noopener noreferrer">{c.caseNumber ? `#${c.caseNumber}` : `Case ${c.id}`}</Link>
                  </Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                    {w && pill(w.label, w.left < 0 ? "error" : w.left <= 2 ? "warning" : null)}
                    {c.practiceArea && pill(c.practiceArea)}
                    {c.caseStage && pill(`MyCase: ${c.caseStage}`)}
                    {tab === "plan" && c.flatFee > 0 && pill(c.uninvoicedFee > 0 ? `${money(c.uninvoicedFee)} not invoiced yet` : `Flat fee ${money(c.flatFee)} · fully invoiced`)}
                    {tab !== "plan" && pill(c.lastPaymentDate ? `last paid ${c.lastPaymentDate}` : "never paid")}
                    {c.openedDate && pill(`opened ${c.openedDate}`)}
                    {pill(`${c.invoiceCount ?? 0} invoice${c.invoiceCount === 1 ? "" : "s"}`)}
                  </Stack>
                  {!showRemoved && <Steps current={step} />}
                </Box>
                <Stack alignItems="flex-end" spacing={1}>
                  {c.openBalance > 0 ? (
                    <Typography sx={{ font: `700 18px ${FONT_HEADING}` }}>{money(c.openBalance)}</Typography>
                  ) : (
                    <Typography variant="caption" color="text.secondary" fontWeight={800}>Nothing open in MyCase</Typography>
                  )}
                  <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center" useFlexGap flexWrap="wrap">
                    {showRemoved && tab === "setup" ? (
                      <>
                        <Typography variant="caption" color="text.secondary">
                          Removed{c.setupDismissed?.by ? ` by ${c.setupDismissed.by}` : ""}{c.setupDismissed?.reason ? ` · ${c.setupDismissed.reason}` : ""}
                        </Typography>
                        <Button size="small" variant="outlined" disabled={removing === c.id} onClick={() => removeCase(c, true)}>Put back</Button>
                      </>
                    ) : (
                      <>
                        {tab === "setup" && (
                          <Button size="small" variant="outlined" color="inherit" sx={{ whiteSpace: "nowrap" }} disabled={removing === c.id} onClick={() => removeCase(c, false)}>Not a client</Button>
                        )}
                        {tab === "plan" && !(c.uninvoicedFee > 0) && (
                          <Button size="small" variant="outlined" color="inherit" sx={{ whiteSpace: "nowrap" }} onClick={() => setNoPlan(c)}>Paid in full</Button>
                        )}
                        <Button size="small" variant="contained" sx={{ whiteSpace: "nowrap" }} onClick={() => setOpen(c)}>
                          {{ setup: "Set up", plan: c.uninvoicedFee > 0 ? "Add plan (invoice pending)" : "Add plan", retag: "Tag invoices" }[tab]}
                        </Button>
                      </>
                    )}
                  </Stack>
                </Stack>
              </Card>
            );
          })}
          {filtered.length > PER_PAGE[0] && (
            <Card sx={{ mt: 1 }}>
              <TablePagination component="div" count={filtered.length} page={Math.min(page, Math.max(0, Math.ceil(filtered.length / perPage) - 1))}
                onPageChange={(_, p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                rowsPerPage={perPage} rowsPerPageOptions={PER_PAGE} labelRowsPerPage="Cases per page"
                onRowsPerPageChange={(e) => { setPerPage(parseInt(e.target.value, 10)); setPage(0); }} />
            </Card>
          )}
          </>}
        </Box>

        {/* Side: the four jobs, and the backlog by group */}
        <Stack spacing={2} sx={{ position: { lg: "sticky" }, top: { lg: barH + 72 } }}>
          <Card sx={{ p: 2.25 }}>
            <Typography variant="body2" fontWeight={800} color="text.secondary" sx={{ mb: 1 }}>All four jobs</Typography>
            {JOBS.map((j, i) => (
              <Box key={j.key} component="button" type="button" onClick={() => pickTab(j.key)}
                sx={{ display: "grid", gridTemplateColumns: "1fr auto", width: "100%", textAlign: "left", font: "inherit", color: "inherit", border: 0, bgcolor: "transparent", cursor: "pointer", py: 1, borderTop: i ? 1 : 0, borderColor: "divider", "&:hover b": { textDecoration: "underline" } }}>
                <Typography variant="body2" fontWeight={800} component="b">{j.label}</Typography>
                <Typography variant="body2" fontWeight={800} sx={{ color: theme.palette[j.color].main }}>{counts[j.key] == null ? "…" : counts[j.key].toLocaleString()}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ gridColumn: "1 / 3" }}>{j.what[0]}</Typography>
              </Box>
            ))}
          </Card>
          {tab === "setup" && !showRemoved && cases && cases.length > 0 && (
            <Card sx={{ p: 2.25 }}>
              <Typography variant="body2" fontWeight={800} color="text.secondary" sx={{ mb: 1 }}>Backlog of new MyCase cases</Typography>
              {GROUPS.filter(([k]) => k !== "all").map(([k, label], i) => {
                const c = { client: theme.palette.primary.main, stale: "#C9961A", closed: theme.palette.secondary.main, potential: theme.palette.info.main }[k];
                const max = Math.max(1, ...["client", "stale", "closed", "potential"].map((g) => groupStats[g][0]));
                return (
                  <Box key={k} component="button" type="button" onClick={() => { setGroup(k); setPage(0); }}
                    sx={{ display: "grid", gridTemplateColumns: "1fr auto", width: "100%", textAlign: "left", font: "inherit", color: "inherit", border: 0, bgcolor: "transparent", cursor: "pointer", py: 1, borderTop: i ? 1 : 0, borderColor: "divider" }}>
                    <Typography variant="body2" fontWeight={800}>{label}</Typography>
                    <Typography variant="body2" fontWeight={800}>{groupStats[k][0]}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ gridColumn: "1 / 3" }}>{money(groupStats[k][1])} unpaid</Typography>
                    <Box sx={{ gridColumn: "1 / 3", height: 6, borderRadius: 99, bgcolor: alpha(theme.palette.text.primary, 0.07), overflow: "hidden", mt: 0.5 }}>
                      <Box sx={{ height: "100%", width: `${(groupStats[k][0] / max) * 100}%`, bgcolor: c, borderRadius: 99 }} />
                    </Box>
                  </Box>
                );
              })}
            </Card>
          )}
        </Stack>
      </Box>

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
    </Box>
  );
}
