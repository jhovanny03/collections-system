// src/Dashboard/OutstandingVsCollected.jsx
import React, { useEffect, useMemo, useState } from "react";
import DashboardCard from "./DashboardCard";
import { PieChart } from "@mui/x-charts/PieChart";
import { useTheme } from "@mui/material/styles";
import { Box, Stack, Typography, Divider } from "@mui/material";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

// ================== Shared canonical helpers (from Dashboard.js) ==================
const DUE_DAY = 15;

const toDate = (v) =>
  v?.toDate?.() ? v.toDate() : isNaN(new Date(v)) ? null : new Date(v);

const startOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const fmtMoney = (n) => `$${Math.round(Number(n || 0)).toLocaleString()}`;

// ============ CAP helpers ============
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

// ============ Monthly installment helper ============
function getInstallmentAmountForDate(schedule, date) {
  if (!Array.isArray(schedule) || schedule.length === 0) return 500;
  for (let i = 0; i < schedule.length; i++) {
    const s = schedule[i];
    const sStart = new Date(s.start);
    const sEnd = new Date(s.end);
    if (date >= sStart && date <= sEnd) return Number(s.amount || 500);
  }
  return 500;
}

/**
 * Canonical current-month expected vs collected — aligned to Dashboard.js
 * - Closed => 0
 * - ✅ Option #1: paused => expected/collected = 0 (always)
 * - Skip respected
 * - CAP stops adding once reached
 * - Excludes initial/retainer/setup AND payments on/before initialPaymentDate
 * - FIFO allocation across months up to the current month
 * - ✅ "Collected" is MTD (up to today if current month; else up to month end)
 */
function getClientExpectedCollectedThisMonth(client, monthDate = new Date()) {
  const status = (client?.status || "").toLowerCase();
  if (status === "closed") return { expected: 0, collected: 0 };

  // ✅ Match Dashboard.js Option #1 behavior
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

  // ---- Build months up to monthEnd with strict CAP enforcement ----
  const months = [];
  let expectedAccum = 0;
  let cursor = new Date(planStart.getFullYear(), planStart.getMonth(), DUE_DAY);

  while (cursor <= monthEnd) {
    const key = ymKey(cursor);
    const amt = skipSet.has(key) ? 0 : getInstallmentAmountForDate(schedule, cursor);

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

  // Find current month entry
  const currentDueKey = ymKey(
    new Date(monthDate.getFullYear(), monthDate.getMonth(), DUE_DAY)
  );
  const idx = months.findIndex((m) => ymKey(m.dueDate) === currentDueKey);
  if (idx === -1) return { expected: 0, collected: 0 };

  // ✅ True MTD cutoff: if it's the current month, only count through "today"
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === monthDate.getFullYear() &&
    today.getMonth() === monthDate.getMonth();

  const mtdCutoff = isCurrentMonth ? today : monthEnd;

  // FIFO apply payments up to MTD cutoff (exclude initial / <= initialPaymentDate)
  const initialCutoff = client?.initialPaymentDate
    ? toDate(client.initialPaymentDate)
    : null;

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
        p.date <= mtdCutoff &&
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

  const current = months[idx];
  const expected = Number(current.expected || 0);

  // Collected for THIS month = amount allocated into this month's bucket (capped)
  const collected = Math.min(expected, Number(current.collected || 0));
  return { expected, collected };
}

// ================== Component ==================
export default function OutstandingVsCollected({
  height = 300,
  clients: clientsProp,
  monthDate,
}) {
  const theme = useTheme();
  const monthRef = monthDate ? new Date(monthDate) : new Date();

  const [clients, setClients] = useState(Array.isArray(clientsProp) ? clientsProp : null);

  useEffect(() => {
    if (Array.isArray(clientsProp)) setClients(clientsProp);
  }, [clientsProp]);

  useEffect(() => {
    if (clients !== null) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "clients"));
        setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("🔥 Error loading clients for OutstandingVsCollected:", e);
        setClients([]);
      }
    })();
  }, [clients]);

  const { expectedSum, collectedSum } = useMemo(() => {
    if (!Array.isArray(clients)) return { expectedSum: 0, collectedSum: 0 };

    const thisMonthStart = startOfMonth(monthRef);

    return clients.reduce(
      (acc, c) => {
        const status = (c?.status || "").toLowerCase();
        if (status === "closed") return acc;

        const first = c?.firstInstallmentDate ? toDate(c.firstInstallmentDate) : null;
        if (!first) return acc;
        if (startOfMonth(first) > thisMonthStart) return acc;

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
  const chartData = [
    { id: 0, label: "Outstanding", value: Math.round(outstanding), color: COLORS[0] },
    { id: 1, label: "Collected", value: Math.round(collectedSum), color: COLORS[1] },
  ];

  const total = Math.max(1, chartData.reduce((s, d) => s + d.value, 0));

  return (
    <DashboardCard title="Outstanding vs Collected">
      <Box sx={{ position: "relative" }}>
        <PieChart
          height={height}
          legend={{ hidden: true }}
          slotProps={{ legend: { hidden: true } }}
          sx={{
            "& .MuiChartsLegend-root": { display: "none !important" },
            "& .MuiPieArc-root path": {
              stroke: theme.palette.background.paper,
              strokeWidth: 2,
            },
            "& .MuiChartsArcLabel-root": {
              fontSize: 12,
              fontWeight: 600,
              fill: theme.palette.text.primary,
            },
          }}
          series={[
            {
              data: chartData,
              innerRadius: 70,
              outerRadius: 110,
              paddingAngle: 2,
              arcLabel: (item) => `${Math.round((item.value / total) * 100)}%`,
              arcLabelMinAngle: 12,
            },
          ]}
        />

        {/* Center label */}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            flexDirection: "column",
          }}
        >
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {fmtMoney(expectedSum)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Expected
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ mt: 1, mb: 1 }} />

      {/* Footer legend + figures */}
      <Box sx={{ textAlign: "center", px: 1 }}>
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          justifyContent="center"
          sx={{ flexWrap: "wrap" }}
        >
          <LegendDot color={COLORS[0]} />
          <Typography variant="body1">
            <strong>Outstanding</strong> {fmtMoney(outstanding)}{" "}
            <Typography component="span" variant="body2" color="text.secondary">
              ({Math.round((outstanding / total) * 100)}%)
            </Typography>
          </Typography>

          <Typography variant="body1" sx={{ mx: 1, color: "text.disabled" }}>
            •
          </Typography>

          <LegendDot color={COLORS[1]} />
          <Typography variant="body1">
            <strong>Collected</strong> {fmtMoney(collectedSum)}{" "}
            <Typography component="span" variant="body2" color="text.secondary">
              ({Math.round((collectedSum / total) * 100)}%)
            </Typography>
          </Typography>

          <Typography variant="body1" sx={{ mx: 1, color: "text.disabled" }}>
            •
          </Typography>
          <Typography variant="body1">
            <strong>Expected:</strong> {fmtMoney(expectedSum)}
          </Typography>
        </Stack>

        <Typography variant="caption" color="text.secondary">
          Month-to-date (15th rule, CAP-aware, skip respected, paused=0)
        </Typography>
      </Box>
    </DashboardCard>
  );
}

function LegendDot({ color }) {
  return (
    <Box
      sx={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        bgcolor: color,
        display: "inline-block",
      }}
    />
  );
}