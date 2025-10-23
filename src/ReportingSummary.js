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

/* ==================== Billing math (mirrors ClientList) ==================== */
const toDate = (raw) => (raw?.seconds ? new Date(raw.seconds * 1000) : new Date(raw));
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

/**
 * Unified snapshot per client — same rules as ClientList:
 * - 15th rule (include current month only if today >= 15)
 * - DO NOT truncate months on pause for past-due (pause affects future projection only)
 * - skipMonths respected
 * - Anchor for past-due is ALWAYS firstInstallmentDate (NOT expectedAnchor)
 * - FIFO allocation of payments AFTER initialPaymentDate
 * - variable installmentSchedule amounts
 */
function computeBillingSnapshot(client, now = new Date()) {
  const status = client?.status || "active"; // "active" | "paused" | "closed"
  const isClosed = status === "closed";

  // 🔁 Anchor for past-due: ALWAYS original start (not expectedAnchor)
  if (!client.firstInstallmentDate) {
    return { amountDue: 0, missedMonths: 0 };
  }
  const planStart = toDate(client.firstInstallmentDate);
  if (!planStart || isNaN(planStart)) {
    return { amountDue: 0, missedMonths: 0 };
  }

  // All due dates on the 15th of each month
  const firstDueDate = new Date(planStart.getFullYear(), planStart.getMonth(), 15);

  // ⛔️ Do NOT truncate on pause for past-due; use "now" so 15th rule applies naturally
  const cutoff = now;

  // Skip months
  const skipSet = new Set((client.skipMonths || []).map(String));
  const monthIsSkipped = (d) => skipSet.has(ymKey(d));

  // Build (sorted) schedule
  const schedule = (client.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  // Build list of billable due months up to cutoff
  const monthsUpToCutoff = [];
  if (!isClosed) {
    const cursor = new Date(firstDueDate);
    // include current month only if today >= 15 (natural via date comparison)
    while (cursor <= cutoff) {
      if (!monthIsSkipped(cursor)) monthsUpToCutoff.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // Payments AFTER initialPaymentDate (FIFO)
  const allPayments = client?.payments || [];
  const initialPaymentDate = client?.initialPaymentDate ? new Date(client.initialPaymentDate) : null;
  const paymentsAfterInitial = initialPaymentDate
    ? allPayments.filter((p) => new Date(p.date) > initialPaymentDate)
    : allPayments.slice();

  const pool = paymentsAfterInitial.map((p) => ({
    amount: Number(p.amount || 0),
    date: p.date,
  }));

  // Allocate oldest-first across the past months
  let totalDue = 0;
  let missedMonths = 0;

  for (const monthDate of monthsUpToCutoff) {
    const monthAmt = getInstallmentAmountForDate(schedule, monthDate);
    let monthPaid = 0;

    for (const p of pool) {
      if (p.amount <= 0) continue;
      if (monthPaid >= monthAmt) break;
      const used = Math.min(monthAmt - monthPaid, p.amount);
      monthPaid += used;
      p.amount -= used;
    }

    if (monthPaid < monthAmt) {
      totalDue += monthAmt;
      missedMonths += 1;
    }
  }

  if (isClosed) return { amountDue: 0, missedMonths: 0 };
  return { amountDue: totalDue, missedMonths };
}

export default function ReportingSummary() {
  const [clients, setClients] = useState(null); // null = loading; [] = loaded but empty

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

    // Promise metrics
    let totalPromisedThisMonth = 0;
    let clientsWithPromise = 0;
    let promisesMade = 0;
    let promisesFulfilled = 0;

    // Aging buckets by number of missed months
    const aging = { "1mo": 0, "2mo": 0, "3mo": 0, "4plus": 0 };

    // Denominator for aging %: clients we could compute a snapshot for
    let agingDenominator = 0;

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    clients.forEach((client) => {
      const { amountDue, missedMonths } = computeBillingSnapshot(client, now);
      const snapshotValid = client.firstInstallmentDate; // anchor is original start

      if (snapshotValid) agingDenominator++;

      if (missedMonths > 0) {
        pastDueCount++;
        totalAmountOwed += amountDue;

        if (missedMonths === 1) aging["1mo"]++;
        else if (missedMonths === 2) aging["2mo"]++;
        else if (missedMonths === 3) aging["3mo"]++;
        else if (missedMonths >= 4) aging["4plus"]++;
      }

      if (amountDue > 2000) highBalanceCount++;
      if (client.paymentArrangement) arrangementCount++;

      // Promises (unchanged)
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

    const agingPct = {
      "1mo": pct(aging["1mo"], agingDenominator),
      "2mo": pct(aging["2mo"], agingDenominator),
      "3mo": pct(aging["3mo"], agingDenominator),
      "4plus": pct(aging["4plus"], agingDenominator),
    };

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
      agingDenominator,
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
    // Loading skeleton (matches your clean card style)
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

  // In case there are no clients yet
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
        {/* Row 1: Core KPIs */}
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
              label="Total Amount Owed"
              value={fmtMoney(summary.totalAmountOwed)}
              color={summary.totalAmountOwed > 0 ? "error" : "success"}
              tooltip="Sum of missed months × per-month installment for all past-due clients."
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        {/* Row 2: Promises */}
        <Grid container spacing={2}>
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

        {/* Row 3: Aging buckets by missed months (with %) */}
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Aging by Missed Months{" "}
              <Box component="span" sx={{ color: "text.disabled" }}>
                (base: {summary.agingDenominator} clients with valid start date/anchor)
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
                  textShadow:
                    t.palette.mode === "dark"
                      ? "0 0 0.6px rgba(255,255,255,0.6)"
                      : "none",
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

/** Aging bucket card using a Chip accent; now shows count AND % */
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