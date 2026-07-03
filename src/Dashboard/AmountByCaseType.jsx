// src/Dashboard/AmountByCaseType.jsx
import React, { useEffect, useMemo, useState } from "react";
import DashboardCard from "./DashboardCard";
import { BarChart } from "@mui/x-charts/BarChart";
import { Box, Typography, useTheme } from "@mui/material";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

/* ============== Shared helpers ============== */

// Parse Firestore Timestamp or plain value into Date
const parseMaybeTs = (raw) =>
  raw && raw.seconds
    ? new Date(raw.seconds * 1000)
    : raw
    ? new Date(raw)
    : null;

// Normalize to the 15th (due day) before comparing to schedule tiers
const toDueMidMonth = (dateLike) => {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return new Date(d.getFullYear(), d.getMonth(), 15);
};

const monthKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const addMonths = (d, n) =>
  new Date(d.getFullYear(), d.getMonth() + n, 1);

// Determine installment amount for a given due month (respects schedule tiers)
const getInstallmentAmountForDate = (client, date) => {
  const dueMid = toDueMidMonth(date);
  const schedule = (client.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  for (const s of schedule) {
    const sStart = new Date(s.start);
    const sEnd = new Date(s.end);
    if (dueMid >= sStart && dueMid <= sEnd) {
      return Number(s.amount || 0);
    }
  }
  return Number(client.installmentAmount || 500);
};

const getPlanMonths = (client) => {
  const invoice =
    Number(client.invoiceTotal || client.invoice || 0) || 0;
  const monthly = Number(client.installmentAmount || 500) || 0;

  if (invoice > 0 && monthly > 0) {
    return Math.max(1, Math.ceil(invoice / monthly));
  }

  // Fallback horizon if invoice/amount not set
  return 60;
};

// Should this month accrue installments (not paused / beyond pause)?
const monthAccrues = (client, monthDate) => {
  const status = (client.billingStatus || client.status || "active").toLowerCase();
  // If you want closed-with-balance to still show existing past due,
  // we still accrue up to closure month, but no *new* months after pause.
  // Here we let closed keep the existing months and only stop new ones via pause.
  const pauseAt = parseMaybeTs(client.pauseStartedAt);

  if (pauseAt) {
    const pauseMonth = new Date(
      pauseAt.getFullYear(),
      pauseAt.getMonth(),
      1
    );
    const m = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    if (m >= pauseMonth) return false;
  }

  // If you want to fully stop accrual for closed, uncomment:
  // if (status === "closed") return false;

  return true;
};

// Skipped months array can be ['2025-04', '2025-05', ...]
const isSkippedMonth = (client, monthDate) => {
  const sk = client.skipMonths || client.skippedMonths || [];
  return sk.includes(monthKey(monthDate));
};

/* ============== Core AR logic (per client) ============== */

// Build due months based on invoice total + installment amount + anchors
const buildClientDueMonths = (client) => {
  const rawStart = client.firstInstallmentDate;
  if (!rawStart) return [];

  // Anchor: if expectedAnchor exists (resume point), use it, else firstInstallmentDate
  const expectedAnchor = client.expectedAnchor
    ? new Date(client.expectedAnchor)
    : null;
  const startDate = expectedAnchor || parseMaybeTs(rawStart);
  if (!(startDate instanceof Date) || isNaN(startDate)) return [];

  const planMonths = getPlanMonths(client);
  const months = [];

  let cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

  for (let i = 0; i < planMonths; i++) {
    const m = new Date(cur);

    if (monthAccrues(client, m) && !isSkippedMonth(client, m)) {
      const expected = getInstallmentAmountForDate(client, m);
      months.push({
        ym: monthKey(m),
        date: m, // 1st of that month
        expected,
        collected: 0,
        remaining: expected,
      });
    } else {
      // Even if month skips accrual, we still move forward in plan
      // (so that invoiceTotal/planMonths logic stays consistent).
    }

    cur = addMonths(cur, 1);
  }

  return months;
};

// Allocate payments oldest-due-first across all due months
const allocatePaymentsToDueMonths = (client, dueMonths) => {
  // Only payments made AFTER initialPaymentDate count toward installments
  const ipd = client.initialPaymentDate
    ? new Date(client.initialPaymentDate)
    : null;

  const payments = (client.payments || [])
    .filter((p) => {
      const d = new Date(p.date);
      return !isNaN(d) && (!ipd || d > ipd);
    })
    .map((p) => ({
      amount: Number(p.amount || 0),
      date: new Date(p.date),
    }))
    .sort((a, b) => a.date - b.date);

  for (const pay of payments) {
    let amt = pay.amount;
    if (amt <= 0) continue;

    for (const month of dueMonths) {
      if (month.remaining <= 0) continue;
      const take = Math.min(month.remaining, amt);
      month.collected += take;
      month.remaining -= take;
      amt -= take;
      if (amt <= 0) break;
    }
  }
  return dueMonths;
};

/**
 * 🔹 True "past due" as of a specific date:
 *  - We build all due months based on invoiceTotal & installmentAmount
 *  - Allocate payments oldest-first
 *  - Sum expected - collected for months whose 15th is <= asOf
 */
const amountPastDueAsOf = (client, asOf = new Date()) => {
  const dueMonths = allocatePaymentsToDueMonths(
    client,
    buildClientDueMonths(client)
  );
  if (!dueMonths.length) return 0;

  let totalPastDue = 0;
  for (const m of dueMonths) {
    const dueDate = new Date(m.date.getFullYear(), m.date.getMonth(), 15);
    if (dueDate > asOf) continue; // not due yet

    const diff = Number(m.expected || 0) - Number(m.collected || 0);
    if (diff > 0) totalPastDue += diff;
  }
  return totalPastDue;
};

const money = (n) => `$${Math.round(Number(n || 0)).toLocaleString()}`;

/* ============== Component ============== */

export default function AmountByCaseType({ height = 300, clients: clientsProp }) {
  const theme = useTheme();
  const [clients, setClients] = useState(
    Array.isArray(clientsProp) ? clientsProp : null
  );

  // Keep in sync if parent passes clients
  useEffect(() => {
    if (Array.isArray(clientsProp)) setClients(clientsProp);
  }, [clientsProp]);

  // Fallback: load from Firestore if not provided
  useEffect(() => {
    if (clients !== null) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "clients"));
        setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("🔥 Error loading clients for AmountByCaseType:", e);
        setClients([]);
      }
    })();
  }, [clients]);

  const rows = useMemo(() => {
    if (!Array.isArray(clients)) return [];
    const today = new Date();

    // Aggregate true past-due by caseType
    const map = new Map();
    for (const c of clients) {
      const ct = String(c.caseType || "—");
      const owed = amountPastDueAsOf(c, today);
      if (!owed) continue;
      map.set(ct, (map.get(ct) || 0) + owed);
    }

    return Array.from(map.entries())
      .map(([caseType, amount]) => ({ caseType, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [clients]);

  const xCats = rows.map((r) => r.caseType);
  const yVals = rows.map((r) => Math.round(r.amount));

  return (
    <DashboardCard title="Past Due by Case Type">
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No data.
        </Typography>
      ) : (
        <Box sx={{ px: { xs: 0.5, sm: 1 } }}>
          <BarChart
            height={height}
            margin={{ left: 90, right: 16, top: 16, bottom: 28 }}
            grid={{ horizontal: true }}
            xAxis={[
              {
                scaleType: "band",
                data: xCats,
                categoryGapRatio: 0.35,
              },
            ]}
            series={[
              {
                label: "Past Due",
                data: yVals,
                valueFormatter: (v) => money(v),
              },
            ]}
            slotProps={{
              legend: { hidden: true },
            }}
            sx={{
              "& .MuiChartsAxis-tickLabel": { fontSize: 12 },
              "& .MuiBarElement-root": {
                rx: 6,
                fill: theme.palette.primary.main,
              },
              "& .MuiChartsAxis-left .MuiChartsAxis-tickLabel": {
                textOverflow: "ellipsis",
              },
            }}
          />
        </Box>
      )}
    </DashboardCard>
  );
}