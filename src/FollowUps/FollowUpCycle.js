// src/FollowUps/FollowUpCycle.js
import { asDate } from "../utils/dates";
import { isSameDay, isAfter } from "date-fns";

// Returns true if the client should be added back to the follow-up list
export function shouldTriggerRecurringFollowUp(client, today = new Date()) {
  const firstRaw = client.firstInstallmentDate;
  if (!firstRaw) return false;

  const firstInstallmentDate = firstRaw.seconds
    ? asDate(firstRaw.seconds * 1000)
    : asDate(firstRaw);

  if (isNaN(firstInstallmentDate.getTime())) return false;

  const monthly = Number(client.installmentAmount || 500);
  const payments = Array.isArray(client.payments) ? client.payments : [];

  const validPayments = payments.filter((p) => {
    const date = asDate(p.date);
    return !isNaN(date.getTime()) && date >= firstInstallmentDate;
  });

  const validTotalPaid = validPayments.reduce((sum, p) => sum + p.amount, 0);
  const paymentsMade = Math.floor(validTotalPaid / monthly);

  const monthsSinceStart =
    (today.getFullYear() - firstInstallmentDate.getFullYear()) * 12 +
    (today.getMonth() - firstInstallmentDate.getMonth()) +
    1;

  const missedPayments = Math.max(0, monthsSinceStart - paymentsMade);
  const isStillPastDue = missedPayments > 0;

  // Only trigger if nextFollowUpDate is today or in the past
  const followUpDate = client.nextFollowUpDate
    ? asDate(client.nextFollowUpDate)
    : null;
  const shouldReappear =
    followUpDate &&
    (isSameDay(followUpDate, today) || isAfter(today, followUpDate));

  return isStillPastDue && shouldReappear;
}
