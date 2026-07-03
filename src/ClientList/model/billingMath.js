// src/ClientList/model/billingMath.js

/** ====== Shared billing helpers (no React) ====== */
export const toDate = (raw) =>
  raw?.seconds ? new Date(raw.seconds * 1000) : new Date(raw);

export const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);

export const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

export const labelFor = (d) =>
  `${d.toLocaleString("default", { month: "long" })} ${d.getFullYear()}`;

/** Variable installment by month (falls back to 500) */
export const getInstallmentAmountForDate = (schedule, date) => {
  if (!Array.isArray(schedule) || schedule.length === 0) return 500;
  for (let i = 0; i < schedule.length; i++) {
    const s = schedule[i];
    const sStart = new Date(s.start);
    const sEnd = new Date(s.end);
    if (date >= sStart && date <= sEnd) return Number(s.amount || 500);
  }
  return 500;
};

/**
 * Derive per-client list fields (past-due + paid-in-full).
 * NOTE: logic copied 1:1 from ClientList.js (no changes),
 * except pause cutoff now follows:
 * - paused before 15 => exclude current month
 * - paused on/after 15 => include current month
 */
export const deriveClient = (client) => {
  const status = (client?.status || "active").toLowerCase();
  const isClosed = status === "closed";
  const isPaused = status === "paused";

  // ----- invoice & payments base -----
  const invoiceBase = Number(client?.invoiceTotal || 0);
  const adjustments = Array.isArray(client?.invoiceAdjustments)
    ? client.invoiceAdjustments
    : [];
  const adjToBalanceTotal = adjustments.reduce((sum, a) => {
    const applyTo = (a?.applyTo || "balance").toLowerCase();
    const amt = Number(a?.amount || 0);
    const dp = Number(a?.downPayment || 0);
    return applyTo === "balance" ? sum + (amt - dp) : sum;
  }, 0);
  const invoiceEffective = Math.max(0, invoiceBase + adjToBalanceTotal);

  const initialPayment = parseFloat(client?.initialPaymentAmount || 0);
  const collectibleCap = Math.max(0, invoiceEffective - initialPayment);

  const rawStart = client.firstInstallmentDate;
  if (!rawStart) {
    const remainingBalance = Math.max(0, invoiceEffective - initialPayment);
    const isPaidInFull = remainingBalance <= 0;
    return {
      ...client,
      computedAmountDue: 0,
      computedMissedMonths: 0,
      computedPastDueLabel: "Current",
      isCurrent: true,
      computedRemainingBalance: remainingBalance,
      computedIsPaidInFull: isPaidInFull,
      _isClosed: isClosed,
    };
  }

  const planStart = toDate(rawStart);
  if (!planStart || isNaN(planStart)) {
    const remainingBalance = Math.max(0, invoiceEffective - initialPayment);
    const isPaidInFull = remainingBalance <= 0;
    return {
      ...client,
      computedAmountDue: 0,
      computedMissedMonths: 0,
      computedPastDueLabel: "Current",
      isCurrent: true,
      computedRemainingBalance: remainingBalance,
      computedIsPaidInFull: isPaidInFull,
      _isClosed: isClosed,
    };
  }

  // First billable month = the 15th of the start month
  const firstDueDate = new Date(planStart.getFullYear(), planStart.getMonth(), 15);

  const allPayments = client?.payments || [];
  const initialPaymentDate = client?.initialPaymentDate
    ? new Date(client.initialPaymentDate)
    : null;

  // Exclude initial: only AFTER the initialPaymentDate (strictly later)
  const paymentsAfterInitial = initialPaymentDate
    ? allPayments.filter((p) => new Date(p.date) > initialPaymentDate)
    : allPayments.slice();

  const paymentPool = paymentsAfterInitial.map((p) => ({
    amount: Number(p.amount || 0),
    date: p.date,
  }));

  // Skipped months set
  const skipSet = new Set((client.skipMonths || []).map(String));
  const monthIsSkipped = (d) => skipSet.has(ymKey(d));

  // Installment schedule (sorted)
  const schedule = (client.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  // Build months through cutoff,
  // cap by invoice total
  const today = new Date();
  const monthsUpToCutoff = [];
  {
    // ✅ UPDATED cutoff logic (15th rule) — everything else unchanged
    let cutoff = today;

    if (isPaused && client?.pauseStartedAt) {
      const pauseStartedAt = toDate(client.pauseStartedAt);
      if (pauseStartedAt && !isNaN(pauseStartedAt)) {
        // If paused before the 15th => exclude current month (cutoff = 14th)
        // If paused on/after the 15th => include current month (cutoff = 15th)
        cutoff = new Date(
          pauseStartedAt.getFullYear(),
          pauseStartedAt.getMonth(),
          pauseStartedAt.getDate() >= 15 ? 15 : 14
        );
      }
    }

    const cursor = new Date(firstDueDate);
    let expectedAccum = 0;
    while (cursor <= cutoff) {
      if (!monthIsSkipped(cursor)) {
        const amt = getInstallmentAmountForDate(schedule, cursor);
        if (expectedAccum >= collectibleCap) break;
        if (expectedAccum + amt > collectibleCap) break;
        monthsUpToCutoff.push(new Date(cursor));
        expectedAccum += amt;
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // Allocate FIFO across months, count valid installment dollars
  const dueMonths = []; // { label, amount }
  let validTotalPaid = 0;
  for (const monthDate of monthsUpToCutoff) {
    const amountDue = getInstallmentAmountForDate(schedule, monthDate);
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

  // Roll remaining prepayments forward up to the cap
  const leftover = paymentPool.reduce((s, p) => s + (p.amount || 0), 0);
  const capRoom = Math.max(0, collectibleCap - validTotalPaid);
  if (leftover > 0 && capRoom > 0) validTotalPaid += Math.min(leftover, capRoom);

  // Compute remaining vs cap; closed shows 0 remaining balance in UI,
  // but we keep missed months/labels from computation
  const computedRemaining = Math.max(0, invoiceEffective - initialPayment - validTotalPaid);
  const remainingBalance = isClosed ? 0 : computedRemaining;

  if (remainingBalance <= 0) {
    dueMonths.length = 0;
  }

  const computedAmountDue = isClosed
    ? 0
    : dueMonths.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

  const computedMissedMonths = dueMonths.length;

  let computedPastDueLabel = "Current";
  if (computedMissedMonths > 0) {
    computedPastDueLabel =
      computedMissedMonths === 1
        ? dueMonths[0].label
        : `${dueMonths[0].label} – ${dueMonths[computedMissedMonths - 1].label}`;
  }

  const isPaidInFull = remainingBalance <= 0;

  return {
    ...client,
    computedAmountDue,
    computedMissedMonths,
    computedPastDueLabel,
    isCurrent: computedMissedMonths === 0,
    computedRemainingBalance: remainingBalance,
    computedIsPaidInFull: isPaidInFull,
    _isClosed: isClosed, // helper for rendering
  };
};