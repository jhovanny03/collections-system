// src/ClientDashboard/letters/_helpers/billing.js
import { computeBillingSnapshot } from "../../../Reports/utils/billingCompute";

/**
 * The amount a warning letter says is past due: the same "amount due" the client page
 * and reports show (monthly amount changes, skipped months, holds, the plan total cap,
 * and every installment plan of the case combined).
 *
 * It used to be worked out separately (months since start x installmentAmount, $500 if
 * unset, minus every payment), which kept counting months after a client had paid in
 * full and ignored schedule changes and second plans.
 */
export function computeCurrentPastDue(client, asOf = new Date()) {
  if (!client) return 0;
  return Number(computeBillingSnapshot(client, asOf).amountDue || 0);
}
