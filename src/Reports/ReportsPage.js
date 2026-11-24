// src/Reports/ReportsPage.js
// Reports hub. Each tab answers one question; ?tab=<key> links straight to a tab.
// Every money figure comes from the installment ledger (src/billing/ledger.js).
import React from "react";
import { Box, Tabs, Tab, Card, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../ui/kit";

import ReportsOverview from "./ReportsOverview";
import AgingReport from "./AgingReport";
import DueCollectedReport from "./DueCollectedReport";
import PaymentHistoryReport from "./PaymentHistoryReport";
import FollowUpsReport from "./FollowUpsReport";
import MyCaseSyncReport from "./MyCaseSyncReport";
import ForecastReport from "./ForecastReport";
import RiskReport from "./RiskReport";
import PaymentAllocationReport from "./PaymentAllocationReport";

const TABS = [
  { key: "overview", label: "Overview", help: "Where the money stands: what is owed, how old it is, how collection is going, who owes the most." },
  { key: "aging", label: "Aging", help: "What every client owes by age: 0–30, 31–60, 61–90 and 90+ days from the 1st of each installment's month. Download for the accountant." },
  { key: "forecast", label: "Forecast", help: "What should come in over the next 3 months from the plans, and how much is likely to." },
  { key: "risk", label: "Risk & plan health", help: "Which plans will end owing, who needs to pay more to finish on time, and who is a candidate for write-off." },
  { key: "collected", label: "Due vs collected", help: "Each month: installments due from clients who were up to date, how much was paid, by case type, and who has not paid." },
  { key: "allocations", label: "Payment allocation", help: "Pick a month and see who paid that month's installment, in full or in part, with the payments that covered it." },
  { key: "payments", label: "Payments received", help: "Every payment by day, with who recorded it (or MyCase)." },
  { key: "followups", label: "Follow-ups & promises", help: "How the monthly follow-up list is going and how many promises are kept." },
  { key: "mycase", label: "MyCase sync", help: "Whether the MyCase connection is healthy and what is waiting on a person." },
];
// Old links (bookmarks, Home tiles) keep working.
const ALIASES = { collections: "collected", cohorts: "overview" };

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const asked = ALIASES[params.get("tab")] || params.get("tab");
  const key = TABS.some((t) => t.key === asked) ? asked : "overview";
  const current = TABS.find((t) => t.key === key);

  return (
    <Box>
      <PageHeader title="Reports" subtitle="Everything about billing and payments in one place." />
      <Card sx={{ mb: 2.5, px: 1 }}>
        <Tabs value={key} onChange={(_, v) => setParams({ tab: v }, { replace: true })} variant="scrollable" allowScrollButtonsMobile>
          {TABS.map((t) => (
            <Tab key={t.key} value={t.key} label={t.label} />
          ))}
        </Tabs>
      </Card>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {current.help}
      </Typography>

      {key === "overview" && <ReportsOverview />}
      {key === "aging" && <AgingReport />}
      {key === "forecast" && <ForecastReport />}
      {key === "risk" && <RiskReport />}
      {key === "collected" && <DueCollectedReport />}
      {key === "allocations" && <PaymentAllocationReport />}
      {key === "payments" && <PaymentHistoryReport />}
      {key === "followups" && <FollowUpsReport />}
      {key === "mycase" && <MyCaseSyncReport />}
    </Box>
  );
}
