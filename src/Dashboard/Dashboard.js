// src/Dashboard/Dashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { Container, Grid, Box } from "@mui/material";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

import SummaryCards from "./SummaryCards.jsx";
import OutstandingVsCollected from "./OutstandingVsCollected.jsx";
import PaymentsLast3Months from "./PaymentsLast3Months.jsx";
import PastDueLast3Months from "./PastDueLast3Months.jsx";
import PaymentsVsPastDueLast6Months from "./PaymentsVsPastDueLast6Months.jsx";
// import PaymentsOverTime from "./PaymentsOverTime.jsx";
import CasesByStatus from "./CasesByStatus.jsx";
import AmountByCaseType from "./AmountByCaseType.jsx";
import LastClientToday from "./LastClientToday.jsx";
import OutstandingVsCollectedMini from "./OutstandingVsCollectedMini.jsx";
import ExpectedPayments from "./ExpectedPayments.jsx";
import UpcomingPromisesList from "./UpcomingPromisesList.jsx"; // ✅ restore import

// ===================== Shared helpers / canonical math =====================
const DUE_DAY = 15;

const toDate = (v) =>
  v?.toDate?.() ? v.toDate() : isNaN(new Date(v)) ? null : new Date(v);

const clamp0 = (n) => (n > 0 ? n : 0);
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const endOfPrevMonth = () =>
  new Date(new Date().getFullYear(), new Date().getMonth(), 0, 23, 59, 59, 999);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1, 0, 0, 0, 0);
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const ymIndex = (d) => d.getFullYear() * 12 + d.getMonth();

const monthLabel = (d) =>
  `${d.toLocaleString("default", { month: "long" })} ${d.getFullYear()}`;

/** Variable monthly amount via schedule ranges; falls back to installmentAmount or 500 */
function getMonthlyForMonth(client, monthDate) {
  const schedule = Array.isArray(client?.installmentSchedule)
    ? client.installmentSchedule
    : [];

  const mStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mEnd = endOfMonth(monthDate);

  for (const item of schedule) {
    const s = toDate(item?.start);
    const e = toDate(item?.end);
    const amt = Number(item?.amount || 0);
    if (!s || !e || !amt) continue;
    const overlaps = !(e < mStart || s > mEnd);
    if (overlaps) return amt;
  }

  const fallback = Number(client?.installmentAmount || 0) || 500;
  return fallback > 0 ? fallback : 0;
}

/**
 * Canonical month stream builder from the "anchor"
 * Anchor = expectedAnchor (if set by resume) otherwise firstInstallmentDate
 * Stops at a given cutoffDate (inclusive month check by day)
 * Respects skipMonths
 * Respects pause: if paused, cutoff = day before 15th of pause month if pause day < 15, or the pause month is included if pause day >= 15
 */
function buildPastMonthsUpToCutoff(client, asOf = new Date()) {
  const skipSet = new Set((client?.skipMonths || []).map(String)); // e.g., "2025-08"

  const rawStart =
    client?.expectedAnchor ? toDate(client.expectedAnchor) : toDate(client?.firstInstallmentDate);

  if (!rawStart) return [];

  const firstDue = new Date(rawStart.getFullYear(), rawStart.getMonth(), DUE_DAY);

  // Determine cutoff with pause logic (Option 1)
  const pauseDate = client?.pauseStartedAt ? toDate(client.pauseStartedAt) : null;
  let cutoff = new Date(asOf);
  if (client?.status === "paused" && pauseDate) {
    const pauseDay = pauseDate.getDate();
    // If paused before 15 → do NOT include the pause month
    cutoff =
      pauseDay < DUE_DAY
        ? new Date(pauseDate.getFullYear(), pauseDate.getMonth(), DUE_DAY - 1) // day before the 15th of pause month
        : new Date(pauseDate); // include pause month (>= 15)
  }

  // Walk months from firstDue to cutoff (inclusive if cutoff date >= 15, else we stop at previous month)
  const months = [];
  const lastMonthIndex =
    cutoff.getDate() >= DUE_DAY
      ? ymIndex(new Date(cutoff.getFullYear(), cutoff.getMonth(), 1))
      : ymIndex(new Date(cutoff.getFullYear(), cutoff.getMonth() - 1, 1));

  for (
    let cur = new Date(firstDue.getFullYear(), firstDue.getMonth(), DUE_DAY);
    ymIndex(cur) <= lastMonthIndex;
    cur = addMonths(cur, 1)
  ) {
    // Respect skips
    if (skipSet.has(ymKey(cur))) continue;

    months.push({
      monthDate: new Date(cur.getFullYear(), cur.getMonth(), 1),
      expected: getMonthlyForMonth(client, cur),
      collected: 0,
    });
  }

  return months;
}

/** Apply FIFO payments AFTER initialPaymentDate to a months array (past months only). */
function applyPaymentsFIFOToMonths(client, months, asOf = new Date()) {
  if (!months.length) return months;

  // initial-payment cutoff
  const initialCutoff = client?.initialPaymentDate ? toDate(client.initialPaymentDate) : null;

  const firstStart = new Date(months[0].monthDate.getFullYear(), months[0].monthDate.getMonth(), 1);
  const lastEnd = endOfMonth(asOf);

  // Filter & order payments (exclude initial/retainer)
  const isInitialFlag = (p) => {
    const t = (p?.type || p?.category || "").toString().toLowerCase();
    return p?.isInitial === true || t === "initial" || t === "retainer" || t === "setup";
  };

  const pays = (client?.payments || [])
    .map((p) => ({ amount: Number(p?.amount || 0), date: toDate(p?.date), raw: p }))
    .filter(
      (p) =>
        p.amount > 0 &&
        p.date &&
        p.date >= firstStart &&
        p.date <= lastEnd &&
        !isInitialFlag(p.raw) &&
        (initialCutoff ? p.date > initialCutoff : true)
    )
    .sort((a, b) => a.date - b.date);

  for (const pay of pays) {
    let remain = pay.amount;
    for (let i = 0; i < months.length && remain > 0; i++) {
      const need = Math.max(0, (months[i].expected || 0) - (months[i].collected || 0));
      if (need <= 0) continue;
      const applied = Math.min(need, remain);
      months[i].collected += applied;
      remain -= applied;
    }
  }
  return months;
}

/** Canonical: compute amount due as of a date (15th rule + pause + skip + schedule + FIFO after initial). */
function amountDueAsOf(client, asOf = new Date()) {
  const months = buildPastMonthsUpToCutoff(client, asOf);
  if (!months.length) return 0;

  const withPayments = applyPaymentsFIFOToMonths(client, months, asOf);

  let due = 0;
  for (const m of withPayments) {
    due += Math.max(0, (m.expected || 0) - (m.collected || 0));
  }
  return due;
}

/** "Current through last month" = no unpaid balance as of day-before-15th of this month. */
function isCurrentThroughLastMonth(client, asOf = new Date()) {
  const cutoff = new Date(asOf.getFullYear(), asOf.getMonth(), DUE_DAY - 1);
  return amountDueAsOf(client, cutoff) === 0;
}

/** Promises */
function promisedAmountForClientAsOf(client, asOf = new Date()) {
  const pp = client?.paymentPromise;
  if (!pp) return 0;
  const when = toDate(pp.date);
  const amt = Number(pp.amount || 0);
  if (!when || !amt) return 0;

  const day = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  return when >= day ? amt : 0;
}

function expectedPaymentsInMonth(client, monthDate = new Date()) {
  // Promise object is the only “expected” in these cards
  const pp = client?.paymentPromise;
  if (!pp) return 0;
  const when = toDate(pp.date);
  const amt = Number(pp.amount || 0);
  if (!when || !amt) return 0;
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  return when >= start && when <= end ? amt : 0;
}

/**
 * Expected vs Collected (MTD) — **FIFO across all months up to this month**.
 * This ensures payments dated this month first cover older unpaid months,
 * and only the portion that reaches the current month is counted as “collected”.
 */
function getClientExpectedCollectedThisMonth(client, monthDate = new Date()) {
  // Closed cases do not contribute
  if ((client?.status || "").toLowerCase() === "closed") {
    return { expected: 0, collected: 0 };
  }

  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const curKey = ymKey(monthDate);
  const skipSet = new Set((client?.skipMonths || []).map(String));

  // Is the current month billable? (skip + mid-month pause rule)
  let billableThisMonth = true;
  if (skipSet.has(curKey)) billableThisMonth = false;

  const paused = client?.status === "paused";
  const pauseDate = client?.pauseStartedAt ? toDate(client.pauseStartedAt) : null;
  if (paused && pauseDate) {
    const sameMonth =
      pauseDate.getFullYear() === monthDate.getFullYear() &&
      pauseDate.getMonth() === monthDate.getMonth();
    if (sameMonth && pauseDate.getDate() < DUE_DAY) {
      billableThisMonth = false; // paused before 15th → don’t bill current month
    }
  }

  // Build timeline from original plan start up to current month
  const planStart = client?.firstInstallmentDate ? toDate(client.firstInstallmentDate) : null;
  if (!planStart) return { expected: 0, collected: 0 };

  const firstMonth = new Date(planStart.getFullYear(), planStart.getMonth(), 1);
  const months = [];
  const cursor = new Date(firstMonth);

  while (cursor <= monthStart) {
    const key = ymKey(cursor);
    const isCurrent =
      cursor.getFullYear() === monthStart.getFullYear() &&
      cursor.getMonth() === monthStart.getMonth();

    const expected =
      skipSet.has(key)
        ? 0
        : (isCurrent
            ? (billableThisMonth ? getMonthlyForMonth(client, cursor) : 0)
            : getMonthlyForMonth(client, cursor));

    months.push({
      monthDate: new Date(cursor),
      expected,
      collected: 0,
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  if (!months.length) return { expected: 0, collected: 0 };

  // Gather payments up to end of this month, excluding initial/retainer and any on/before initialPaymentDate
  const initialCutoff = client?.initialPaymentDate ? toDate(client.initialPaymentDate) : null;
  const isInitialFlag = (p) => {
    const t = (p?.type || p?.category || "").toString().toLowerCase();
    return p?.isInitial === true || t === "initial" || t === "retainer" || t === "setup";
  };

  const pays = (client?.payments || [])
    .map((p) => ({ amount: Number(p?.amount || 0), date: toDate(p?.date), raw: p }))
    .filter(
      (p) =>
        p.amount > 0 &&
        p.date &&
        p.date <= monthEnd &&
        !isInitialFlag(p.raw) &&
        (initialCutoff ? p.date > initialCutoff : true)
    )
    .sort((a, b) => a.date - b.date); // FIFO

  // Apply FIFO across all months up to current
  for (const pay of pays) {
    let remain = pay.amount;
    for (let i = 0; i < months.length && remain > 0; i++) {
      const need = Math.max(0, (months[i].expected || 0) - (months[i].collected || 0));
      if (need <= 0) continue;
      const used = Math.min(need, remain);
      months[i].collected += used;
      remain -= used;
    }
  }

  const last = months[months.length - 1] || { expected: 0, collected: 0 };
  const expected = Number(last.expected || 0);
  const collected = Math.min(expected, Number(last.collected || 0)); // cap

  return { expected, collected };
}

/** ✅ Correct, non-duplicative YTD outstanding (per-month residuals in current year). */
function ytdOutstandingForClient(client, asOf = new Date()) {
  const yearStart = new Date(asOf.getFullYear(), 0, 1);

  // "Last overdue month" (month we consider fully in arrears per 15th rule)
  const arrearsMonth =
    asOf.getDate() >= DUE_DAY
      ? new Date(asOf.getFullYear(), asOf.getMonth(), 1)
      : new Date(asOf.getFullYear(), asOf.getMonth() - 1, 1);

  // Build months up to the 15th of the arrears month, respecting pause/skip/schedule
  const cutoff = new Date(arrearsMonth.getFullYear(), arrearsMonth.getMonth(), DUE_DAY);
  const months = buildPastMonthsUpToCutoff(client, cutoff);
  if (!months.length) return 0;

  // Apply payments FIFO once through the cutoff
  const withPayments = applyPaymentsFIFOToMonths(client, months, cutoff);

  // Sum only the months within the current year
  let ytd = 0;
  for (const m of withPayments) {
    const mMonth = new Date(m.monthDate.getFullYear(), m.monthDate.getMonth(), 1);
    if (mMonth >= yearStart && mMonth <= arrearsMonth) {
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
        // 🚫 Ignore closed cases entirely in dashboard totals
        if ((c?.status || "").toLowerCase() === "closed") return a;

        // Totals using the canonical function that respects pause/skip/schedule/initial FIFO
        const dueToday = amountDueAsOf(c, today);
        const duePrev = amountDueAsOf(c, prev);

        a.totalOwed += dueToday;
        a.prev_totalOwed += duePrev;

        if (dueToday > 0) a.pastDueClients += 1;
        if (duePrev > 0) a.prev_pastDueClients += 1;

        // “Active arrangements” here = has a start + some monthly amount configured
        if (toDate(c?.firstInstallmentDate) && (getMonthlyForMonth(c, today) > 0)) {
          a.activeArrangements += 1;
          a.prev_activeArrangements += 1;
        }

        a.promisedPayments += promisedAmountForClientAsOf(c, today);
        a.prev_promisedPayments += promisedAmountForClientAsOf(c, prev);

        // Promise expected this month
        a.expectedThisMonth += expectedPaymentsInMonth(c, today);
        a.prev_expectedThisMonth += expectedPaymentsInMonth(c, prev);

        // Expected vs collected (MTD) with skip/pause applied
        const { expected, collected } = getClientExpectedCollectedThisMonth(c, today);
        a.mtdExpected += expected;
        a.mtdCollected += collected;

        // Current-only split (clients current through last month)
        if (isCurrentThroughLastMonth(c, today)) {
          a.mtdExpectedCurrent += expected;
          a.mtdCollectedCurrent += collected;
        }

        // Previous month snapshot for diffs
        const { expected: prevExp, collected: prevCol } =
          getClientExpectedCollectedThisMonth(c, prev);
        a.prev_mtdExpected += prevExp;
        a.prev_mtdCollected += prevCol;

        // ✅ Correct YTD (no double-counting)
        const ytd = ytdOutstandingForClient(c, today);
        a.ytdOutstanding += ytd;
        a.prev_ytdOutstanding += ytd; // same base for your diff label

        return a;
      },
      {
        totalOwed: 0,
        pastDueClients: 0,
        activeArrangements: 0,
        promisedPayments: 0,
        expectedThisMonth: 0,

        mtdExpected: 0,
        mtdCollected: 0,

        // current-only accumulators
        mtdExpectedCurrent: 0,
        mtdCollectedCurrent: 0,

        prev_totalOwed: 0,
        prev_pastDueClients: 0,
        prev_activeArrangements: 0,
        prev_promisedPayments: 0,
        prev_expectedThisMonth: 0,
        prev_mtdExpected: 0,
        prev_mtdCollected: 0,

        ytdOutstanding: 0,
        prev_ytdOutstanding: 0,
      }
    );

    const totalClients = clients.filter(
      (c) => (c?.status || "").toLowerCase() !== "closed"
    ).length;
    const roundMoney = (n) => Math.round(n);

    const mtdAR = Math.max(0, acc.mtdExpected - acc.mtdCollected);
    const prev_mtdAR = Math.max(0, acc.prev_mtdExpected - acc.prev_mtdCollected);

    // current-only AR
    const mtdARCurrent = Math.max(0, acc.mtdExpectedCurrent - acc.mtdCollectedCurrent);

    return {
      summaryData: {
        totalOwed: roundMoney(acc.totalOwed),
        totalClients,
        pastDueClients: acc.pastDueClients,
        promisedPayments: roundMoney(acc.promisedPayments),
        activeArrangements: acc.activeArrangements,

        // All clients (MTD)
        expectedPaymentsThisMonth: roundMoney(acc.mtdExpected),
        mtdAccountsReceivable: roundMoney(mtdAR),

        // Current-only splits
        expectedPaymentsThisMonthCurrentOnly: roundMoney(acc.mtdExpectedCurrent),
        mtdAccountsReceivableCurrentOnly: roundMoney(mtdARCurrent),

        ytdOutstandingBalance: roundMoney(acc.ytdOutstanding),

        // (optional internal use)
        _pieExpected: roundMoney(acc.mtdExpected),
        _pieCollected: roundMoney(acc.mtdCollected),
      },
      diffs: {
        totalOwed: {
          value: pctChange(acc.totalOwed, acc.prev_totalOwed),
          direction: acc.totalOwed >= acc.prev_totalOwed ? "up" : "down",
          label: "Since last month",
        },
        promisedPayments: {
          value: pctChange(acc.promisedPayments, acc.prev_promisedPayments),
          direction: acc.promisedPayments >= acc.prev_promisedPayments ? "up" : "down",
          label: "Since last month",
        },
        activeArrangements: {
          value: pctChange(acc.activeArrangements, acc.prev_activeArrangements),
          direction:
            acc.activeArrangements >= acc.prev_activeArrangements ? "up" : "down",
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
          direction: acc.ytdOutstanding >= acc.prev_ytdOutstanding ? "up" : "down",
          label: "Since last month",
        },
      },
    };
  }, [clients]);

  return (
    <Container maxWidth={false} sx={{ px: { xs: 2, md: 3 }, py: 3 }}>
      {/* 1) Summary full width */}
      <Box sx={{ mb: 2 }}>
        <SummaryCards data={metrics.summaryData} diffs={metrics.diffs} />
      </Box>

      {/* 2) Two columns: 3fr / 1fr */}
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
          <Box sx={{ mt: 2 }}>
            <AmountByCaseType height={320} />
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