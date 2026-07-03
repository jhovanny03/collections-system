// Registry defines each metric and which section it belongs to.
// type: "number" | "percent" | "currency"
export const METRICS = [
  // ---- Overall Case Numbers ----
  { key: "total_cases_in_plans", name: "Total Cases in Payment Plans", section: "overall", type: "number", owner: "Arianna" },
  { key: "num_in_autopay", name: "Number in Autopay", section: "overall", type: "number", owner: "Arianna" },
  { key: "pct_in_autopay", name: "Percent in Autopay (%)", section: "overall", type: "percent", owner: "Arianna" },
  { key: "num_in_manual", name: "Number in Manual Collection", section: "overall", type: "number", owner: "Arianna" },
  { key: "pct_in_manual", name: "Percent in Manual Collection (%)", section: "overall", type: "percent", owner: "Arianna" },
  { key: "cases_current", name: "Cases Current", section: "overall", type: "number", owner: "Arianna" },
  { key: "cases_past_due", name: "Cases Past Due (Total)", section: "overall", type: "number", owner: "Arianna" },
  { key: "cases_lt_60_pd", name: "Cases < 60 Days Past Due", section: "overall", type: "number", owner: "Arianna" },
  { key: "cases_gt_60_pd", name: "Cases > 60 Days Past Due", section: "overall", type: "number", owner: "Arianna" },
  { key: "paused_active", name: "# of Paused Payment Clients (Active)", section: "overall", type: "number", owner: "Francisco" },
  { key: "welcome_calls_completed", name: "Welcome Calls Completed", section: "overall", type: "number", owner: "Arianna" },
  { key: "autopay_enrollment_rate", name: "Autopay Enrollment Rate (%)", section: "overall", type: "percent", owner: "Arianna" },

  // ---- Payment Recovery ----
  { key: "payments_received", name: "Payments Received ($)", section: "recovery", type: "currency", owner: "Arianna" },
  { key: "mtd_payments_received", name: "MTD Payments Received ($)", section: "recovery", type: "currency", owner: "Arianna" },
  { key: "autopay_collection_rate", name: "Autopay Collection Rate (%)", section: "recovery", type: "percent", owner: "Arianna" },
  { key: "pct_30_60_pd", name: "% Clients 30–60 Days Past Due", section: "recovery", type: "percent", owner: "Arianna" },
  { key: "pct_60_90_pd", name: "% Clients 60–90 Days Past Due", section: "recovery", type: "percent", owner: "Arianna" },
  { key: "pct_90_plus_pd", name: "% Clients 90+ Days Past Due", section: "recovery", type: "percent", owner: "Arianna" },
  { key: "pd_recovery_30_plus", name: "Past Due Recovery (30+ Days) $", section: "recovery", type: "currency", owner: "Francisco" },
  { key: "mtd_pct_pd_recovered", name: "MTD % Past Due Recovered", section: "recovery", type: "percent", owner: "Francisco" },
  { key: "clients_recovered", name: "Clients Recovered from Past Due (#)", section: "recovery", type: "number", owner: "Francisco" },
  { key: "total_outstanding_ar", name: "Total Outstanding A/R ($)", section: "recovery", type: "currency", owner: "Arleen" },

  // ---- Termination Process ----
  { key: "paused_clients", name: "# of Paused Payment Clients", section: "termination", type: "number", owner: "Francisco" },
  { key: "ytd_paused_clients", name: "YTD Paused Payment Clients", section: "termination", type: "number", owner: "Francisco" },
  { key: "warning_letters", name: "Warning Letters Sent", section: "termination", type: "number", owner: "Francisco" },
  { key: "terminations_finalized", name: "Terminations Finalized", section: "termination", type: "number", owner: "Arleen" },
  { key: "refunds_issued", name: "Refunds Issued ($)", section: "termination", type: "currency", owner: "Arleen" },
  { key: "ytd_refunds", name: "YTD Refunds ($)", section: "termination", type: "currency", owner: "Arleen" },
];