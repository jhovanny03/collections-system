// src/Level10/Trends/CurrentOnlyTrend.jsx
import React, { useMemo } from "react";
import { Paper, Box, Typography, Divider } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";

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

/** Derives due month keys as of a given 'asOf' (end-of-month), respecting CAP, skips, pause. */
function deriveDueMonthKeys(client, asOfDate, dueDay = 15) {
  const status = (client?.status || "active").toLowerCase();
  const isClosed = status === "closed";
  const isPaused = status === "paused";

  const planStart = client?.firstInstallmentDate ? toDate(client.firstInstallmentDate) : null;
  if (!planStart || Number.isNaN(planStart) || isClosed) return [];

  // pause cutoff
  let cutoff = asOfDate || new Date();
  if (isPaused && client.pauseStartedAt) {
    const p = toDate(client.pauseStartedAt);
    cutoff = new Date(p.getFullYear(), p.getMonth(), p.getDate() >= dueDay ? dueDay : dueDay - 1);
  }

  const cap = collectibleCap(client);
  const schedule = (client.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  const skipSet = new Set((client?.skipMonths || []).map(String));

  const months = [];
  const firstDue = new Date(planStart.getFullYear(), planStart.getMonth(), dueDay);
  let cursor = new Date(firstDue);
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

  // exclude initial/retainer & pre-initial payments
  const ipd = client?.initialPaymentDate ? toDate(client.initialPaymentDate) : null;
  const pool = (Array.isArray(client?.payments) ? client.payments : [])
    .filter((p) => {
      const d = toDate(p.date);
      const amt = Number(p.amount || 0);
      if (!d || amt <= 0) return false;
      if (ipd && d <= ipd) return false;
      const t = (p?.type || p?.category || "").toString().toLowerCase();
      if (p?.isInitial === true || ["initial", "retainer", "setup"].includes(t)) return false;
      return d <= asOfDate; // only payments up to asOf
    })
    .map((p) => ({ amount: Number(p.amount || 0), date: toDate(p.date) }))
    .sort((a, b) => a.date - b.date);

  const dueKeys = [];
  for (const m of months) {
    const amt = getInstallmentAmountForDate(schedule, m);
    let paid = 0;
    for (const p of pool) {
      if (p.amount <= 0) continue;
      const take = Math.min(amt - paid, p.amount);
      paid += take;
      p.amount -= take;
      if (paid >= amt) break;
    }
    if (paid < amt) {
      dueKeys.push(ymKey(m));
    }
  }
  return dueKeys;
}

function monthRangeLabels(n, base = new Date()) {
  const out = [];
  const baseStart = startOfMonth(base);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(baseStart.getFullYear(), baseStart.getMonth() - i, 1);
    out.push({
      label: `${m.toLocaleString("default", { month: "short" })} ${m.getFullYear()}`,
      asOf: endOfMonth(m),
      key: ymKey(m),
    });
  }
  return out;
}

/**
 * Clients Owing Only Current Month — trend (count + %).
 * Props:
 *  - clients: array
 *  - dueDay: number (default 15)
 *  - monthsBack: number (default 6)
 */
export default function CurrentOnlyTrend({ clients = [], dueDay = 15, monthsBack = 6 }) {
  const data = useMemo(() => {
    const labels = monthRangeLabels(monthsBack);
    const active = clients.filter(
      (c) =>
        (c?.status || "active").toLowerCase() !== "closed" &&
        (c.firstInstallmentDate || (c.installmentSchedule || []).length > 0)
    );

    const counts = [];
    const percents = [];
    const xLabels = labels.map((l) => l.label);

    for (const L of labels) {
      let denom = 0;
      let onlyCurrent = 0;

      for (const c of active) {
        denom += 1;
        const dueKeys = deriveDueMonthKeys(c, L.asOf, dueDay);
        if (dueKeys.length === 1 && dueKeys[0] === L.key) {
          onlyCurrent += 1;
        }
      }

      counts.push(onlyCurrent);
      percents.push(denom > 0 ? Math.round((onlyCurrent / denom) * 100) : 0);
    }

    return { xLabels, counts, percents };
  }, [clients, dueDay, monthsBack]);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
        Clients Owing Only Current Month — Trend
      </Typography>

      {/* Count line */}
      <Box sx={{ width: "100%", overflowX: "auto", mb: 2 }}>
        <LineChart
          height={280}
          xAxis={[{ scaleType: "point", data: data.xLabels }]}
          series={[{ id: "Count", label: "Count", data: data.counts }]}
          grid={{ horizontal: true }}
          slotProps={{ legend: { hidden: false } }}
        />
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* Percent line */}
      <Box sx={{ width: "100%", overflowX: "auto" }}>
        <LineChart
          height={240}
          xAxis={[{ scaleType: "point", data: data.xLabels }]}
          yAxis={[{ min: 0, max: 100 }]}
          series={[{ id: "Percent", label: "Percent", data: data.percents }]}
          grid={{ horizontal: true }}
          slotProps={{ legend: { hidden: false } }}
        />
      </Box>

      <Typography variant="caption" color="text.secondary">
        Share and count of in-plan clients who owe exactly one month — the current month — as of each month end. Respects CAP, skips, pauses, and initial-payment exclusion.
      </Typography>
    </Paper>
  );
}