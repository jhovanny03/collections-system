// src/Dashboard/Dashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { Container, Grid, Box } from "@mui/material";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

import SummaryCards from "./SummaryCards.jsx";
import OutstandingVsCollected from "./OutstandingVsCollected.jsx";
import PaymentsLast3Months from "./PaymentsLast3Months.jsx";
import PastDueLast3Months from "./PastDueLast3Months.jsx"; // keep if you use it elsewhere
import PaymentsVsPastDueLast6Months from "./PaymentsVsPastDueLast6Months.jsx"; // keep if you use it elsewhere
import CasesByStatus from "./CasesByStatus.jsx";
// import AmountByCaseType from "./AmountByCaseType.jsx"; // 🔸 removed from use
import LastClientToday from "./LastClientToday.jsx";
import OutstandingVsCollectedMini from "./OutstandingVsCollectedMini.jsx"; // keep if you use it elsewhere
import ExpectedPayments from "./ExpectedPayments.jsx"; // keep if you use it elsewhere
import UpcomingPromisesList from "./UpcomingPromisesList.jsx";

// ===================== Shared helpers / canonical math =====================
const DUE_DAY = 15;

const toDate = (v) =>
  v?.toDate?.() ? v.toDate() : isNaN(new Date(v)) ? null : new Date(v);

const startOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const endOfPrevMonth = () =>
  new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    0,
    23,
    59,
    59,
    999
  );
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

const getInstallmentAmountForDate = (schedule, date) => {
  if (!Array.isArray(schedule) || schedule.length === 0) return 500;
  for (let i = 0; i < schedule.length; i++) {
    const s = schedule[i];
    const sStart = new Date(s.start);
    const sEnd = new Date(s.end);
    if (date >= sStart && date <= sEnd) return Number(s.amount || 500);
  }
  return 500;
};

function computeInvoiceEffective(client) {
  const base = Number(client?.invoiceTotal || 0);
  const adjustments = Array.isArray(client?.invoiceAdjustments)
    ? client.invoiceAdjustments
    : [];
  const adjToBalanceTotal = adjustments.reduce((sum, a) => {
    const applyTo = (a?.applyTo || "balance").toLowerCase();
    const amt = Number(a?.amount || 0);
    const dp = Number(a?.downPayment || 0);
    return applyTo === "balance" ? sum + (amt - dp) : sum;
  }, 0);
  return Math.max(0, base + adjToBalanceTotal);
}

function getCollectibleCap(client) {
  const invoiceEffective = computeInvoiceEffective(client);
  const initialPayment = parseFloat(client?.initialPaymentAmount || 0);
  return Math.max(0, invoiceEffective - initialPayment);
}

/**
 * Canonical snapshot aligned with ClientList/ReportingSummary:
 * - Anchor = firstInstallmentDate
 * - Respects skipMonths
 * - Excludes initial/retainer from FIFO; only payments strictly AFTER initialPaymentDate
 * - Applies collectible CAP (invoiceEffective - initialPayment). No accrual beyond CAP.
 * - Pause rule: paused BEFORE 15th => current month not included; paused ON/AFTER 15th => included
 * - Closed => 0 due
 */
function computeBillingSnapshot(client, now = new Date()) {
  const status = (client?.status || "active").toLowerCase();
  const isClosed = status === "closed";
  const isPaused = status === "paused";
  const collectibleCap = getCollectibleCap(client);

  const planStart = client?.firstInstallmentDate
    ? toDate(client.firstInstallmentDate)
    : null;

  if (!planStart || isNaN(planStart)) {
    const isPaidInFull = collectibleCap <= 0 || isClosed;
    return { amountDue: 0, missedMonths: 0, isPaidInFull };
  }

  const firstDueDate = new Date(
    planStart.getFullYear(),
    planStart.getMonth(),
    DUE_DAY
  );

  // ✅ Pause cutoff logic (same behavior as your ReportingSummary)
  const pauseStartedAt = client?.pauseStartedAt
    ? toDate(client.pauseStartedAt)
    : null;

  const cutoff =
    isPaused && pauseStartedAt
      ? new Date(
          pauseStartedAt.getFullYear(),
          pauseStartedAt.getMonth(),
          pauseStartedAt.getDate() >= DUE_DAY ? DUE_DAY : DUE_DAY - 1
        )
      : now;

  const skipSet = new Set((client?.skipMonths || []).map(String));
  const monthIsSkipped = (d) => skipSet.has(ymKey(d));

  const schedule = (client?.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  // Build months up to CUTOFF but stop when expected sum would exceed CAP
  const months = [];
  const cursor = new Date(firstDueDate);
  let expectedAccum = 0;

  if (!isClosed) {
    while (cursor <= cutoff) {
      if (!monthIsSkipped(cursor)) {
        const amt = getInstallmentAmountForDate(schedule, cursor);
        if (expectedAccum >= collectibleCap) break;
        if (expectedAccum + amt > collectibleCap) break;
        months.push(new Date(cursor));
        expectedAccum += amt;
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // Payments AFTER initial (strict)
  const allPayments = client?.payments || [];
  const initialPaymentDate = client?.initialPaymentDate
    ? toDate(client.initialPaymentDate)
    : null;

  const paymentsAfterInitial = initialPaymentDate
    ? allPayments.filter((p) => toDate(p.date) > initialPaymentDate)
    : allPayments.slice();

  const pool = paymentsAfterInitial
    .map((p) => ({ amount: Number(p.amount || 0), date: toDate(p.date) }))
    .filter((p) => p.amount > 0 && p.date)
    .sort((a, b) => a.date - b.date);

  let validTotalPaid = 0;
  const dueMonths = [];

  for (const monthDate of months) {
    const monthAmt = getInstallmentAmountForDate(schedule, monthDate);
    let monthPaid = 0;

    for (const p of pool) {
      if (p.amount <= 0) continue;
      if (monthPaid >= monthAmt) break;
      const used = Math.min(monthAmt - monthPaid, p.amount);
      monthPaid += used;
      p.amount -= used;
      validTotalPaid += used;
    }

    if (monthPaid < monthAmt) {
      dueMonths.push({ amount: monthAmt });
    }
  }

  // Roll any leftover forward up to CAP (prepayments)
  const leftover = pool.reduce((s, p) => s + (p.amount || 0), 0);
  const capRoom = Math.max(0, collectibleCap - validTotalPaid);
  if (leftover > 0 && capRoom > 0)
    validTotalPaid += Math.min(leftover, capRoom);

  const remainingBalance = Math.max(0, collectibleCap - validTotalPaid);
  const isPaidInFull = remainingBalance <= 0 || isClosed;

  if (isPaidInFull || isClosed) {
    return { amountDue: 0, missedMonths: 0, isPaidInFull: true };
  }

  const amountDue = dueMonths.reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const missedMonths = dueMonths.length;

  return { amountDue, missedMonths, isPaidInFull: false };
}

/* ===== Promise + MTD helpers (aligned; CAP-aware where needed) ===== */

// Promise amount on/after "today"
function promisedAmountForClientAsOf(client, asOf = new Date()) {
  const p = client?.paymentPromise;
  if (!p) return 0;
  const when = toDate(p.date);
  const amt = Number(p.amount || 0);
  if (!when || !amt) return 0;
  const day = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  return when >= day ? amt : 0;
}

// Promise expected within given month
function expectedPaymentsInMonth(client, monthDate = new Date()) {
  const p = client?.paymentPromise;
  if (!p) return 0;
  const when = toDate(p.date);
  const amt = Number(p.amount || 0);
  if (!when || !amt) return 0;
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  return when >= start && when <= end ? amt : 0;
}

/**
 * Expected vs Collected (MTD) — CAP-aware.
 * ✅ OPTION #1 CHANGE:
 * - If status === "paused", expected/collected for the current month = 0 (always).
 * - Resume behavior is handled by ClientActions.js by writing skipMonths.
 */
function getClientExpectedCollectedThisMonth(client, monthDate = new Date()) {
  const status = (client?.status || "").toLowerCase();
  if (status === "closed") return { expected: 0, collected: 0 };

  // ✅ Option #1: paused clients do not contribute to expected/collected
  if (status === "paused") return { expected: 0, collected: 0 };

  const planStart = client?.firstInstallmentDate
    ? toDate(client.firstInstallmentDate)
    : null;
  if (!planStart) return { expected: 0, collected: 0 };

  const collectibleCap = getCollectibleCap(client);

  const monthEnd = endOfMonth(monthDate);
  const curKey = ymKey(monthDate);
  const skipSet = new Set((client?.skipMonths || []).map(String));

  // Billable this month?
  const billableThisMonth = !skipSet.has(curKey);
  if (!billableThisMonth) return { expected: 0, collected: 0 };

  const schedule = (client.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  // Build months up to monthEnd with strict CAP gate
  const months = [];
  let expectedAccum = 0;
  let cursor = new Date(
    planStart.getFullYear(),
    planStart.getMonth(),
    DUE_DAY
  );

  while (cursor <= monthEnd) {
    const key = ymKey(cursor);
    const amt = skipSet.has(key)
      ? 0
      : getInstallmentAmountForDate(schedule, cursor);

    if (expectedAccum >= collectibleCap) break;
    if (expectedAccum + amt > collectibleCap) break;

    expectedAccum += amt;

    months.push({
      dueDate: new Date(cursor.getFullYear(), cursor.getMonth(), DUE_DAY),
      expected: amt,
      collected: 0,
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  if (!months.length) return { expected: 0, collected: 0 };

  const currentDueKey = ymKey(
    new Date(monthDate.getFullYear(), monthDate.getMonth(), DUE_DAY)
  );
  const idx = months.findIndex((m) => ymKey(m.dueDate) === currentDueKey);
  if (idx === -1) return { expected: 0, collected: 0 };

  // FIFO payments up to month end, excluding initial
  const initialCutoff = client?.initialPaymentDate
    ? toDate(client.initialPaymentDate)
    : null;
  const isInitialFlag = (p) => {
    const t = (p?.type || p?.category || "")
      .toString()
      .toLowerCase();
    return (
      p?.isInitial === true ||
      t === "initial" ||
      t === "retainer" ||
      t === "setup"
    );
  };

  const pays = (client?.payments || [])
    .map((p) => ({
      amount: Number(p?.amount || 0),
      date: toDate(p?.date),
      raw: p,
    }))
    .filter(
      (p) =>
        p.amount > 0 &&
        p.date &&
        p.date <= monthEnd &&
        !isInitialFlag(p.raw) &&
        (initialCutoff ? p.date > initialCutoff : true)
    )
    .sort((a, b) => a.date - b.date);

  for (const pay of pays) {
    let remain = pay.amount;
    for (let i = 0; i < months.length && remain > 0; i++) {
      const need = Math.max(
        0,
        (months[i].expected || 0) - (months[i].collected || 0)
      );
      if (need <= 0) continue;
      const used = Math.min(need, remain);
      months[i].collected += used;
      remain -= used;
    }
  }

  const current = months[idx];
  const expected = Number(current.expected || 0);
  const collected = Math.min(expected, Number(current.collected || 0));

  return { expected, collected };
}

/**
 * ✅✅ YTD outstanding (UPDATED FOR CONSISTENCY)
 * - Uses same arrears-month cutoff logic (15th rule) for which months count
 * - BUT applies payments up to `asOf` (today), not just up to the cutoff window
 * - Also respects pause cutoff (so we don't accrue beyond pause start)
 */
function ytdOutstandingForClient(client, asOf = new Date()) {
  const yearStart = new Date(asOf.getFullYear(), 0, 1);
  const collectibleCap = getCollectibleCap(client);

  const planStart = client?.firstInstallmentDate
    ? toDate(client.firstInstallmentDate)
    : null;
  if (!planStart) return 0;

  const status = (client?.status || "active").toLowerCase();
  const isPaused = status === "paused";
  const pauseStartedAt = client?.pauseStartedAt
    ? toDate(client.pauseStartedAt)
    : null;

  // ✅ Use the same pause cutoff concept as computeBillingSnapshot
  const effectiveAsOf =
    isPaused && pauseStartedAt
      ? new Date(
          pauseStartedAt.getFullYear(),
          pauseStartedAt.getMonth(),
          pauseStartedAt.getDate() >= DUE_DAY ? DUE_DAY : DUE_DAY - 1
        )
      : asOf;

  const schedule = (client.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const skipSet = new Set((client?.skipMonths || []).map(String));
  const monthIsSkipped = (d) => skipSet.has(ymKey(d));

  const arrearsMonth =
    effectiveAsOf.getDate() >= DUE_DAY
      ? new Date(effectiveAsOf.getFullYear(), effectiveAsOf.getMonth(), 1)
      : new Date(effectiveAsOf.getFullYear(), effectiveAsOf.getMonth() - 1, 1);

  const firstDue = new Date(
    planStart.getFullYear(),
    planStart.getMonth(),
    DUE_DAY
  );
  const cutoff = new Date(
    arrearsMonth.getFullYear(),
    arrearsMonth.getMonth(),
    DUE_DAY
  );

  // Build expected months up to cutoff (15th rule), CAP-gated
  const months = [];
  let cursor = new Date(firstDue);
  let expectedAccum = 0;

  while (cursor <= cutoff) {
    if (!monthIsSkipped(cursor)) {
      const amt = getInstallmentAmountForDate(schedule, cursor);

      if (expectedAccum >= collectibleCap) break;
      if (expectedAccum + amt > collectibleCap) break;

      months.push({
        monthDate: new Date(cursor.getFullYear(), cursor.getMonth(), 1),
        expected: amt,
        collected: 0,
      });

      expectedAccum += amt;
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  if (!months.length) return 0;

  // ✅ IMPORTANT CONSISTENCY FIX:
  // Apply payments up to effectiveAsOf (NOT just up to cutoff/month logic)
  const initialCutoff = client?.initialPaymentDate
    ? toDate(client.initialPaymentDate)
    : null;

  const pays = (client?.payments || [])
    .map((p) => ({
      amount: Number(p?.amount || 0),
      date: toDate(p?.date),
    }))
    .filter(
      (p) =>
        p.amount > 0 &&
        p.date &&
        p.date <= effectiveAsOf &&
        (initialCutoff ? p.date > initialCutoff : true)
    )
    .sort((a, b) => a.date - b.date);

  for (const pay of pays) {
    let remain = pay.amount;
    for (let i = 0; i < months.length && remain > 0; i++) {
      const need = Math.max(0, months[i].expected - months[i].collected);
      if (need <= 0) continue;
      const used = Math.min(remain, need);
      months[i].collected += used;
      remain -= used;
    }
  }

  // Sum only months within the current year up to arrearsMonth
  let ytd = 0;
  for (const m of months) {
    if (m.monthDate >= yearStart && m.monthDate <= arrearsMonth) {
      ytd += Math.max(0, (m.expected || 0) - (m.collected || 0));
    }
  }

  return ytd;
}

const pctChange = (curr, prev) => {
  const p = Number(prev || 0);
  if (!p) return curr ? 100 : 0;
  return ((Number(curr) - p) / p) * 100;
};

// ===================== Dashboard Component =====================
export default function Dashboard() {
  const [clients, setClients] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const snapshot = await getDocs(collection(db, "clients"));
        setClients(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      } catch (e) {
        console.error("🔥 Error loading clients:", e);
      }
    })();
  }, []);

  const metrics = useMemo(() => {
    const today = new Date();
    const prev = endOfPrevMonth();

    const acc = clients.reduce(
      (a, c) => {
        const status = (c?.status || "").toLowerCase();
        const isClosed = status === "closed";
        if (isClosed) return a;

        // Snapshots (cap-aware + pause cutoff)
        const snapNow = computeBillingSnapshot(c, today);
        const snapPrev = computeBillingSnapshot(c, prev);

        a.totalOwed += snapNow.amountDue;
        a.prev_totalOwed += snapPrev.amountDue;

        if (snapNow.amountDue > 0) a.pastDueClients += 1;
        if (snapPrev.amountDue > 0) a.prev_pastDueClients += 1;

        if (snapNow.isPaidInFull) a.paidInFullCount += 1;
        if (snapPrev.isPaidInFull) a.prev_paidInFullCount += 1;

        // Promises
        a.promisedPayments += promisedAmountForClientAsOf(c, today);
        a.prev_promisedPayments += promisedAmountForClientAsOf(c, prev);

        const { expected, collected } = getClientExpectedCollectedThisMonth(
          c,
          today
        );
        a.mtdExpected += expected;
        a.mtdCollected += collected;

        const wasCurrentThroughLastMonth =
          computeBillingSnapshot(
            c,
            new Date(today.getFullYear(), today.getMonth(), DUE_DAY - 1)
          ).amountDue === 0;

        if (wasCurrentThroughLastMonth) {
          a.mtdExpectedCurrent += expected;
          a.mtdCollectedCurrent += collected;
        }

        const prevEC = getClientExpectedCollectedThisMonth(c, prev);
        a.prev_mtdExpected += prevEC.expected;
        a.prev_mtdCollected += prevEC.collected;

        const ytd = ytdOutstandingForClient(c, today);
        a.ytdOutstanding += ytd;
        a.prev_ytdOutstanding += ytd;

        if (snapNow.amountDue > 2000) a.highBalanceCount += 1;

        return a;
      },
      {
        totalOwed: 0,
        pastDueClients: 0,
        paidInFullCount: 0,
        promisedPayments: 0,

        // MTD totals
        mtdExpected: 0,
        mtdCollected: 0,

        // current-only split
        mtdExpectedCurrent: 0,
        mtdCollectedCurrent: 0,

        // prev month comparators
        prev_totalOwed: 0,
        prev_pastDueClients: 0,
        prev_paidInFullCount: 0,
        prev_promisedPayments: 0,
        prev_mtdExpected: 0,
        prev_mtdCollected: 0,

        // YTD
        ytdOutstanding: 0,
        prev_ytdOutstanding: 0,

        // other
        highBalanceCount: 0,
      }
    );

    const totalClients = clients.filter(
      (c) => (c?.status || "").toLowerCase() !== "closed"
    ).length;

    const pastDuePercent =
      totalClients > 0
        ? Math.round((acc.pastDueClients / totalClients) * 100)
        : 0;

    const paidInFullPercent =
      totalClients > 0
        ? Math.round((acc.paidInFullCount / totalClients) * 100)
        : 0;

    const mtdAR = Math.max(0, acc.mtdExpected - acc.mtdCollected);
    const prev_mtdAR = Math.max(0, acc.prev_mtdExpected - acc.prev_mtdCollected);
    const mtdARCurrent = Math.max(
      0,
      acc.mtdExpectedCurrent - acc.mtdCollectedCurrent
    );

    const round = (n) => Math.round(n);

    return {
      summaryData: {
        totalOwed: round(acc.totalOwed),
        totalClients,
        pastDueClients: acc.pastDueClients,
        promisedPayments: round(acc.promisedPayments),

        expectedPaymentsThisMonth: round(acc.mtdExpected),
        mtdAccountsReceivable: round(mtdAR),

        expectedPaymentsThisMonthCurrentOnly: round(acc.mtdExpectedCurrent),
        mtdAccountsReceivableCurrentOnly: round(mtdARCurrent),

        ytdOutstandingBalance: round(acc.ytdOutstanding),

        paidInFullCount: acc.paidInFullCount,
        paidInFullPercent,

        highBalanceCount: acc.highBalanceCount,
      },
      diffs: {
        totalClients: { value: 0, direction: "up", label: "—" },
        pastDueClients: {
          value: pctChange(acc.pastDueClients, acc.prev_pastDueClients),
          direction:
            acc.pastDueClients >= acc.prev_pastDueClients ? "up" : "down",
          label: "Since last month",
        },
        paidInFull: {
          value: pctChange(acc.paidInFullCount, acc.prev_paidInFullCount),
          direction:
            acc.paidInFullCount >= acc.prev_paidInFullCount ? "up" : "down",
          label: "Since last month",
        },
        totalOwed: {
          value: pctChange(acc.totalOwed, acc.prev_totalOwed),
          direction: acc.totalOwed >= acc.prev_totalOwed ? "up" : "down",
          label: "Since last month",
        },
        promisedPayments: {
          value: pctChange(acc.promisedPayments, acc.prev_promisedPayments),
          direction:
            acc.promisedPayments >= acc.prev_promisedPayments ? "up" : "down",
          label: "Since last month",
        },
        expectedPaymentsThisMonth: {
          value: pctChange(acc.mtdExpected, acc.prev_mtdExpected),
          direction: acc.mtdExpected >= acc.prev_mtdExpected ? "up" : "down",
          label: "Since last month",
        },
        mtdAccountsReceivable: {
          value: pctChange(mtdAR, prev_mtdAR),
          direction: mtdAR >= prev_mtdAR ? "up" : "down",
          label: "Since last month",
        },
        ytdOutstandingBalance: {
          value: pctChange(acc.ytdOutstanding, acc.prev_ytdOutstanding),
          direction:
            acc.ytdOutstanding >= acc.prev_ytdOutstanding ? "up" : "down",
          label: "Since last month",
        },
      },
    };
  }, [clients]);

  return (
    <Container maxWidth={false} sx={{ px: { xs: 2, md: 3 }, py: 3 }}>
      {/* Summary row */}
      <Box sx={{ mb: 2 }}>
        <SummaryCards
          data={metrics.summaryData}
          diffs={metrics.diffs}
          omitKeys={[]}
          extraEndSlot={null}
        />
      </Box>

      {/* Main layout */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "3fr 1fr" },
          columnGap: 2,
          rowGap: 2,
        }}
      >
        {/* LEFT */}
        <Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 2,
              mt: 0,
            }}
          >
            <OutstandingVsCollected height={320} />
            <UpcomingPromisesList clients={clients} />
          </Box>

          <Box sx={{ mt: 2 }}>
            <PaymentsLast3Months height={320} />
          </Box>

          {/* Optional extra */}
          {/* <Box sx={{ mt: 2 }}>
            <PastDueLast3Months height={320} />
          </Box> */}
        </Box>

        {/* RIGHT */}
        <Box>
          <CasesByStatus height={340} />
          <Box sx={{ mt: 2 }}>
            <LastClientToday clients={clients} />
          </Box>
        </Box>
      </Box>
    </Container>
  );
}