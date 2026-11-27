// src/ClientFollowUps/followUps.ui.js
// Words and helpers shared by the Follow-ups page and its call panel.
import { asDate } from "../utils/dates";
import { FOLLOW_UP_STATUS } from "./followUps.types";

export const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
export const shortDate = (v) => {
  if (!v) return "";
  const d = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : asDate(v);
  return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
export const isPaid = (row) => !!row.resolvedReason;

// Plain words for the stored statuses.
export const STATUS = {
  [FOLLOW_UP_STATUS.PENDING]: { label: "Not called", color: "default" },
  [FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT]: { label: "Called, no answer", color: "warning" },
  [FOLLOW_UP_STATUS.REACHED_WORKING]: { label: "Contacted", color: "info" },
  [FOLLOW_UP_STATUS.PROMISE]: { label: "Promised", color: "primary" },
  [FOLLOW_UP_STATUS.PARTIAL_PAYMENT]: { label: "Partial", color: "secondary" },
  [FOLLOW_UP_STATUS.RESOLVED]: { label: "Resolved", color: "success" },
};

export const NON_PAY_REASONS = [
  { value: "CASE_TAKING_TOO_LONG", label: "Case taking too long" },
  { value: "CARD_ISSUES", label: "Card / payment method issues" },
  { value: "FINANCIAL_DIFFICULTIES", label: "Financial difficulties" },
  { value: "NO_EAD_YET", label: "No EAD yet" },
  { value: "NO_RECEIPT_NOTICE", label: "No receipt notice received" },
  { value: "NOT_RECEIVING_UPDATES", label: "Not receiving case updates" },
  { value: "CLIENT_UNRESPONSIVE", label: "Client unresponsive" },
  { value: "OTHER", label: "Other" },
];
export const reasonLabel = (row) => (row.nonPayReason === "OTHER" ? row.nonPayReasonCustom || "Other" : NON_PAY_REASONS.find((r) => r.value === row.nonPayReason)?.label || "");
