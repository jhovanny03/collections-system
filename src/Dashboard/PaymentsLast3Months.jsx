// ==========================
// src/Dashboard/PaymentsLast3Months.jsx
// ==========================

import React, { useEffect, useMemo, useState } from "react";
import DashboardCard from "./DashboardCard";
import { BarChart } from "@mui/x-charts/BarChart";
import { useTheme } from "@mui/material/styles";
import { Box, Typography, Divider } from "@mui/material";

import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

// ---------- Date utils ----------
const DUE_DAY = 15;

const toDate = (v) =>
  v?.toDate?.() ? v.toDate() : isNaN(new Date(v)) ? null : new Date(v);

const startOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const addMonths = (d, n) =>
  new Date(d.getFullYear(), d.getMonth() + n, 1, 0, 0, 0, 0);

const monthShort = (date) => date.toLocaleString("default", { month: "short" });

const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

const formatMoney = (n) =>
  typeof n === "number" ? `$${Math.round(n).toLocaleString()}` : "—";

// ---------- CAP helpers (same as Dashboard.js) ----------
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
  const initialPayment = Number(client?.initialPaymentAmount || 0);
  return Math.max(0, invoiceEffective - initialPayment);
}

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

// ---------- Initial flag (same as Dashboard.js) ----------
function isInitialFlag(p) {
  const t = (p?.type || p?.category || "").toString().toLowerCase();
  return p?.isInitial === true || t === "initial" || t === "retainer" || t === "setup";
}

/**
 * ✅ Canonical expected/collected for a given month — MATCH Dashboard.js
 * ✅ Option #1: paused => 0/0 always
 */
function getClientExpectedCollectedThisMonth(client, monthDate = new Date()) {
  const status = (client?.status || "").toLowerCase();
  if (status === "closed") return { expected: 0, collected: 0 };
  if (status === "paused") return { expected: 0, collected: 0 }; // Option #1

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

  const currentDueKey = ymKey(
    new Date(monthDate.getFullYear(), monthDate.getMonth(), DUE_DAY)
  );
  const idx = months.findIndex((m) => ymKey(m.dueDate) === currentDueKey);
  if (idx === -1) return { expected: 0, collected: 0 };

  // FIFO payments up to month end, excluding initial and <= initialPaymentDate
  const initialCutoff = client?.initialPaymentDate ? toDate(client.initialPaymentDate) : null;

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

  const current = months[idx];
  const expected = Number(current.expected || 0);
  const collected = Math.min(expected, Number(current.collected || 0));
  return { expected, collected };
}

// ---------- Last N months helper (ascending: M-2, M-1, M) ----------
function lastNMonths(baseDate = new Date(), n = 3) {
  const months = [];
  const base = startOfMonth(baseDate);
  for (let i = n - 1; i >= 0; i--) {
    const m = addMonths(base, -i);
    months.push({
      label: monthShort(m),
      monthDate: m,
    });
  }
  return months;
}

// ---------- Aggregate Expected & Covered for last 3 months (Dashboard-canonical) ----------
function aggregateExpectedCoveredForLast3Months(allClients, asOf = new Date()) {
  const targets = lastNMonths(asOf, 3);
  const totals = targets.map(() => ({ expected: 0, covered: 0 }));

  for (const c of allClients) {
    if ((c?.status || "").toLowerCase() === "closed") continue;

    const first = c?.firstInstallmentDate ? toDate(c.firstInstallmentDate) : null;
    if (!first) continue;

    targets.forEach((t, idx) => {
      // Don’t count months before the plan exists
      if (startOfMonth(first) > startOfMonth(t.monthDate)) return;

      const { expected, collected } = getClientExpectedCollectedThisMonth(c, t.monthDate);
      totals[idx].expected += expected;
      totals[idx].covered += collected;
    });
  }

  return {
    labels: targets.map((t) => t.label),
    expected: totals.map((t) => Math.round(t.expected)),
    covered: totals.map((t) => Math.round(t.covered)),
  };
}

// ===================== Component =====================
export default function PaymentsLast3Months({ height = 300, clients: clientsProp }) {
  const theme = useTheme();

  const [clients, setClients] = useState(
    Array.isArray(clientsProp) ? clientsProp : null
  );

  useEffect(() => {
    if (Array.isArray(clientsProp)) setClients(clientsProp);
  }, [clientsProp]);

  useEffect(() => {
    if (clients !== null) return;
    (async () => {
      try {
        const snapshot = await getDocs(collection(db, "clients"));
        setClients(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      } catch (e) {
        console.error("🔥 Error loading clients for PaymentsLast3Months:", e);
        setClients([]);
      }
    })();
  }, [clients]);

  const { labels, expected, covered } = useMemo(() => {
    if (!Array.isArray(clients)) return { labels: [], expected: [], covered: [] };
    return aggregateExpectedCoveredForLast3Months(clients, new Date());
  }, [clients]);

  return (
    <DashboardCard title="Payments Last 3 Months">
      <BarChart
        sx={{
          "& .MuiBarElement-root": {
            stroke: theme.palette.background.paper,
            strokeWidth: 1.5,
            shapeRendering: "crispEdges",
          },
        }}
        height={height}
        xAxis={[{ scaleType: "band", data: labels }]}
        series={[
          {
            label: "Expected",
            data: expected,
            color: "#F59E0B",
            valueFormatter: (v) =>
              typeof v === "number" ? `$${v.toLocaleString()}` : v,
          },
          {
            label: "Covered",
            data: covered,
            color: "#10B981",
            valueFormatter: (v) =>
              typeof v === "number" ? `$${v.toLocaleString()}` : v,
          },
        ]}
        slotProps={{ legend: { hidden: false } }}
        grid={{ horizontal: true }}
      />

      {/* Numeric summary */}
      <Box sx={{ mt: 1.5 }}>
        <Divider sx={{ mb: 1 }} />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `120px repeat(${labels.length}, 1fr)`,
            gap: 1,
            alignItems: "center",
          }}
        >
          <Box />
          {labels.map((lbl) => (
            <Typography
              key={`hdr-${lbl}`}
              variant="caption"
              sx={{ fontWeight: 700, textAlign: "right" }}
            >
              {lbl}
            </Typography>
          ))}

          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Expected
          </Typography>
          {expected.map((v, i) => (
            <Typography key={`exp-${i}`} variant="body2" sx={{ textAlign: "right" }}>
              {formatMoney(v)}
            </Typography>
          ))}

          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Covered
          </Typography>
          {covered.map((v, i) => (
            <Typography key={`cov-${i}`} variant="body2" sx={{ textAlign: "right" }}>
              {formatMoney(v)}
            </Typography>
          ))}
        </Box>
      </Box>
    </DashboardCard>
  );
}