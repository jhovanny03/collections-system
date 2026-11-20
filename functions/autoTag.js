// functions/autoTag.js
// Automatic invoice tagging for EXISTING clients, from amounts the app already holds.
// MyCase invoice descriptions ("IP") are not synced yet, so amounts are the evidence:
//   $150                                   -> other   (old consultation fee)
//   total == client's initialPaymentAmount -> initial
//   total == invoiceTotal - initial        -> installment
//   ... or $150 less, when a $150 consultation invoice exists (fee entered incl. consult)
// Anything left over (removal defense, derivative, ...) or ambiguous is NOT guessed:
// the case goes to billing's tagging list.
const cents = (v) => Math.round(Number(v || 0) * 100);
const CONSULT = 15000;

/** The single subset of `items` whose totals sum to `target` (cents), or null if none or several. */
function uniqueSubsetSum(items, target) {
  if (items.length > 12) return null; // cases have a handful of invoices; refuse to guess beyond that
  let found = null;
  for (let mask = 1; mask < 1 << items.length; mask++) {
    let sum = 0;
    for (let b = 0; b < items.length; b++) if (mask & (1 << b)) sum += cents(items[b].total);
    if (sum === target) {
      if (found) return null; // ambiguous
      found = items.filter((_, b) => mask & (1 << b));
    }
  }
  return found;
}

function autoTag(client, invoices) {
  const roles = {};
  const active = invoices.filter((i) => i.status !== "draft");
  if (!active.length) return { status: "no invoices in MyCase", roles };

  for (const i of active) if (cents(i.total) === CONSULT) roles[i.id] = "other";
  const open = () => active.filter((i) => !roles[i.id]);

  const initial = cents(client.initialPaymentAmount);
  const plan = cents(client.invoiceTotal) - initial;

  if (plan > 0) {
    const hits = open().filter((i) => cents(i.total) === plan);
    if (hits.length === 1) roles[hits[0].id] = "installment";
  }
  if (initial > 0) {
    const hits = open().filter((i) => cents(i.total) === initial)
      .sort((a, b) => String(a.invoice_date || a.invoiceDate).localeCompare(String(b.invoice_date || b.invoiceDate)));
    if (hits.length) roles[hits[0].id] = "initial";
    else {
      // The down payment is sometimes split over several invoices. Tag them only when
      // exactly ONE combination of the remaining invoices adds up to it.
      const combo = uniqueSubsetSum(open(), initial);
      if (combo) for (const i of combo) roles[i.id] = "initial";
    }
  }
  // Common shape: one invoice holds the whole fee (initial + installments together).
  if (!Object.values(roles).includes("installment") && cents(client.invoiceTotal) > 0) {
    const whole = open().filter((i) => cents(i.total) === cents(client.invoiceTotal));
    if (whole.length === 1) roles[whole[0].id] = "installment";
  }
  // Staff often entered the fee INCLUDING the $150 consultation, while MyCase bills the
  // consultation as its own invoice (e.g. fee $10,500 = $4,500 + $5,850 + $150). Only when
  // a $150 invoice exists, accept an installment invoice $150 smaller than the plan, and
  // report the adjustment so the app's plan total no longer counts the $150.
  let invoiceTotalAdjustment = 0;
  const hasConsult = active.some((i) => cents(i.total) === CONSULT);
  if (!Object.values(roles).includes("installment") && hasConsult && plan - CONSULT > 0) {
    const hits = open().filter((i) => cents(i.total) === plan - CONSULT);
    if (hits.length === 1) {
      roles[hits[0].id] = "installment";
      invoiceTotalAdjustment = -CONSULT / 100;
    }
  }

  const left = open();
  const hasInstallment = Object.values(roles).includes("installment");
  const extra = invoiceTotalAdjustment ? { invoiceTotalAdjustment } : {};
  if (hasInstallment && !left.length) return { status: "fully tagged automatically", roles, ...extra };
  if (hasInstallment) return { status: "needs billing: extra invoices", roles, untagged: left.map((i) => i.id), ...extra };
  return { status: "needs billing: no clear installment invoice", roles, untagged: left.map((i) => i.id) };
}

module.exports = { autoTag, uniqueSubsetSum };
