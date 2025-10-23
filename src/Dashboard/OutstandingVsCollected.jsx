// src/Dashboard/OutstandingVsCollected.jsx
import React, { useEffect, useMemo, useState } from "react";
import DashboardCard from "./DashboardCard";
import { PieChart } from "@mui/x-charts/PieChart";
import { useTheme } from "@mui/material/styles";
import { Box, Stack, Typography, Divider } from "@mui/material";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

// ---------- utils ----------
const DUE_DAY = 15;

const toDate = (v) =>
  v?.toDate?.() ? v.toDate() : isNaN(new Date(v)) ? null : new Date(v);

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const fmtMoney = (n) => `$${Math.round(Number(n || 0)).toLocaleString()}`;

// (kept for consistency, no longer used after FIFO change)
const STRICT_PAYMENT_DATE = true;
const SHOW_EXPECTED_IN_FOOTER = true;

// ---------- monthly helpers (same idea as Dashboard) ----------
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

/**
 * Current month expected/collected with **FIFO across all months up to the current month**.
 * - closed cases: contribute zero
 * - skip: removes month
 * - pause before 15th: removes current month
 * - payments: exclude initial/retainer and those on/before initialPaymentDate; apply FIFO
 */
function getClientExpectedCollectedThisMonth(client, monthDate = new Date()) {
  // ✅ closed cases contribute zero to the pie
  if ((client?.status || "").toLowerCase() === "closed") {
    return { expected: 0, collected: 0 };
  }

  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const curKey = ymKey(monthDate);

  const skipSet = new Set((client?.skipMonths || []).map(String));
  const paused = client?.status === "paused";
  const pauseDate = client?.pauseStartedAt ? toDate(client.pauseStartedAt) : null;

  // Is current month billable?
  let billableThisMonth = true;
  if (skipSet.has(curKey)) billableThisMonth = false;
  if (paused && pauseDate) {
    const sameMonth =
      pauseDate.getFullYear() === monthDate.getFullYear() &&
      pauseDate.getMonth() === monthDate.getMonth();
    if (sameMonth && pauseDate.getDate() < DUE_DAY) {
      billableThisMonth = false; // paused before 15th → don’t bill current month
    }
  }

  // Build month timeline from plan start to current month
  const planStart = client?.firstInstallmentDate ? toDate(client.firstInstallmentDate) : null;
  if (!planStart) return { expected: 0, collected: 0 };

  const firstMonth = new Date(planStart.getFullYear(), planStart.getMonth(), 1);
  const months = [];
  for (let c = new Date(firstMonth); c <= monthStart; c.setMonth(c.getMonth() + 1)) {
    const key = ymKey(c);
    const isCurrent = c.getFullYear() === monthStart.getFullYear() && c.getMonth() === monthStart.getMonth();
    const exp =
      skipSet.has(key)
        ? 0
        : (isCurrent ? (billableThisMonth ? getMonthlyForMonth(client, c) : 0)
                     : getMonthlyForMonth(client, c));
    months.push({ monthDate: new Date(c), expected: exp, collected: 0 });
  }
  if (!months.length) return { expected: 0, collected: 0 };

  // Payments up to end of this month (exclude initial/retainer & <= initialPaymentDate), FIFO
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

  // Return current month’s expected/collected (collected capped to expected)
  const last = months[months.length - 1] || { expected: 0, collected: 0 };
  const expected = Number(last.expected || 0);
  const collected = Math.min(expected, Number(last.collected || 0));
  return { expected, collected };
}

// ---------- component ----------
export default function OutstandingVsCollected({ height = 300, clients: clientsProp, monthDate }) {
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

    return clients.reduce(
      (acc, c) => {
        // ✅ Skip closed cases completely
        if ((c?.status || "").toLowerCase() === "closed") return acc;

        // Don’t count clients whose firstInstallmentDate is after this month
        const first = toDate(c?.firstInstallmentDate);
        if (!first) return acc;
        const thisMonthStart = startOfMonth(monthRef);
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

  // lock colors so footer dots match slices
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

          {SHOW_EXPECTED_IN_FOOTER && (
            <>
              <Typography variant="body1" sx={{ mx: 1, color: "text.disabled" }}>
                •
              </Typography>
              <Typography variant="body1">
                <strong>Expected:</strong> {fmtMoney(expectedSum)}
              </Typography>
            </>
          )}
        </Stack>

        <Typography variant="caption" color="text.secondary">
          Month-to-date (respects skip months & mid-month pause; FIFO for backfills)
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