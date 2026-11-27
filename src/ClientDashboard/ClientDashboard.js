// src/ClientDashboard/ClientDashboard.js
// Client profile: a header with where they stand, then the cards grouped in tabs so each
// job is one click away. The client document is live (MyCase payments appear on their own).
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link as RouterLink } from "react-router-dom";
import { Box, Button, Card, Chip, LinearProgress, Stack, Tab, Tabs, Typography, Alert } from "@mui/material";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import db from "../firebase";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "../auth/useAuth";
import { clientRows, money } from "../billing/portfolio";
import { describeSchedule, sortedPlans, planSchedule } from "../billing/plans";
import { StatCard, Tiles } from "../ui/kit";
import { callLink, displayPhone, ago } from "../billing/contact";
import PhoneRounded from "@mui/icons-material/PhoneRounded";
import { withMyCasePayments, caseIdOf } from "../billing/mycaseOverlay";

import InvoiceSection from "../InvoiceSection";
import CaseSwitcher from "./CaseSwitcher";
import PlansPanel from "./PlansPanel";
import PlanAdjustments from "./PlanAdjustments";
import RecordPayment from "./RecordPayment";
import CommunicationLog from "./CommunicationLog";
import PaymentPromise from "./PaymentPromise";
import InstallmentSettings from "./InstallmentSettings";
import InvoiceAdjustments from "./InvoiceAdjustments";
import ClientActions from "./ClientActions";
import LetterDrafter from "./LetterDrafter";
import CaseOnHoldToggle from "./CaseOnHoldToggle";
import { SetupDialog } from "../pages/CaseSetup";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "payments", label: "Payments" },
  { key: "plan", label: "Plan & invoice", editor: true },
  { key: "notes", label: "Notes & promises" },
  { key: "letters", label: "Letters", editor: true },
];

function ClientDashboard() {
  const { clientId } = useParams();
  const [params, setParams] = useSearchParams();
  const { isEditorOrHigher, canManageUsers } = useAuth();
  // Admin fix: re-tag this client's MyCase invoices (wrong plan, wrong service...).
  const [fixCase, setFixCase] = useState(null);
  const [fixNote, setFixNote] = useState("");
  const editor = isEditorOrHigher();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);

  // Live: changes from the MyCase sync or a teammate show up without reloading.
  useEffect(() => {
    setLoading(true);
    return onSnapshot(
      doc(db, "clients", clientId),
      (snap) => {
        setClient(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [clientId]);

  // MyCase payments on this case that nobody typed in yet (hand-entered clients): they
  // count in the figures here like everywhere else; the team still logs them below.
  // Worked out from the live client, so a payment typed in a moment ago matches at once.
  // This month's MyCase payments on this case only (live), for any the sync has not stored yet.
  const caseId = client ? caseIdOf(client) : null;
  const [caseLive, setCaseLive] = useState([]);
  useEffect(() => {
    if (!caseId) return setCaseLive([]);
    const now = new Date();
    const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    return onSnapshot(
      query(collection(db, "mycasePayments"), where("caseId", "==", caseId)),
      (s) => setCaseLive(s.docs.map((d) => ({ id: String(d.data().id || d.id), ...d.data() })).filter((p) => String(p.date || "") >= first)),
      () => setCaseLive([])
    );
  }, [caseId]);
  const billing = useMemo(() => (client ? withMyCasePayments(client, caseLive) : null), [client, caseLive]);
  const row = useMemo(() => (billing ? clientRows([billing])[0] : null), [billing]);
  // Hand-entered client counted from MyCase: how the typed payments compare.
  const fromMyCase = billing && billing.typedPayments ? {
    n: billing.payments.length,
    total: billing.payments.reduce((t, p) => t + p.amount, 0),
    typedN: billing.typedPayments.length,
    typedTotal: billing.typedPayments.reduce((t, p) => t + Number(p.amount || 0), 0),
  } : null;
  const tabs = TABS.filter((t) => editor || !t.editor);
  const wanted = params.get("recordPayment") ? "payments" : params.get("tab");
  const tab = tabs.some((t) => t.key === wanted) ? wanted : "overview";
  const setTab = (key) => setParams({ tab: key }, { replace: true });

  if (loading) return <LinearProgress />;
  if (!client) return <Alert severity="warning">Client not found. It may have been removed. <RouterLink to="/clients">Back to clients</RouterLink></Alert>;

  const name = `${client.firstName || ""} ${client.lastName || ""}`.trim() || "Client";
  const plans = sortedPlans(client);
  const monthly = plans.length ? describeSchedule(planSchedule(plans[0])) : client.installmentSchedule?.length ? `${money(client.installmentSchedule[0].amount)} / month` : "—";
  const status = (client.status || "active").toLowerCase();

  return (
    <Box sx={{ maxWidth: 1280, mx: "auto" }}>
      <Button component={RouterLink} to="/clients" startIcon={<ArrowBackRounded />} size="small" sx={{ mb: 1 }}>
        All clients
      </Button>

      <Card sx={{ p: { xs: 2, md: 3 }, mb: 2.5 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" alignItems={{ md: "flex-start" }}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="h4">{name}</Typography>
              {/* Pause / Skip months / Close, right next to the name */}
              {editor && <ClientActions client={client} setClient={setClient} compact />}
            </Stack>
            {client.caseTitle && (
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                {client.caseTitle}
              </Typography>
            )}
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
              {client.caseType && <Chip size="small" label={client.caseType} color="primary" variant="outlined" />}
              <Chip size="small" label={status === "active" ? "Active" : status === "paused" ? "Paused" : client.closedBy === "MyCase sync" ? `Closed in MyCase${client.mycaseClosedDate ? ` ${client.mycaseClosedDate}` : ""}` : "Closed"} color={status === "active" ? "success" : status === "paused" ? "warning" : "default"} />
              {(client.skipMonths || []).length > 0 && <Chip size="small" variant="outlined" color="warning" label={`Skipped: ${client.skipMonths.length} month${client.skipMonths.length === 1 ? "" : "s"}`} />}
              {client.paymentHold?.active && <Chip size="small" label="On hold" color="warning" />}
              {client.awaitingPlan && <Chip size="small" label="Waiting for a plan" color="info" />}
              {row?.planEnded && <Chip size="small" label="Plan ended, still owes" color="error" />}
              {row?.needsContact && <Chip size="small" label={row.lastContact ? "No contact in 30+ days" : "Never contacted"} color="error" variant="outlined" />}
              {client.callStats?.missedCallback && <Chip size="small" label="Called us, missed: call back" color="secondary" />}
              <Chip size="small" variant="outlined" label={row?.source === "Typed by hand" ? "Payments typed by hand (no MyCase link)" : row?.source === "MyCase, invoices to tag" ? "Payments from MyCase · invoices to tag" : "Payments sync from MyCase"} />
              {client.caseStatus && <Chip size="small" variant="outlined" label={`Case: ${client.caseStatus}`} />}
              {client.mycaseStage && (
                <Chip size="small" variant="outlined" color={String(client.mycaseCaseStatus || "").toLowerCase() === "closed" ? "default" : "info"}
                  label={`MyCase: ${client.mycaseStage}${String(client.mycaseCaseStatus || "").toLowerCase() === "closed" ? " (closed)" : ""}`} />
              )}
            </Stack>
          </Box>
          <Stack spacing={1} alignItems={{ md: "flex-end" }} sx={{ flexShrink: 0 }}>
            {(client.mycasePhones || []).slice(0, 3).map((p, i) => (
              <Button key={p} variant={i === 0 ? "contained" : "outlined"} startIcon={<PhoneRounded />} href={callLink(p)} title="Call with RingCentral">
                {displayPhone(p)}
              </Button>
            ))}
            {client.myCaseLink && (
              <Button variant="outlined" endIcon={<OpenInNewRounded />} href={client.myCaseLink} target="_blank" rel="noopener noreferrer">
                Open in MyCase
              </Button>
            )}
            {canManageUsers() && caseIdOf(client) && (
              <Button size="small" color="secondary" title="Admin: change what each MyCase invoice is and which service it is for; plans and payments are rebuilt from MyCase."
                onClick={async () => {
                  const s = await getDoc(doc(db, "mycaseCases", caseIdOf(client)));
                  if (s.exists()) setFixCase({ ...s.data(), id: s.id, trackedClientId: client.id });
                  else setFixNote("This client's MyCase case is not in the sync yet.");
                }}>
                Fix invoices &amp; plans
              </Button>
            )}
            {fixNote && <Typography variant="caption" color="text.secondary">{fixNote}</Typography>}
          </Stack>
        </Stack>

        {fromMyCase && (
          <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
            The figures here use the {fromMyCase.n} payment{fromMyCase.n === 1 ? "" : "s"} MyCase received on this case ({money(fromMyCase.total)}).
            {" "}The {fromMyCase.typedN} payment{fromMyCase.typedN === 1 ? "" : "s"} typed in by hand ({money(fromMyCase.typedTotal)}, on the Payments tab) are kept for reference but not counted.
          </Alert>
        )}
        <Tiles min={170} gap={1.5} sx={{ mt: 2.5 }}>
          <StatCard label="Owed now" value={row?.amountDue ? money(row.amountDue) : "$0"} sub={row?.amountDue ? `${row.missedMonths} installment${row.missedMonths === 1 ? "" : "s"} unpaid` : "Up to date"} tone={row?.amountDue ? "bad" : "good"} help="Installments due by today (the 15th of each month) that are not fully paid." />
          <StatCard label="Balance left" value={money(row?.balance)} sub={row?.paidInFull ? "Paid in full" : "On the plan"} />
          <StatCard
            label="Monthly"
            value={plans.length > 1 ? `${plans.length} plans` : (monthly.split(" · ")[0] || "—").split(" ")[0]}
            sub={plans.length > 1 ? "See Overview" : (monthly.split(" · ")[0] || "").split(" ").slice(1).join(" ") || "Due on the 15th"}
            help={monthly}
          />
          <StatCard label="Last payment" value={row?.lastPayment ? money(row.lastPayment.amount) : "—"} sub={row?.lastPayment?.date || "No installments yet"} />
          <StatCard
            label="Last contacted"
            value={row?.lastContact ? ago(row.lastContact.at) : "Never"}
            sub={
              row?.lastContact
                ? `${row.lastContact.at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}${row.lastContact.by ? ` · ${row.lastContact.by}` : ""}${row.lastContact.source === "ringcentral" ? " · RingCentral" : ""}`
                : "No call on record"
            }
            tone={row?.needsContact ? "danger" : "default"}
            help="A call that reached the client (or a voicemail left) from RingCentral, or a follow-up call logged in the app."
          />
          {(() => {
            const s = client.callStats;
            if (!s) return <StatCard label="Calls this month" value="—" sub="From RingCentral, once connected" />;
            const made = s.attemptsThisMonth || 0;
            const received = s.receivedThisMonth ?? 0;
            return (
              <StatCard
                label="Calls this month"
                value={String(s.callsThisMonth ?? made + received)}
                sub={`${made} made · ${received} received · talked ${s.reachedThisMonth || 0}×`}
                help={`All RingCentral calls with this client this month. "Talked" = the call lasted 40 seconds or more. ${Math.round((s.talkSecTotal || 0) / 60)} min talked in total since the firm moved to RingCentral.`}
              />
            );
          })()}
          <StatCard label="Promise" value={client.paymentPromise?.amount ? money(client.paymentPromise.amount) : "None"} sub={client.paymentPromise?.date ? `on ${String(client.paymentPromise.date).slice(0, 10)}` : undefined} tone={client.paymentPromise?.amount ? "warn" : "default"} />
        </Tiles>
      </Card>

      {/* Hold banner + switch stays visible on every tab */}
      <CaseOnHoldToggle client={client} setClient={setClient} />

      <Card sx={{ mb: 2.5, px: 1 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile>
          {tabs.map((t) => <Tab key={t.key} value={t.key} label={t.label} />)}
        </Tabs>
      </Card>

      {tab === "overview" && (
        <>
          <PlansPanel client={client} />
          <CaseSwitcher client={client} setClient={setClient} />
        </>
      )}
      {tab === "payments" && <RecordPayment client={client} setClient={setClient} />}
      {tab === "plan" && (
        <>
          <PlanAdjustments client={client} setClient={setClient} />
          <InvoiceAdjustments client={client} setClient={setClient} />
          <InvoiceSection client={client} setClient={setClient} />
          {/* A plan from MyCase is adjusted above; Installment Settings stays for older clients. */}
          {!(client.source === "mycase" && (client.plans || []).length > 0) && <InstallmentSettings client={client} setClient={setClient} />}
        </>
      )}
      {tab === "notes" && (
        <>
          {/* The current promise (to edit or remove). New promises are added from the note box. */}
          {editor && client.paymentPromise?.amount ? <PaymentPromise client={client} setClient={setClient} /> : null}
          <CommunicationLog client={client} setClient={setClient} />
        </>
      )}
      {tab === "letters" && <LetterDrafter client={client} />}
      {fixCase && (
        <SetupDialog kase={fixCase} mode="fix" onClose={() => setFixCase(null)}
          onDone={(k, data) => { setFixCase(null); setFixNote(`Saved: plans and payments rebuilt from MyCase (${data?.imported ?? 0} payments).`); }} />
      )}
    </Box>
  );
}

export default ClientDashboard;
