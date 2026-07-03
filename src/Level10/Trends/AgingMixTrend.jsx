// src/Level10/Trends/AgingMixTrend.jsx
import React, { useMemo } from "react";
import { Paper, Box, Typography } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";

/**
 * Props:
 * - clients: [{ id, status, firstInstallmentDate, payments, invoiceTotal, invoiceAdjustments, initialPaymentAmount, initialPaymentDate, skipMonths, installmentSchedule }]
 * - month: "YYYY-MM"   // current month string (used only to anchor "now")
 * - dueDay: number     // usually 15
 * - monthsBack?: number  // how many months to show (default 6)
 *
 * Computes monthly mix of aging buckets: Current, 1–59, 60–89, 90+ (by count).
 * Matches your CAP/skip/paused logic locally (self-contained).
 */

const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const toDate = (raw) => (raw?.seconds ? new Date(raw.seconds * 1000) : new Date(raw));

const getInstallmentAmountForDate = (schedule, date) => {
  if (!Array.isArray(schedule) || schedule.length === 0) return 500;
  for (const s of schedule) {
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
const collectibleCap = (c) =>
  Math.max(0, computeInvoiceEffective(c) - Number(c?.initialPaymentAmount || 0));

function deriveClientAging(client, asOfDate, dueDay = 15) {
  const status = (client?.status || "active").toLowerCase();
  const isClosed = status === "closed";
  const isPaused = status === "paused";

  const planStart = client?.firstInstallmentDate ? toDate(client.firstInstallmentDate) : null;
  if (!planStart || Number.isNaN(planStart)) {
    // no plan → treat as current unless there’s balance (we only use counts here)
    return { isCurrent: true, agingDays: 0, remainingBalance: 0, dueMonths: [] };
  }

  const cap = collectibleCap(client);
  const firstDueDate = new Date(planStart.getFullYear(), planStart.getMonth(), dueDay);

  // cutoff honored for pause (like your main compute)
  let cutoff = asOfDate || new Date();
  if (isPaused && client.pauseStartedAt) {
    const p = toDate(client.pauseStartedAt);
    cutoff = new Date(p.getFullYear(), p.getMonth(), p.getDate() >= dueDay ? dueDay : dueDay - 1);
  }

  const schedule = (client.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const skipSet = new Set((client?.skipMonths || []).map(String));
  const months = [];
  {
    const cursor = new Date(firstDueDate);
    let expectedAccum = 0;
    while (cursor <= cutoff) {
      const key = ymKey(cursor);
      if (!skipSet.has(key)) {
        const amt = getInstallmentAmountForDate(schedule, cursor);
        if (expectedAccum >= cap) break;
        if (expectedAccum + amt > cap) break;
        months.push(new Date(cursor));
        expectedAccum += amt;
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // payments after initial only
  const ipd = client?.initialPaymentDate ? toDate(client.initialPaymentDate) : null;
  const allPays = Array.isArray(client?.payments) ? client.payments : [];
  const pool = (ipd ? allPays.filter((p) => toDate(p.date) > ipd) : allPays.slice())
    .map((p) => ({ amount: Number(p.amount || 0), date: toDate(p.date) }))
    .filter((p) => p.amount > 0 && p.date)
    .sort((a, b) => a.date - b.date);

  const dueMonths = [];
  let validTotalPaid = 0;
  for (const monthDate of months) {
    const amountDue = getInstallmentAmountForDate(schedule, monthDate);
    let monthPaid = 0;
    for (const p of pool) {
      if (p.amount <= 0) continue;
      if (monthPaid >= amountDue) break;
      const used = Math.min(amountDue - monthPaid, p.amount);
      monthPaid += used;
      validTotalPaid += used;
      p.amount -= used;
    }
    if (monthPaid < amountDue) {
      dueMonths.push({
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), dueDay),
        amount: amountDue,
      });
    }
  }

  // prepayments up to cap
  const leftover = pool.reduce((s, p) => s + (p.amount || 0), 0);
  const capRoom = Math.max(0, cap - validTotalPaid);
  if (leftover > 0 && capRoom > 0) validTotalPaid += Math.min(leftover, capRoom);

  const remainingBalance = isClosed
    ? 0
    : Math.max(0, computeInvoiceEffective(client) - Number(client?.initialPaymentAmount || 0) - validTotalPaid);

  if (remainingBalance <= 0) dueMonths.length = 0;

  // aging days from oldest due month’s 15th
  let agingDays = 0;
  if (dueMonths.length > 0) {
    const oldest = dueMonths[0].date;
    agingDays = Math.max(0, Math.floor((asOfDate - oldest) / (1000 * 60 * 60 * 24)));
  }

  return {
    isCurrent: dueMonths.length === 0,
    agingDays,
    remainingBalance,
  };
}

function monthRangeLabels(n, base = new Date()) {
  const out = [];
  const baseStart = startOfMonth(base);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(baseStart.getFullYear(), baseStart.getMonth() - i, 1);
    out.push({
      label: `${m.toLocaleString("default", { month: "short" })} ${m.getFullYear()}`,
      asOf: endOfMonth(m),
    });
  }
  return out;
}

export default function AgingMixTrend({ clients = [], dueDay = 15, monthsBack = 6 }) {
  const seriesData = useMemo(() => {
    const labels = monthRangeLabels(monthsBack);
    const buckets = labels.map(() => ({
      current: 0,
      d1_59: 0,
      d60_89: 0,
      d90p: 0,
      denom: 0,
    }));

    const active = clients.filter(
      (c) => (c?.status || "active").toLowerCase() !== "closed" &&
             (c.firstInstallmentDate || (c.installmentSchedule || []).length > 0)
    );

    for (const c of active) {
      labels.forEach((L, idx) => {
        const ag = deriveClientAging(c, L.asOf, dueDay);
        buckets[idx].denom += 1;
        if (ag.isCurrent) buckets[idx].current += 1;
        else if (ag.agingDays < 60) buckets[idx].d1_59 += 1;
        else if (ag.agingDays < 90) buckets[idx].d60_89 += 1;
        else buckets[idx].d90p += 1;
      });
    }

    const xLabels = labels.map((l) => l.label);
    return {
      xLabels,
      current: buckets.map((b) => b.current),
      d1_59: buckets.map((b) => b.d1_59),
      d60_89: buckets.map((b) => b.d60_89),
      d90p: buckets.map((b) => b.d90p),
      totals: buckets.map((b) => b.denom),
    };
  }, [clients, dueDay, monthsBack]);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
        Aging Mix Trend (by Count)
      </Typography>

      <Box sx={{ width: "100%", overflowX: "auto" }}>
        <LineChart
          height={300}
          xAxis={[{ scaleType: "point", data: seriesData.xLabels }]}
          series={[
            { id: "Current", label: "Current", data: seriesData.current },
            { id: "1–59", label: "1–59 Days", data: seriesData.d1_59 },
            { id: "60–89", label: "60–89 Days", data: seriesData.d60_89 },
            { id: "90+", label: "90+ Days", data: seriesData.d90p },
          ]}
          grid={{ horizontal: true }}
          slotProps={{ legend: { hidden: false } }}
        />
      </Box>

      <Typography variant="caption" color="text.secondary">
        Counts per month among active-in-plan clients. Uses the 15th as due anchor, respects skips, pauses, and CAP.
      </Typography>
    </Paper>
  );
}