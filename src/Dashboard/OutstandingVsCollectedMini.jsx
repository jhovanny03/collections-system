// src/Dashboard/OutstandingVsCollectedMini.jsx
import React, { useEffect, useMemo, useState } from "react";
import DashboardCard from "./DashboardCard";
import { PieChart } from "@mui/x-charts/PieChart";
import { useTheme } from "@mui/material/styles";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

// ===== Shared helpers (same logic as full version) =====
const DUE_DAY = 15;
const toDate = (v) =>
  v?.toDate?.() ? v.toDate() : isNaN(new Date(v)) ? null : new Date(v);
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

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

function getClientExpectedCollectedThisMonth(client, monthDate = new Date()) {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const curKey = ymKey(monthDate);
  const skipSet = new Set((client?.skipMonths || []).map(String));
  const paused = client?.status === "paused";
  const pauseDate = client?.pauseStartedAt ? toDate(client.pauseStartedAt) : null;

  let billable = true;
  if (skipSet.has(curKey)) billable = false;
  if (paused && pauseDate) {
    if (
      pauseDate.getFullYear() === monthDate.getFullYear() &&
      pauseDate.getMonth() === monthDate.getMonth() &&
      pauseDate.getDate() < DUE_DAY
    )
      billable = false;
  }

  const expected = billable ? getMonthlyForMonth(client, monthDate) : 0;
  const initialCutoff = client?.initialPaymentDate ? toDate(client.initialPaymentDate) : null;
  const isInitialFlag = (p) => {
    const t = (p?.type || p?.category || "").toString().toLowerCase();
    return p?.isInitial === true || t === "initial" || t === "retainer" || t === "setup";
  };

  const monthPayments = (client?.payments || [])
    .map((p) => ({ amount: Number(p?.amount || 0), date: toDate(p?.date), raw: p }))
    .filter(
      (p) =>
        p.amount > 0 &&
        p.date &&
        p.date >= monthStart &&
        p.date <= monthEnd &&
        !isInitialFlag(p.raw) &&
        (initialCutoff ? p.date > initialCutoff : true)
    );

  const collected = Math.min(
    expected,
    monthPayments.reduce((s, p) => s + p.amount, 0)
  );

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

    return clients.reduce(
      (acc, c) => {
        const { expected, collected } = getClientExpectedCollectedThisMonth(c, monthRef);
        acc.expectedSum += expected;
        acc.collectedSum += collected;
        return acc;
      },
      { expectedSum: 0, collectedSum: 0 }
    );
  }, [clients, monthRef]);

  const outstanding = Math.max(0, expectedSum - collectedSum);
  const COLORS = [theme.palette.primary.main, theme.palette.warning.main];

  const data = [
    { id: 0, label: "Outstanding", value: outstanding, color: COLORS[0] },
    { id: 1, label: "Collected", value: collectedSum, color: COLORS[1] },
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
            arcLabel: (item) =>
              `${Math.round(
                (item.value / Math.max(1, expectedSum)) * 100
              )}%`,
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