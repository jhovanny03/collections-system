// src/ClientDashboard/PlansPanel.jsx
// Shown on cases with more than one installment plan (e.g. main fee + removal defense):
// one card per plan, each judged on its own schedule and its own payments, plus the
// combined position. The Billing Overview below describes Plan 1 only.
import React, { useMemo } from "react";
import { Alert, Box, Card, CardContent, CardHeader, Chip, Divider, Stack, Typography } from "@mui/material";
import ViewListIcon from "@mui/icons-material/ViewList";
import { planViews, isMultiPlan, mergeSnapshots, monthlyOn } from "../billing/plans";
import { computeSinglePlanSnapshot } from "../Reports/utils/billingCompute";
import { formatDate, asDate } from "../utils/dates";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function installmentsPaid(view) {
  const start = view.initialPaymentDate ? asDate(view.initialPaymentDate) : null;
  return (view.payments || [])
    .filter((p) => p.kind !== "initial" && (!start || asDate(p.date) > start))
    .reduce((s, p) => s + Number(p.amount || 0), 0);
}

function Stat({ label, value, tone }) {
  return (
    <Box sx={{ minWidth: 120 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }} color={tone ? `${tone}.main` : "text.primary"}>{value}</Typography>
    </Box>
  );
}

// Monthly amounts are changed on the "Payment plan & adjustments" card (PlanAdjustments).
export default function PlansPanel({ client }) {
  const rows = useMemo(() => {
    if (!isMultiPlan(client)) return null;
    const now = new Date();
    return planViews(client).map((view) => ({
      view,
      snap: computeSinglePlanSnapshot(view, now),
      paid: installmentsPaid(view),
      plan: (client.plans || []).find((p) => String(p.invoiceId) === view.planInvoiceId) || {},
      monthly: monthlyOn(view.installmentSchedule, now),
    }));
  }, [client]);

  if (!rows) return null;
  const combined = mergeSnapshots(rows.map((r) => r.snap));

  return (
    <Card sx={{ borderRadius: 3, mb: 3 }}>
      <CardHeader
        avatar={<ViewListIcon color="primary" />}
        title={`Payment plans (${rows.length})`}
        subheader="Each installment invoice is tracked as its own plan. Totals below combine them."
        sx={{ "& .MuiCardHeader-title": { fontWeight: 700 } }}
      />
      <CardContent>
        <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          <Stat label="Amount due (all plans)" value={money(combined.amountDue)} tone={combined.amountDue > 0 ? "error" : "success"} />
          <Stat label="Months behind (worst plan)" value={combined.missedMonths || 0} tone={combined.missedMonths > 0 ? "error" : undefined} />
          <Stat label="Remaining balance (all plans)" value={money(combined.remainingBalance)} />
          <Stat label="Monthly total" value={money(rows.reduce((s, r) => s + r.monthly, 0))} />
        </Stack>
        <Divider sx={{ mb: 2 }} />
        <Stack spacing={1.5}>
          {rows.map(({ view, snap, paid, plan, monthly }, i) => (
            <Box key={view.planInvoiceId} sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 1.5 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                <Typography variant="subtitle2">Plan {i + 1}</Typography>
                <Chip size="small" label={`MyCase invoice ${view.planInvoiceNumber || view.planInvoiceId}`} />
                {i === 0 && <Chip size="small" variant="outlined" label="Shown in Billing Overview below" />}
                {snap.missedMonths > 0 ? (
                  <Chip size="small" color="error" label={`${snap.missedMonths} month${snap.missedMonths === 1 ? "" : "s"} behind`} />
                ) : (
                  <Chip size="small" color="success" label={snap.remainingBalance > 0 ? "Current" : "Paid off"} />
                )}
              </Stack>
              <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                <Stat label="Plan total" value={money(i === 0 ? plan.total : view.invoiceTotal)} />
                <Stat label="Monthly" value={money(monthly)} />
                <Stat label="Starts" value={formatDate(plan.startDate)} />
                <Stat label="Paid toward plan" value={money(paid)} />
                <Stat label="Remaining" value={money(snap.remainingBalance)} />
                <Stat label="Amount due" value={money(snap.amountDue)} tone={snap.amountDue > 0 ? "error" : undefined} />
                <Stat label="Next due" value={Number(snap.remainingBalance || 0) <= 0.005 ? "Nothing left" : snap.nextExpectedLabel || "—"} />
                <Stat label="Last payment" value={snap.lastPayment ? `${formatDate(snap.lastPayment.date)} · ${money(snap.lastPayment.amount)}` : "—"} />
              </Stack>
            </Box>
          ))}
        </Stack>
        <Alert severity="info" sx={{ mt: 2 }}>
          The initial payment and any hand-entered payment without a plan count toward Plan 1.
          To change a plan&apos;s monthly amount, use Payment plan &amp; adjustments
          {client.source === "mycase" ? "" : " (Plan 1: Installment Settings)"} below.
        </Alert>
      </CardContent>
    </Card>
  );
}
