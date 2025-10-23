// src/ClientDashboard/BillingOverview.js
import React from "react";
import {
  Card,
  CardContent,
  Grid,
  Typography,
  Box,
  LinearProgress,
  Chip,
  Divider,
  Stack,
} from "@mui/material";
import { motion } from "framer-motion";
import PersonIcon from "@mui/icons-material/Person";
import BalanceIcon from "@mui/icons-material/Gavel";
import StatusIcon from "@mui/icons-material/Info";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import PaidIcon from "@mui/icons-material/Paid";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

export default function BillingOverview({ client }) {
  const status = client?.status || "active"; // "active" | "paused" | "closed"
  const isPaused = status === "paused";
  const isClosed = status === "closed";

  // ---------- helpers ----------
  const toDate = (raw) =>
    raw?.seconds ? new Date(raw.seconds * 1000) : new Date(raw);
  const money = (n) =>
    `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
  const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
  const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  const labelFor = (d) =>
    `${d.toLocaleString("default", { month: "long" })} ${d.getFullYear()}`;

  // ---------- base data ----------
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
  const upfrontOnlyTotal = adjustments.reduce((sum, a) => {
    const applyTo = (a?.applyTo || "balance").toLowerCase();
    const amt = Number(a?.amount || 0);
    return applyTo === "upfront_only" ? sum + amt : sum;
  }, 0);
  const invoiceEffective = Math.max(0, invoiceBase + adjToBalanceTotal);

  const initialPayment = parseFloat(client?.initialPaymentAmount || 0);
  const allPayments = client?.payments || [];
  const rawStart = client.firstInstallmentDate;

  // ✅ Keep hooks here (before any conditional return)
  const [error, setError] = React.useState(null);

  // If no start date, mark error but still return after hooks
  React.useEffect(() => {
    if (!rawStart) setError("Missing first installment date.");
    else setError(null);
  }, [rawStart]);

  // ---------- schedule + logic ----------
  const expectedAnchor = client.expectedAnchor
    ? new Date(client.expectedAnchor)
    : null;
  const anchorDate = expectedAnchor || toDate(rawStart || new Date());
  const firstDueDate = new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    15
  );

  const today = new Date();
  const pauseStartedAt = client.pauseStartedAt
    ? toDate(client.pauseStartedAt)
    : null;

  const skipSet = new Set((client.skipMonths || []).map(String));
  const monthIsSkipped = (d) => skipSet.has(ymKey(d));

  const schedule = (client.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const getInstallmentAmountForDate = (date) => {
    for (const s of schedule) {
      const sStart = new Date(s.start);
      const sEnd = new Date(s.end);
      if (date >= sStart && date <= sEnd) return Number(s.amount);
    }
    return 500; // default
  };

  const paymentsAfterInitial = allPayments.filter(
    (p) => new Date(p.date) > new Date(client.initialPaymentDate)
  );
  const paymentPool = paymentsAfterInitial.map((p) => ({
    amount: Number(p.amount),
    date: p.date,
  }));

  // build months up to cutoff
  const monthsUpToCutoff = [];
  if (!isClosed) {
    const cutoff =
      isPaused && pauseStartedAt
        ? new Date(
            pauseStartedAt.getFullYear(),
            pauseStartedAt.getMonth(),
            pauseStartedAt.getDate() >= 15 ? 15 : 14
          )
        : today;

    const cursor = new Date(firstDueDate);
    while (cursor <= cutoff) {
      if (!monthIsSkipped(cursor)) monthsUpToCutoff.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // apply FIFO to past months
  let validTotalPaid = 0;
  const dueMonths = [];
  for (const monthDate of monthsUpToCutoff) {
    const amountDue = getInstallmentAmountForDate(monthDate);
    let monthPaid = 0;
    for (const p of paymentPool) {
      if (p.amount <= 0) continue;
      if (monthPaid >= amountDue) break;
      const used = Math.min(amountDue - monthPaid, p.amount);
      monthPaid += used;
      validTotalPaid += used;
      p.amount -= used;
    }
    if (monthPaid < amountDue) {
      dueMonths.push({ label: labelFor(monthDate), amount: amountDue });
    }
  }

  // handle future prepayments
  if (!isClosed && !isPaused) {
    let leftover = paymentPool.reduce((s, p) => s + (p.amount || 0), 0);
    if (leftover > 0) {
      const futureCursor = new Date(today);
      futureCursor.setDate(15);
      if (futureCursor <= today) futureCursor.setMonth(futureCursor.getMonth() + 1);
      let guard = 0;
      while (leftover > 0 && guard < 60) {
        if (monthIsSkipped(futureCursor)) {
          futureCursor.setMonth(futureCursor.getMonth() + 1);
          guard++;
          continue;
        }
        const amt = getInstallmentAmountForDate(futureCursor);
        const use = Math.min(amt, leftover);
        validTotalPaid += use;
        leftover -= use;
        futureCursor.setMonth(futureCursor.getMonth() + 1);
        guard++;
      }
    }
  }

  const amountDue = isClosed
    ? 0
    : dueMonths.reduce((sum, m) => sum + m.amount, 0);

  const computedRemaining = Math.max(
    0,
    invoiceEffective - initialPayment - validTotalPaid
  );
  const remainingBalance = isClosed ? 0 : computedRemaining;

  // find first unpaid month
  const simPool = paymentsAfterInitial.map((p) => ({
    amount: Number(p.amount),
    date: p.date,
  }));
  const monthIsFullyPaid = (d, pool) => {
    if (monthIsSkipped(d)) return true;
    const due = getInstallmentAmountForDate(d);
    let paid = 0;
    for (const p of pool) {
      if (p.amount <= 0) continue;
      const take = Math.min(due - paid, p.amount);
      paid += take;
      p.amount -= take;
      if (paid >= due) break;
    }
    return paid >= due;
  };
  const firstUnpaid = new Date(firstDueDate);
  let guardSim = 0;
  while (
    !isClosed &&
    !isPaused &&
    guardSim < 120 &&
    monthIsFullyPaid(firstUnpaid, simPool)
  ) {
    firstUnpaid.setMonth(firstUnpaid.getMonth() + 1);
    guardSim++;
  }

  // project future months
  const futureMonths = [];
  if (!isClosed && !isPaused && remainingBalance > 0) {
    let futureStartDate = new Date(firstUnpaid);
    const cutoff = new Date(futureStartDate);
    cutoff.setFullYear(cutoff.getFullYear() + 3);
    let futureAccum = 0;
    let guard = 0;
    while (
      futureStartDate <= cutoff &&
      futureAccum < remainingBalance &&
      futureMonths.length < 48 &&
      guard < 60
    ) {
      if (monthIsSkipped(futureStartDate)) {
        futureStartDate.setMonth(futureStartDate.getMonth() + 1);
        guard++;
        continue;
      }
      const amt = getInstallmentAmountForDate(futureStartDate);
      futureMonths.push({ label: labelFor(futureStartDate), amount: amt });
      futureAccum += amt;
      futureStartDate.setMonth(futureStartDate.getMonth() + 1);
      guard++;
    }
  }

  // ✅ useMemo always runs
  const expectedSegments = React.useMemo(() => {
    if (!futureMonths.length) return [];
    const segs = [];
    let startIdx = 0;
    for (let i = 1; i <= futureMonths.length; i++) {
      const prev = futureMonths[i - 1];
      const curr = futureMonths[i];
      const breakHere = !curr || curr.amount !== prev.amount;
      if (breakHere) {
        const slice = futureMonths.slice(startIdx, i);
        const from = slice[0].label;
        const to = slice[slice.length - 1].label;
        const amount = slice[0].amount;
        segs.push({
          from,
          to,
          amount,
          count: slice.length,
          monthsList: slice.map((m) => m.label),
        });
        startIdx = i;
      }
    }
    return segs;
  }, [futureMonths]);

  // ✅ now safe to return (hooks above)
  if (error) return <Typography color="error">{error}</Typography>;

  // ---------- UI ----------
  const getLastPaymentDisplay = () => {
    if (!allPayments.length) return "N/A";
    const latest = allPayments.reduce((latest, p) =>
      new Date(p.date) > new Date(latest.date) ? p : latest
    );
    const dateStr = new Date(latest.date).toLocaleDateString("default", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return `${dateStr} – $${Number(latest.amount).toLocaleString()}`;
  };

  const rows = [
    { label: "Name", value: `${client.firstName} ${client.lastName}`, icon: <PersonIcon /> },
    { label: "Case Type", value: client.caseType, icon: <BalanceIcon /> },
    { label: "Case Status", value: client.caseStatus, icon: <StatusIcon /> },
    { label: "Invoice Total (Base)", value: money(invoiceBase), icon: <AttachMoneyIcon /> },
    { label: "Adj. to Balance (±)", value: money(adjToBalanceTotal), icon: <AttachMoneyIcon /> },
    { label: "Invoice Total (Effective)", value: money(invoiceEffective), icon: <AttachMoneyIcon /> },
    { label: "Initial Payment", value: money(initialPayment), icon: <PaidIcon /> },
    { label: "Total Paid (Installments Only)", value: money(validTotalPaid), icon: <PaidIcon /> },
    { label: "Remaining Balance", value: money(remainingBalance), icon: <AttachMoneyIcon /> },
    { label: "Payments Left", value: isClosed ? 0 : futureMonths.length, icon: <CalendarMonthIcon /> },
    { label: "Amount Due", value: money(amountDue), icon: <AttachMoneyIcon /> },
    {
      label: "Months Past Due",
      value: isClosed ? "None" : (dueMonths.length || "None"),
      icon: <CalendarMonthIcon />,
    },
    {
      label: "Missed Months",
      value:
        isClosed || !dueMonths.length
          ? "None"
          : `${dueMonths[0].label} – ${dueMonths[dueMonths.length - 1].label}`,
      icon: <CalendarMonthIcon />,
    },
    { label: "Last Payment", value: getLastPaymentDisplay(), icon: <AccessTimeIcon /> },
  ];

  const progress =
    invoiceEffective > 0
      ? ((initialPayment + validTotalPaid) / invoiceEffective) * 100
      : 0;
  const statusColor = isClosed ? "default" : isPaused ? "warning" : "success";

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <Card elevation={3} sx={{ borderRadius: 3, mb: 4 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="h6" fontWeight="bold">
              Billing Overview
            </Typography>
            <Chip
              label={status.toUpperCase()}
              color={statusColor}
              variant={isPaused ? "filled" : "outlined"}
              size="small"
            />
          </Box>

          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Payment Progress (vs Effective Invoice Total)
            </Typography>
            <Box display="flex" alignItems="center" gap={2}>
              <Box sx={{ flexGrow: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={Math.max(0, Math.min(100, progress))}
                  sx={{ height: 10, borderRadius: 5 }}
                />
              </Box>
              <Typography variant="body2" fontWeight="bold">
                {Math.round(Math.max(0, Math.min(100, progress)))}%
              </Typography>
            </Box>
          </Box>

          <Grid container spacing={2}>
            {rows.map((row, index) => (
              <Grid item xs={12} sm={6} key={index}>
                <Box
                  display="flex"
                  alignItems="flex-start"
                  gap={1.5}
                  p={1}
                  borderRadius={2}
                  sx={{
                    transition: "0.2s",
                    "&:hover": {
                      backgroundColor: "#f9f9f9",
                      transform: "translateY(-2px)",
                      boxShadow: 2,
                    },
                  }}
                >
                  <Box color="primary.main" mt={0.5}>
                    {row.icon}
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      {row.label}
                    </Typography>
                    <Typography variant="body1" fontWeight="500">
                      {row.value}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>

          {/* ===== Compact Expected Due Schedule ===== */}
          {!isClosed && !isPaused && expectedSegments.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Expected Due Schedule
              </Typography>
              <Stack spacing={0.8}>
                {expectedSegments.map((seg, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr auto auto", sm: "1fr auto auto" },
                      gap: 1,
                      alignItems: "center",
                      p: 1,
                      borderRadius: 1.5,
                      bgcolor: "background.default",
                      border: "1px solid",
                      borderColor: "divider",
                    }}
                    title={seg.monthsList.join(", ")}
                  >
                    <Typography variant="body2">
                      {seg.from === seg.to ? seg.from : `${seg.from} – ${seg.to}`}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      ${seg.amount.toLocaleString()}/mo
                    </Typography>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`${seg.count} mo`}
                      sx={{ ml: "auto" }}
                    />
                  </Box>
                ))}
              </Stack>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}