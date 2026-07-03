// src/Reports/utils/billingCompute.js
//
// Snapshot math used by A/R Aging.
// This version mirrors the logic in ClientDashboard/BillingOverview:
// - invoiceBase = invoiceTotal
// - adjNetToBalance = sum(balance adjustments - downPayment)
// - invoiceEffective = max(0, invoiceBase + adjNetToBalance)
// - collectibleCap = invoiceEffective - initialPayment
// - Months accrue on the 15th, skipMonths + pause respected, capped by collectibleCap
// - Only payments STRICTLY AFTER initialPaymentDate count as installments
// - Payments are allocated FIFO to past months, then to future months (prepayments)

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

  // ---------- helpers ----------
  const toDate = (raw) =>
    raw?.seconds ? new Date(raw.seconds * 1000) : new Date(raw);
  const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
  const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  const labelFor = (d) =>
    `${d.toLocaleString("default", { month: "long" })} ${d.getFullYear()}`;

  // ---------- base data (match BillingOverview) ----------
  const invoiceBase = Number(client.invoiceTotal || 0);

  const adjustments = Array.isArray(client.invoiceAdjustments)
    ? client.invoiceAdjustments
    : [];

  // Only adjustments that hit the balance; each can have a downPayment that reduces principal
  const adjNetToBalance = adjustments.reduce((sum, a) => {
    const applyTo = (a?.applyTo || "balance").toLowerCase();
    if (applyTo !== "balance") return sum;
    const amt = Number(a?.amount || 0);
    const dp = Number(a?.downPayment || 0);
    return sum + Math.max(0, amt - Math.max(0, dp));
  }, 0);

  const invoiceEffective = Math.max(0, invoiceBase + adjNetToBalance);

  const status = (client.status || "active").toLowerCase();
  const isPaused = status === "paused";
  const isClosed = status === "closed";

  const rawStart = client.firstInstallmentDate;
  const initialPayment = Number(client.initialPaymentAmount || 0);
  const initialPaymentDate = client.initialPaymentDate
    ? new Date(client.initialPaymentDate)
    : null;

  // Cap of what can be collected via installments (effective invoice minus down payment)
  const collectibleCap = Math.max(0, invoiceEffective - initialPayment);

  // If we don't even have a first installment date, fall back to a very simple snapshot
  if (!rawStart || isNaN(toDate(rawStart))) {
    return {
      status,
      amountDue: 0,
      missedMonths: 0,
      remainingBalance: Math.max(
        0,
        invoiceEffective - initialPayment
      ),
      lastPayment: getLastInstallmentPayment(client),
      nextExpectedLabel: null,
      invoiceBase,
      adjNetToBalance,
      invoiceEffective,
    };
  }

  // ---------- scheduling anchors (match BillingOverview) ----------
  const expectedAnchor = client.expectedAnchor
    ? new Date(client.expectedAnchor)
    : null;
  const anchorDate = expectedAnchor || toDate(rawStart || new Date());

  // Due date is always the 15th of the month
  const firstDueDate = new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    15
  );

  const today = new Date(asOfDate);
  const pauseStartedAt = client.pauseStartedAt
    ? toDate(client.pauseStartedAt)
    : null;

  // Skip months: support both skipMonths and skippedMonths for safety
  const skipSet = new Set(
    (client.skipMonths || client.skippedMonths || []).map(String)
  );
  const monthIsSkipped = (d) => skipSet.has(ymKey(d));

  // Sorted schedule
  const schedule = (client.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const getInstallmentAmountForDate = (date) => {
    for (const s of schedule) {
      const sStart = new Date(s.start);
      const sEnd = new Date(s.end);
      if (date >= sStart && date <= sEnd) return Number(s.amount || 0);
    }
    // Note: BillingOverview hard-codes 500 if no schedule match
    return 500;
  };

  // ---------- payments AFTER initial payment date (installments only) ----------
  const allPayments = Array.isArray(client.payments) ? client.payments : [];
  const paymentsAfterInitial = allPayments.filter((p) => {
    if (!initialPaymentDate) return false;
    const d = new Date(p.date);
    return d > initialPaymentDate;
  });

  const paymentPool = paymentsAfterInitial
    .map((p) => ({
      amount: Number(p.amount || 0),
      date: p.date,
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // ---------- build months up to cutoff (capped by collectibleCap) ----------
  const monthsUpToCutoff = [];
  if (!isClosed) {
    const cutoff =
      isPaused && pauseStartedAt
        ? new Date(
            pauseStartedAt.getFullYear(),
            pauseStartedAt.getMonth(),
            pauseStartedAt.getDate() >= 15 ? 15 : 14
          )
        : today;

    const cursor = new Date(firstDueDate);
    let expectedAccum = 0;

    while (cursor <= cutoff) {
      if (!monthIsSkipped(cursor)) {
        const amt = getInstallmentAmountForDate(cursor);

        // Apply the collectibleCap limit just like BillingOverview:
        if (expectedAccum >= collectibleCap) break;
        if (expectedAccum + amt > collectibleCap) break;

        monthsUpToCutoff.push(new Date(cursor));
        expectedAccum += amt;
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // ---------- allocate payments FIFO into past months ----------
  let validTotalPaid = 0;
  const dueMonths = [];

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

  // ---------- handle future prepayments (same spirit as BillingOverview) ----------
  if (!isClosed && !isPaused) {
    let leftover = paymentPool.reduce((s, p) => s + (p.amount || 0), 0);
    if (leftover > 0) {
      const futureCursor = new Date(today);
      futureCursor.setDate(15);
      if (futureCursor <= today) {
        futureCursor.setMonth(futureCursor.getMonth() + 1);
      }

      let guard = 0;
      while (leftover > 0 && guard < 60) {
        if (monthIsSkipped(futureCursor)) {
          futureCursor.setMonth(futureCursor.getMonth() + 1);
          guard++;
          continue;
        }
        const amt = getInstallmentAmountForDate(futureCursor);
        const use = Math.min(amt, leftover);
        validTotalPaid += use;
        leftover -= use;
        futureCursor.setMonth(futureCursor.getMonth() + 1);
        guard++;
      }
    }
  }

  // ---------- compute amountDue & remainingBalance ----------
  const amountDue = isClosed
    ? 0
    : dueMonths.reduce((sum, m) => sum + (m.amount || 0), 0);

  const computedRemaining = Math.max(
    0,
    invoiceEffective - initialPayment - validTotalPaid
  );
  const remainingBalance = isClosed ? 0 : computedRemaining;

  // If fully paid, clear due months
  if (remainingBalance <= 0) {
    dueMonths.length = 0;
  }

  // ---------- simulate to find next unpaid month (for NextExpected) ----------
  const simPool = paymentsAfterInitial
    .map((p) => ({
      amount: Number(p.amount || 0),
      date: p.date,
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

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
  while (
    !isClosed &&
    !isPaused &&
    guardSim < 120 &&
    monthIsFullyPaid(firstUnpaid, simPool)
  ) {
    firstUnpaid.setMonth(firstUnpaid.getMonth() + 1);
    guardSim++;
  }

  const nextExpectedLabel =
    isClosed || isPaused ? null : labelFor(firstUnpaid);

  return {
    status,                         // "active" | "paused" | "closed" (lowercase)
    amountDue,                      // sum of missed installments to date
    missedMonths: dueMonths.length, // count of missed months
    remainingBalance,               // invoiceEffective - initial - validPaid
    lastPayment: getLastInstallmentPayment(client),
    nextExpectedLabel,
    invoiceBase,
    adjNetToBalance,
    invoiceEffective,
  };
}

/* ---------- helpers ---------- */

function getLastInstallmentPayment(client) {
  const initialPaymentDate = client.initialPaymentDate
    ? new Date(client.initialPaymentDate)
    : null;
  const allPayments = Array.isArray(client.payments) ? client.payments : [];

  // Only consider installment payments (strictly after initialPaymentDate)
  const installmentPays = allPayments.filter((p) => {
    if (!initialPaymentDate) return false;
    const d = new Date(p.date);
    return d > initialPaymentDate;
  });

  if (!installmentPays.length) return null;

  const latest = installmentPays.reduce((acc, p) =>
    new Date(p.date) > new Date(acc.date) ? p : acc
  );

  const d = new Date(latest.date);
  return {
    date: toYMD(d),
    amount: Number(latest.amount || 0),
  };
}

function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}