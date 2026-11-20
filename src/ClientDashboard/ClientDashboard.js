// src/ClientDashboard/ClientDashboard.js
// Client profile: a header with where they stand, then the cards grouped in tabs so each
// job is one click away. The client document is live (MyCase payments appear on their own).
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link as RouterLink } from "react-router-dom";
import { Box, Button, Card, Chip, LinearProgress, Stack, Tab, Tabs, Typography, Alert } from "@mui/material";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import db from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "../auth/useAuth";
import { clientRows, money } from "../billing/portfolio";
import { describeSchedule, sortedPlans, planSchedule } from "../billing/plans";
import { StatCard, Tiles } from "../ui/kit";

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
  const { isEditorOrHigher } = useAuth();
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

  const row = useMemo(() => (client ? clientRows([client])[0] : null), [client]);
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
              <Chip size="small" variant="outlined" label={row?.source === "Hand-entered" ? "Payments typed by hand" : "Payments sync from MyCase"} />
              {client.caseStatus && <Chip size="small" variant="outlined" label={`Case: ${client.caseStatus}`} />}
            </Stack>
          </Box>
          {client.myCaseLink && (
            <Button variant="outlined" endIcon={<OpenInNewRounded />} href={client.myCaseLink} target="_blank" rel="noopener noreferrer" sx={{ flexShrink: 0 }}>
              Open in MyCase
            </Button>
          )}
        </Stack>

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
    </Box>
  );
}

export default ClientDashboard;
