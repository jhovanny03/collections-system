// src/Dashboard/OutstandingVsCollectedMini.jsx
import React, { useEffect, useMemo, useState } from "react";
import DashboardCard from "./DashboardCard";
import { PieChart } from "@mui/x-charts/PieChart";
import { useTheme } from "@mui/material/styles";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

// ===== Shared helpers (aligned with big widget/Dashboard) =====
const DUE_DAY = 15;

const toDate = (v) =>
  v?.toDate?.() ? v.toDate() : isNaN(new Date(v)) ? null : new Date(v);

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

// Variable monthly amount via schedule; fallback to installmentAmount or 500
function getMonthlyForMonth(client, monthDate) {
  const schedule = Array.isArray(client?.installmentSchedule)
    ? client.installmentSchedule
    : [];
  const mStart = startOfMonth(monthDate);
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

// ===== CAP helpers =====
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
 * Current-month expected/collected — CAP-aware + FIFO across all months up to current.
 * - Closed cases => 0
 * - Skip months respected
 * - Pause before the 15th removes *current* month from billables
 * - Exclude initial/retainer and any payments on/before initialPaymentDate
 * - Stop accruing months when adding another would exceed (invoiceEffective - initial)
 * - ✅ NEW: If current month wasn’t included due to CAP, return {expected:0,collected:0}
 */
function getClientExpectedCollectedThisMonth(client, monthDate = new Date()) {
  const status = (client?.status || "").toLowerCase();
  if (status === "closed") return { expected: 0, collected: 0 };

  const planStart = client?.firstInstallmentDate ? toDate(client.firstInstallmentDate) : null;
  if (!planStart) return { expected: 0, collected: 0 };

  const cap = getCollectibleCap(client);
  if (cap <= 0) return { expected: 0, collected: 0 }; // already paid-in-full

  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const curKey = ymKey(monthDate);

  const skipSet = new Set((client?.skipMonths || []).map(String));
  let billableThisMonth = !skipSet.has(curKey);

  const pauseDate = client?.pauseStartedAt ? toDate(client.pauseStartedAt) : null;
  if (status === "paused" && pauseDate) {
    const sameMonth =
      pauseDate.getFullYear() === monthDate.getFullYear() &&
      pauseDate.getMonth() === monthDate.getMonth();
    if (sameMonth && pauseDate.getDate() < DUE_DAY) {
      billableThisMonth = false; // paused before 15th → don't bill this month
    }
  }

  // Build months from plan start up to current month (respect CAP)
  const firstMonth = new Date(planStart.getFullYear(), planStart.getMonth(), 1);
  const months = [];
  let expectedAccum = 0;

  for (let c = new Date(firstMonth); c <= monthStart; c.setMonth(c.getMonth() + 1)) {
    const key = ymKey(c);
    const isCurrent =
      c.getFullYear() === monthStart.getFullYear() &&
      c.getMonth() === monthStart.getMonth();

    if (skipSet.has(key)) {
      months.push({ monthDate: new Date(c), expected: isCurrent ? 0 : 0, collected: 0 });
      continue;
    }

    const amt = getMonthlyForMonth(client, c);

    // CAP gate: if adding this month would exceed cap, stop including further months
    if (expectedAccum >= cap) break;
    if (expectedAccum + amt > cap) break;

    const expectedForThis = isCurrent ? (billableThisMonth ? amt : 0) : amt;

    if (expectedForThis > 0) expectedAccum += amt;

    months.push({
      monthDate: new Date(c),
      expected: expectedForThis,
      collected: 0,
    });
  }

  // ✅ Ensure we base the result on THIS MONTH specifically
  const currentIdx = months.findIndex(
    (m) =>
      m.monthDate.getFullYear() === monthStart.getFullYear() &&
      m.monthDate.getMonth() === monthStart.getMonth()
  );

  // If CAP prevented adding the current month, then nothing is due/collectible this month
  if (currentIdx === -1) return { expected: 0, collected: 0 };

  // Payments up to end of this month (exclude initial / <= initialPaymentDate), FIFO
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
    .sort((a, b) => a.date - b.date);

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

  const cur = months[currentIdx] || { expected: 0, collected: 0 };
  const expected = Number(cur.expected || 0);
  const collected = Math.min(expected, Number(cur.collected || 0));
  return { expected, collected };
}

// ===== Component =====
export default function OutstandingVsCollectedMini({ height = 180 }) {
  const theme = useTheme();
  const [clients, setClients] = useState([]);
  const monthRef = new Date();

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "clients"));
        setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("🔥 Error loading clients (mini chart):", err);
      }
    })();
  }, []);

  const { expectedSum, collectedSum } = useMemo(() => {
    if (!Array.isArray(clients) || !clients.length)
      return { expectedSum: 0, collectedSum: 0 };

    const thisMonthStart = startOfMonth(monthRef);

    return clients.reduce(
      (acc, c) => {
        const status = (c?.status || "").toLowerCase();
        if (status === "closed") return acc;

        const first = c?.firstInstallmentDate ? toDate(c.firstInstallmentDate) : null;
        if (!first) return acc;
        if (startOfMonth(first) > thisMonthStart) return acc; // not started yet

        const { expected, collected } = getClientExpectedCollectedThisMonth(c, monthRef);
        acc.expectedSum += expected;
        acc.collectedSum += collected;
        return acc;
      },
      { expectedSum: 0, collectedSum: 0 }
    );
  }, [clients, monthRef]);

  const outstanding = Math.max(0, expectedSum - collectedSum);
  const total = Math.max(1, Math.round(outstanding + collectedSum));
  const COLORS = [theme.palette.primary.main, theme.palette.warning.main];

  const data = [
    { id: 0, label: "Outstanding", value: Math.round(outstanding), color: COLORS[0] },
    { id: 1, label: "Collected", value: Math.round(collectedSum), color: COLORS[1] },
  ];

  return (
    <DashboardCard title="Outstanding vs Collected" sx={{ height }}>
      <PieChart
        height={height - 60}
        series={[
          {
            data,
            innerRadius: 25,
            outerRadius: 55,
            paddingAngle: 2,
            arcLabel: (item) => `${Math.round((item.value / total) * 100)}%`,
            arcLabelMinAngle: 10,
          },
        ]}
        slotProps={{ legend: { hidden: true } }}
        sx={{
          "& .MuiPieArc-root path": {
            stroke: theme.palette.background.paper,
            strokeWidth: 2,
          },
        }}
      />
    </DashboardCard>
  );
}