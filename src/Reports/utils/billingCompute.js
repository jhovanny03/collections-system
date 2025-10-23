// src/Reports/utils/billingCompute.js
//
// Snapshot math used by A/R Aging (and can match BillingOverview).
// - Honors base invoice + adjustments (applyTo === 'balance') with optional downPayment.
// - Down payment on an adjustment reduces the adjustment principal (it is NOT a payment).
// - Remaining balance = effectiveInvoice - initialPayment - validTotalPaid (installments only).
// - Past-due months, next-expected label, etc., use the same oldest-first allocation.

export function computeBillingSnapshot(client, asOfDate = new Date()) {
  if (!client) {
    return {
      status: "active",
      amountDue: 0,
      missedMonths: 0,
      remainingBalance: 0,
      lastPayment: null,
      nextExpectedLabel: null,
      invoiceBase: 0,
      adjNetToBalance: 0,
      invoiceEffective: 0,
    };
  }

  // ---------- Base + Adjustments (net) ----------
  // Prefer a frozen "invoiceBaseTotal" if present; else fall back to legacy invoiceTotal.
  const invoiceBase = Number(
    client.invoiceBaseTotal != null ? client.invoiceBaseTotal : client.invoiceTotal || 0
  );

  const adjustments = Array.isArray(client.invoiceAdjustments)
    ? client.invoiceAdjustments
    : [];

  // Only adjustments that affect the balance; each can have a downPayment that reduces its principal
  const adjNetToBalance = adjustments.reduce((sum, a) => {
    const applyTo = String(a?.applyTo || "balance").toLowerCase();
    if (applyTo !== "balance") return sum;
    const amt = Number(a?.amount || 0);
    const dp  = Number(a?.downPayment || 0);
    return sum + Math.max(0, amt - Math.max(0, dp));
  }, 0);

  const invoiceEffective = Math.max(0, invoiceBase + adjNetToBalance);

  // ---------- Status / dates ----------
  const status = (client.status || "active").toLowerCase();
  const isPaused = status === "paused";
  const isClosed = status === "closed";

  const toDate = (raw) => (raw?.seconds ? new Date(raw.seconds * 1000) : new Date(raw));
  const rawStart = client.firstInstallmentDate;
  if (!rawStart || isNaN(toDate(rawStart))) {
    return {
      status: status,
      amountDue: 0,
      missedMonths: 0,
      remainingBalance: Math.max(0, invoiceEffective - Number(client.initialPaymentAmount || 0)),
      lastPayment: getLastPayment(client),
      nextExpectedLabel: null,
      invoiceBase,
      adjNetToBalance,
      invoiceEffective,
    };
  }

  // Anchor: expectedAnchor takes precedence (resume)
  const expectedAnchor =
    client.expectedAnchor ? new Date(client.expectedAnchor) : null;
  const anchorDate = expectedAnchor || toDate(rawStart);

  // Standardize due date to the 15th
  const firstDueDate = new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    15
  );

  const pauseStartedAt = client.pauseStartedAt ? toDate(client.pauseStartedAt) : null;
  const today = new Date(asOfDate);

  // Skip months (array of "YYYY-MM")
  const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
  const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  const skipSet = new Set((client.skipMonths || client.skippedMonths || []).map(String));
  const monthIsSkipped = (d) => skipSet.has(ymKey(d));

  // Sorted schedule
  const schedule = (client.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const getInstallmentAmountForDate = (date) => {
    for (let i = 0; i < schedule.length; i++) {
      const s = schedule[i];
      const sStart = new Date(s.start);
      const sEnd = new Date(s.end);
      if (date >= sStart && date <= sEnd) return Number(s.amount);
    }
    return Number(client.installmentAmount || 500);
  };

  // Payments AFTER initial payment date count toward installments
  const initialPayment = Number(client.initialPaymentAmount || 0);
  const initialPaymentDate = client.initialPaymentDate ? new Date(client.initialPaymentDate) : null;

  const allPayments = Array.isArray(client.payments) ? client.payments : [];
  const paymentsAfterInitial = allPayments
    .filter((p) => {
      const d = new Date(p.date);
      return initialPaymentDate ? d > initialPaymentDate : true;
    })
    .map((p) => ({ amount: Number(p.amount || 0), date: new Date(p.date) }))
    .sort((a, b) => a.date - b.date);

  // Build months up to cutoff
  const monthsUpToCutoff = [];
  if (!isClosed) {
    const cutoff =
      isPaused && pauseStartedAt
        ? new Date(pauseStartedAt.getFullYear(), pauseStartedAt.getMonth(), 14) // up to day before the pause-month 15th
        : today;

    const cursor = new Date(firstDueDate);
    while (cursor <= cutoff) {
      if (!monthIsSkipped(cursor)) {
        monthsUpToCutoff.push(new Date(cursor));
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // Oldest-first allocation into past months
  const paymentPool = paymentsAfterInitial.map((p) => ({ ...p })); // clone
  let validTotalPaid = 0;
  const dueMonths = []; // missed months for display

  for (const monthDate of monthsUpToCutoff) {
    const amountDue = getInstallmentAmountForDate(monthDate);
    let monthPaid = 0;

    for (const p of paymentPool) {
      if (p.amount <= 0) continue;
      if (monthPaid >= amountDue) break;

      const used = Math.min(amountDue - monthPaid, p.amount);
      monthPaid += used;
      validTotalPaid += used;
      p.amount -= used;
    }
    if (monthPaid < amountDue) {
      dueMonths.push({ label: labelFor(monthDate), amount: amountDue });
    }
  }

  // Prepayments to future months (active, not paused/closed)
  if (!isClosed && !isPaused) {
    let leftover = paymentPool.reduce((s, p) => s + (p.amount || 0), 0);
    if (leftover > 0) {
      const futureAllocCursor = new Date(today);
      futureAllocCursor.setDate(15);
      if (futureAllocCursor <= today) {
        futureAllocCursor.setMonth(futureAllocCursor.getMonth() + 1);
      }

      let guard = 0;
      while (leftover > 0 && guard < 60) {
        if (monthIsSkipped(futureAllocCursor)) {
          futureAllocCursor.setMonth(futureAllocCursor.getMonth() + 1);
          guard++;
          continue;
        }
        const amt = getInstallmentAmountForDate(futureAllocCursor);
        const use = Math.min(amt, leftover);
        validTotalPaid += use;
        leftover -= use;

        futureAllocCursor.setMonth(futureAllocCursor.getMonth() + 1);
        guard++;
      }
    }
  }

  // Amount due (missed months total)
  const amountDue = isClosed
    ? 0
    : dueMonths.reduce((sum, m) => sum + (m.amount || 0), 0);

  // Remaining balance uses EFFECTIVE invoice
  const remainingBalance = isClosed
    ? 0
    : Math.max(0, invoiceEffective - initialPayment - validTotalPaid);

  // First unpaid month label (for “Next Expected”)
  const simPool = paymentsAfterInitial.map((p) => ({ ...p }));
  const monthIsFullyPaid = (d, pool) => {
    if (monthIsSkipped(d)) return true;
    const due = getInstallmentAmountForDate(d);
    let paid = 0;
    for (const p of pool) {
      if (p.amount <= 0) continue;
      const take = Math.min(due - paid, p.amount);
      paid += take;
      p.amount -= take;
      if (paid >= due) break;
    }
    return paid >= due;
  };
  const firstUnpaid = new Date(firstDueDate);
  let guardSim = 0;
  while (!isClosed && !isPaused && guardSim < 120 && monthIsFullyPaid(firstUnpaid, simPool)) {
    firstUnpaid.setMonth(firstUnpaid.getMonth() + 1);
    guardSim++;
  }
  const nextExpectedLabel = isClosed || isPaused ? null : labelFor(firstUnpaid);

  return {
    status,                        // "active" | "paused" | "closed"
    amountDue,                     // sum of missed installments to date
    missedMonths: dueMonths.length,
    remainingBalance,             // effectiveInvoice - initial - validPaid
    lastPayment: getLastPayment(client),
    nextExpectedLabel,
    invoiceBase,
    adjNetToBalance,
    invoiceEffective,
  };
}

/* ---------- helpers ---------- */
function labelFor(d) {
  return `${d.toLocaleString("default", { month: "long" })} ${d.getFullYear()}`;
}

function getLastPayment(client) {
  const arr = Array.isArray(client.payments) ? client.payments : [];
  if (!arr.length) return null;
  const latest = arr.reduce((acc, p) => (new Date(p.date) > new Date(acc.date) ? p : acc));
  return { date: toYMD(new Date(latest.date)), amount: Number(latest.amount || 0) };
}

function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}