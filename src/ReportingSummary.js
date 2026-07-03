// ReportingSummary.js
import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import db from "./firebase";

// MUI
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  Grid,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";

/* ==================== Billing math (aligned with ClientList) ==================== */
const DUE_DAY = 15;

const toDate = (raw) =>
  raw?.seconds ? new Date(raw.seconds * 1000) : new Date(raw);
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

const getInstallmentAmountForDate = (schedule, date) => {
  if (!Array.isArray(schedule) || schedule.length === 0) return 500; // default
  for (let i = 0; i < schedule.length; i++) {
    const s = schedule[i];
    const sStart = new Date(s.start);
    const sEnd = new Date(s.end);
    if (date >= sStart && date <= sEnd) return Number(s.amount || 500);
  }
  return 500; // fallback
};

function computeBillingSnapshot(client, now = new Date()) {
  const status = (client?.status || "active").toLowerCase();
  const isClosed = status === "closed";
  const isPaused = status === "paused";

  const invoiceBase = Number(client?.invoiceTotal || 0);
  const adjustments = Array.isArray(client?.invoiceAdjustments)
    ? client.invoiceAdjustments
    : [];
  const adjToBalanceTotal = adjustments.reduce((sum, a) => {
    const applyTo = (a?.applyTo || "balance").toLowerCase();
    const amt = Number(a?.amount || 0);
    const dp = Number(a?.downPayment || 0);
    return applyTo === "balance" ? sum + (amt - dp) : sum;
  }, 0);
  const invoiceEffective = Math.max(0, invoiceBase + adjToBalanceTotal);

  const initialPayment = parseFloat(client?.initialPaymentAmount || 0);
  const collectibleCap = Math.max(0, invoiceEffective - initialPayment);

  if (!client.firstInstallmentDate) {
    const remainingBalance = Math.max(0, invoiceEffective - initialPayment);
    const isPaidInFull = remainingBalance <= 0 || isClosed;
    return { amountDue: 0, missedMonths: 0, isPaidInFull };
  }

  const planStart = toDate(client.firstInstallmentDate);
  if (!planStart || isNaN(planStart)) {
    const remainingBalance = Math.max(0, invoiceEffective - initialPayment);
    const isPaidInFull = remainingBalance <= 0 || isClosed;
    return { amountDue: 0, missedMonths: 0, isPaidInFull };
  }

  const firstDueDate = new Date(planStart.getFullYear(), planStart.getMonth(), DUE_DAY);

  // ✅ Pause rule: if paused, stop at pause month:
  // - paused BEFORE 15th => cutoff is 14th (so current month NOT included)
  // - paused ON/AFTER 15th => cutoff is 15th (so current month IS included)
  const pauseStartedAt = client?.pauseStartedAt ? toDate(client.pauseStartedAt) : null;

  const cutoff =
    isPaused && pauseStartedAt
      ? new Date(
          pauseStartedAt.getFullYear(),
          pauseStartedAt.getMonth(),
          pauseStartedAt.getDate() >= DUE_DAY ? DUE_DAY : DUE_DAY - 1
        )
      : now;

  const skipSet = new Set((client.skipMonths || []).map(String));
  const monthIsSkipped = (d) => skipSet.has(ymKey(d));

  const schedule = (client.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const monthsUpToCutoff = [];
  if (!isClosed) {
    const cursor = new Date(firstDueDate);
    let expectedAccum = 0;
    while (cursor <= cutoff) {
      if (!monthIsSkipped(cursor)) {
        const amt = getInstallmentAmountForDate(schedule, cursor);
        if (expectedAccum >= collectibleCap) break;
        if (expectedAccum + amt > collectibleCap) break;
        monthsUpToCutoff.push(new Date(cursor));
        expectedAccum += amt;
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  const allPayments = client?.payments || [];
  const initialPaymentDate = client?.initialPaymentDate
    ? new Date(client.initialPaymentDate)
    : null;
  const paymentsAfterInitial = initialPaymentDate
    ? allPayments.filter((p) => new Date(p.date) > initialPaymentDate)
    : allPayments.slice();

  const pool = paymentsAfterInitial.map((p) => ({
    amount: Number(p.amount || 0),
    date: p.date,
  }));

  let validTotalPaid = 0;
  const dueMonths = [];

  for (const monthDate of monthsUpToCutoff) {
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

  const leftover = pool.reduce((s, p) => s + (p.amount || 0), 0);
  const capRoom = Math.max(0, collectibleCap - validTotalPaid);
  if (leftover > 0 && capRoom > 0) {
    validTotalPaid += Math.min(leftover, capRoom);
  }

  const remainingBalance = Math.max(0, invoiceEffective - initialPayment - validTotalPaid);
  const isPaidInFull = remainingBalance <= 0 || isClosed;

  if (isPaidInFull) return { amountDue: 0, missedMonths: 0, isPaidInFull: true };

  const amountDue = dueMonths.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  const missedMonths = dueMonths.length;

  if (isClosed) return { amountDue: 0, missedMonths: 0, isPaidInFull: true };
  return { amountDue, missedMonths, isPaidInFull };
}

export default function ReportingSummary() {
  const [clients, setClients] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "clients"), (snap) => {
      setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const summary = useMemo(() => {
    if (!clients) return null;

    let pastDueCount = 0;
    let totalAmountOwed = 0;
    let highBalanceCount = 0;
    let arrangementCount = 0;

    // On-hold subset of past-due
    let holdPastDueCount = 0;

    // Promises
    let totalPromisedThisMonth = 0;
    let clientsWithPromise = 0;
    let promisesMade = 0;
    let promisesFulfilled = 0;

    const aging = { "1mo": 0, "2mo": 0, "3mo": 0, "4plus": 0 };

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    clients.forEach((client) => {
      const { amountDue, missedMonths, isPaidInFull } = computeBillingSnapshot(client, now);

      const isPastDue = missedMonths > 0 && !isPaidInFull;

      if (isPastDue) {
        pastDueCount++;
        totalAmountOwed += amountDue;

        if (client?.paymentHold?.active === true) {
          holdPastDueCount++;
        }

        if (missedMonths === 1) aging["1mo"]++;
        else if (missedMonths === 2) aging["2mo"]++;
        else if (missedMonths === 3) aging["3mo"]++;
        else if (missedMonths >= 4) aging["4plus"]++;
      }

      if (amountDue > 2000) highBalanceCount++;
      if (client.paymentArrangement) arrangementCount++;

      const p = client.paymentPromise;
      if (p?.date) {
        const promiseDate = new Date(p.date);
        if (promiseDate.getMonth() === thisMonth && promiseDate.getFullYear() === thisYear) {
          totalPromisedThisMonth += parseFloat(p.amount || 0);
        }

        clientsWithPromise++;
        promisesMade++;

        const isFulfilled = (client.payments || []).some((payment) => {
          const payDate = new Date(payment.date);
          return (
            payDate <= promiseDate &&
            (parseFloat(payment.amount) || 0) >= (parseFloat(p.amount) || 0)
          );
        });

        if (isFulfilled) promisesFulfilled++;
      }
    });

    const totalClients = clients.length;
    const pastDuePercent =
      totalClients > 0 ? Math.round((pastDueCount / totalClients) * 100) : 0;

    const promiseKeptRate =
      promisesMade > 0 ? Math.round((promisesFulfilled / promisesMade) * 100) : 0;

    const pct = (count, den) => (den > 0 ? Math.round((count / den) * 100) : 0);

    // ✅ Percentages are now based on PAST DUE clients only
    const agingPct = {
      "1mo": pct(aging["1mo"], pastDueCount),
      "2mo": pct(aging["2mo"], pastDueCount),
      "3mo": pct(aging["3mo"], pastDueCount),
      "4plus": pct(aging["4plus"], pastDueCount),
    };

    // % of past due that are on hold
    const holdPastDuePct =
      pastDueCount > 0 ? Math.round((holdPastDueCount / pastDueCount) * 100) : 0;

    return {
      totalClients,
      pastDueCount,
      totalAmountOwed,
      pastDuePercent,
      highBalanceCount,
      arrangementCount,
      totalPromisedThisMonth,
      clientsWithPromise,
      promisesMade,
      promisesFulfilled,
      promiseKeptRate,
      aging,
      agingPct,
      holdPastDueCount,
      holdPastDuePct,
      lastUpdated: new Date().toISOString(),
    };
  }, [clients]);

  const fmtMoney = (n) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(Number(n || 0));

  if (clients === null) {
    return (
      <Card sx={{ borderRadius: 3, mb: 2 }}>
        <CardHeader title="Collections Summary" />
        <CardContent>
          <Grid container spacing={2}>
            {[...Array(6)].map((_, i) => (
              <Grid item xs={12} sm={6} md={3} key={i}>
                <Skeleton variant="rounded" height={96} />
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card sx={{ borderRadius: 3, mb: 2 }}>
        <CardHeader title="Collections Summary" />
        <CardContent>
          <Typography color="text.secondary">No data yet.</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      sx={{
        borderRadius: 3,
        mb: 2,
        boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
        border: "1px solid rgba(2,55,112,0.08)",
      }}
    >
      <CardHeader
        title="Collections Summary"
        subheader={
          <Typography variant="body2" color="text.secondary">
            Last updated: {new Date(summary.lastUpdated).toLocaleString()}
          </Typography>
        }
        sx={{ "& .MuiCardHeader-title": { fontWeight: 700 } }}
      />
      <CardContent>
        {/* Row 1: Core KPIs (On Hold placed next to Past Due Clients) */}
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <KpiCard
              label="Total Clients"
              value={summary.totalClients}
              color="primary"
              tooltip="Total active records in the clients collection."
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <KpiCard
              label="% Past Due"
              value={`${summary.pastDuePercent}%`}
              color={summary.pastDuePercent > 0 ? "error" : "success"}
              tooltip="% of clients with at least 1 missed month."
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <KpiCard
              label="Past Due Clients"
              value={summary.pastDueCount}
              color={summary.pastDueCount > 0 ? "error" : "success"}
              tooltip="Number of clients with amount due > $0."
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <KpiCard
              label="On Hold (of Past Due)"
              value={summary.holdPastDueCount}
              color={summary.holdPastDueCount > 0 ? "warning" : "success"}
              tooltip="Clients flagged as case on hold due to outstanding payments, counted only among current past-due clients."
              helper={`${summary.holdPastDuePct}% of ${summary.pastDueCount} past due`}
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        {/* Row 2: Money KPIs */}
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <KpiCard
              label="Total Amount Owed"
              value={fmtMoney(summary.totalAmountOwed)}
              color={summary.totalAmountOwed > 0 ? "error" : "success"}
              tooltip="Sum of missed months × per-month installment (capped by invoice total)."
            />
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <KpiCard
              label="Promised This Month"
              value={fmtMoney(summary.totalPromisedThisMonth)}
              color="primary"
              tooltip="Sum of payment promises with a promise date in the current month."
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <KpiCard
              label="Promise Kept Rate"
              value={`${summary.promiseKeptRate}%`}
              color={
                summary.promiseKeptRate >= 80
                  ? "success"
                  : summary.promiseKeptRate >= 50
                  ? "warning"
                  : "error"
              }
              tooltip="(Promises fulfilled ÷ Promises made) this month."
              helper={`${summary.promisesFulfilled} / ${summary.promisesMade}`}
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        {/* Row 3: Aging buckets */}
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Aging by Missed Months{" "}
              <Box component="span" sx={{ color: "text.disabled" }}>
                (base: {summary.pastDueCount} past due clients)
              </Box>
            </Typography>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <AgingCard
              label="1 Month"
              value={summary.aging["1mo"]}
              pct={summary.agingPct["1mo"]}
              color="warning"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <AgingCard
              label="2 Months"
              value={summary.aging["2mo"]}
              pct={summary.agingPct["2mo"]}
              color="warning"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <AgingCard
              label="3 Months"
              value={summary.aging["3mo"]}
              pct={summary.agingPct["3mo"]}
              color="error"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <AgingCard
              label="4+ Months"
              value={summary.aging["4plus"]}
              pct={summary.agingPct["4plus"]}
              color="error"
            />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

/** Small, consistent KPI card used above */
function KpiCard({ label, value, color = "primary", tooltip, helper }) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2,
        height: "100%",
        borderColor: "rgba(2,55,112,0.12)",
      }}
    >
      <CardContent>
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
          <Tooltip title={tooltip || ""} arrow disableHoverListener={!tooltip}>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              <Box
                component="span"
                sx={(t) => ({
                  color:
                    t.palette.mode === "dark"
                      ? t.palette[color]?.light || t.palette[color]?.main
                      : t.palette[color]?.main,
                })}
              >
                {value}
              </Box>
            </Typography>
          </Tooltip>
          {helper && (
            <Typography variant="caption" color="text.secondary">
              {helper}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

/** Aging bucket card using a Chip accent; shows count AND % */
function AgingCard({ label, value, pct = 0, color = "warning" }) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2,
        height: "100%",
        borderColor: "rgba(2,55,112,0.12)",
      }}
    >
      <CardContent>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
        >
          <Stack>
            <Typography variant="body2" color="text.secondary">
              {label}
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              {value}{" "}
              <Box
                component="span"
                sx={{ fontSize: 14, color: "text.secondary", fontWeight: 600 }}
              >
                ({pct}%)
              </Box>
            </Typography>
          </Stack>
          <Chip label="Past Due" color={color} variant="outlined" size="small" />
        </Stack>
      </CardContent>
    </Card>
  );
}