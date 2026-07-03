import React, { useMemo, useState } from "react";
import {
  Card,
  CardHeader,
  CardContent,
  Box,
  Stack,
  TextField,
  MenuItem,
  Button,
  Divider,
  Chip,
  Tooltip,
  IconButton,
  ToggleButtonGroup,
  ToggleButton,
  useTheme,
  alpha,
  Typography,
} from "@mui/material";
import * as XLSX from "xlsx";
import DownloadIcon from "@mui/icons-material/Download";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import DensitySmallIcon from "@mui/icons-material/DensitySmall";
import DensityMediumIcon from "@mui/icons-material/DensityMedium";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

// ✅ Headline & chart still use your fixed utility
import { computeCollectionsByPeriod } from "./utils/collectionsCompute";

import CollectionsSummary from "./components/CollectionsSummary";
import CollectionsPeriodChart from "./components/CollectionsPeriodChart";
import {
  ByPeriodTable,
  ByCaseTypeTable,
  ByClientTable,
} from "./components/CollectionsTables";

const GROUPINGS = ["Day", "Week", "Month"];

// ✅ Updated quick filters: MTD, Last 3 Months, YTD
const QUICK = [
  { key: "MTD", label: "MTD" },
  { key: "L3M", label: "Last 3 Months" },
  { key: "YTD", label: "YTD" },
];

const money = (n) => `$${Number(n || 0).toLocaleString()}`;

// Aging buckets definition (days past due)
const AGING_BUCKETS_DEF = [
  { key: "0-30", label: "0–30 days", min: 0, max: 30 },
  { key: "31-60", label: "31–60 days", min: 31, max: 60 },
  { key: "61-90", label: "61–90 days", min: 61, max: 90 },
  { key: "90+", label: "90+ days", min: 91, max: Infinity },
];

const DUE_DAY = 15;

/** Small helper */
const Section = ({ title, subtitle, children, action }) => (
  <Card sx={{ borderRadius: 3 }}>
    <CardHeader
      title={title}
      subheader={subtitle}
      sx={{
        "& .MuiCardHeader-title": { fontWeight: 700 },
        "& .MuiCardHeader-subheader": { color: "text.secondary" },
        pb: 0,
      }}
      action={action || null}
    />
    <CardContent>{children}</CardContent>
  </Card>
);

// Compact AR aging visual
function AgingBucketsStrip({ rows = [] }) {
  if (!rows.length) {
    return (
      <Box sx={{ color: "text.secondary", fontSize: 14, py: 1 }}>
        No past-due amounts in this range.
      </Box>
    );
  }

  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={2}
      sx={{ mt: 1 }}
    >
      {rows.map((r) => (
        <Box
          key={r.key}
          sx={{
            flex: 1,
            p: 1.5,
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "background.default",
          }}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: 0.5 }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {r.label}
            </Typography>
            <Chip
              size="small"
              label={r.clients === 1 ? "1 client" : `${r.clients || 0} clients`}
              variant="outlined"
            />
          </Stack>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {money(r.remaining)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Remaining • Expected {money(r.expected)} • Collected {money(r.actual)}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

/* ======================
   ReportingSummary-aligned snapshot (for AR Aging alignment)
   - Uses "as of today"
   - Produces: amountDue, missedMonths, oldestUnpaidDueDate, isPaidInFull
   ====================== */
function computeBillingSnapshotAligned(client, now = new Date()) {
  const status = (client?.status || "active").toLowerCase();
  const isClosed = status === "closed";
  const isPaused = status === "paused";

  const toDateSafe = (v) =>
    v?.toDate?.() ? v.toDate() : isNaN(new Date(v)) ? null : new Date(v);

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

  if (!client?.firstInstallmentDate) {
    const remainingBalance = Math.max(0, invoiceEffective - initialPayment);
    const isPaidInFull = remainingBalance <= 0 || isClosed;
    return { amountDue: 0, missedMonths: 0, oldestUnpaidDueDate: null, isPaidInFull };
  }

  const planStart = toDateSafe(client.firstInstallmentDate);
  if (!planStart || isNaN(planStart)) {
    const remainingBalance = Math.max(0, invoiceEffective - initialPayment);
    const isPaidInFull = remainingBalance <= 0 || isClosed;
    return { amountDue: 0, missedMonths: 0, oldestUnpaidDueDate: null, isPaidInFull };
  }

  const firstDueDate = new Date(planStart.getFullYear(), planStart.getMonth(), DUE_DAY);

  const pauseStartedAt = client?.pauseStartedAt ? toDateSafe(client.pauseStartedAt) : null;
  const cutoff =
    isPaused && pauseStartedAt
      ? new Date(
          pauseStartedAt.getFullYear(),
          pauseStartedAt.getMonth(),
          pauseStartedAt.getDate() >= DUE_DAY ? DUE_DAY : DUE_DAY - 1
        )
      : now;

  const skipSet = new Set((client?.skipMonths || []).map(String));
  const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
  const ymKeyLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  const monthIsSkipped = (d) => skipSet.has(ymKeyLocal(d));

  const schedule = (client?.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const getInstallmentAmountForDate = (date) => {
    if (!Array.isArray(schedule) || schedule.length === 0) return 500;
    for (let i = 0; i < schedule.length; i++) {
      const s = schedule[i];
      const sStart = new Date(s.start);
      const sEnd = new Date(s.end);
      if (date >= sStart && date <= sEnd) return Number(s.amount || 500);
    }
    return 500;
  };

  const monthsUpToCutoff = [];
  if (!isClosed) {
    const cursor = new Date(firstDueDate);
    let expectedAccum = 0;

    while (cursor <= cutoff) {
      if (!monthIsSkipped(cursor)) {
        const amt = getInstallmentAmountForDate(cursor);

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
  let oldestUnpaidDueDate = null;

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
      if (!oldestUnpaidDueDate) oldestUnpaidDueDate = new Date(monthDate);
    }
  }

  const leftover = pool.reduce((s, p) => s + (p.amount || 0), 0);
  const capRoom = Math.max(0, collectibleCap - validTotalPaid);
  if (leftover > 0 && capRoom > 0) {
    validTotalPaid += Math.min(leftover, capRoom);
  }

  const remainingBalance = Math.max(0, invoiceEffective - initialPayment - validTotalPaid);
  const isPaidInFull = remainingBalance <= 0 || isClosed;

  if (isPaidInFull) {
    return { amountDue: 0, missedMonths: 0, oldestUnpaidDueDate: null, isPaidInFull: true };
  }

  const amountDue = dueMonths.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  const missedMonths = dueMonths.length;

  if (isClosed) {
    return { amountDue: 0, missedMonths: 0, oldestUnpaidDueDate: null, isPaidInFull: true };
  }

  return { amountDue, missedMonths, oldestUnpaidDueDate, isPaidInFull: false };
}

export default function CollectionsReport({ clients = [] }) {
  const theme = useTheme();
  const [from, setFrom] = useState(() => toYMD(startOfMonth(new Date())));
  const [to, setTo] = useState(() => toYMD(new Date()));
  const [groupBy, setGroupBy] = useState("Month"); // chart stays monthly for now
  const [caseType, setCaseType] = useState("Any");
  const [caseStatus, setCaseStatus] = useState("Any");
  const [billingStatus, setBillingStatus] = useState("Any");
  const [dense, setDense] = useState(true);

  const caseTypes = useMemo(() => {
    const set = new Set();
    clients.forEach((c) => c.caseType && set.add(c.caseType));
    return ["Any", ...Array.from(set)];
  }, [clients]);

  const filteredClients = useMemo(() => {
    return (clients || []).filter((c) => {
      if (caseType !== "Any" && (c.caseType || "") !== caseType) return false;
      if (caseStatus !== "Any" && (c.caseStatus || "") !== caseStatus)
        return false;

      if (billingStatus !== "Any") {
        const s = (c.billingStatus || c.status || "active").toLowerCase();
        if (billingStatus.toLowerCase() !== s) return false;
      }
      return true;
    });
  }, [clients, caseType, caseStatus, billingStatus]);

  const computed = useMemo(() => {
    const start = startOfMonth(parseYMD(from));
    const end = startOfMonth(parseYMD(to)); // computeCollectionsByPeriod expects month boundaries
    return computeCollectionsByPeriod(filteredClients, start, end);
  }, [filteredClients, from, to]);

  const { byClientRows, byCaseTypeRows, agingBuckets, actionListRows } =
    useMemo(() => {
      const rangeStart = startOfMonth(parseYMD(from));
      const rangeEnd = parseYMD(to);
      const asOf = new Date();

      const byClient = [];
      const byCaseTypeAcc = new Map();

      const bucketAgg = new Map();
      AGING_BUCKETS_DEF.forEach((b) => {
        bucketAgg.set(b.key, {
          ...b,
          expected: 0,
          actual: 0,
          remaining: 0,
          clientsSet: new Set(),
        });
      });

      for (const c of filteredClients) {
        const alloc = allocateClientByDueMonth(c, rangeStart, rangeEnd, asOf);

        let expected = 0;
        let collected = 0;

        for (const [ym, rec] of alloc.months.entries()) {
          const recExpected = Number(rec.expected || 0);
          const recCollected = Number(rec.collected || 0);

          if (monthInRange(ym, rangeStart, rangeEnd)) {
            expected += recExpected;
            collected += recCollected;
          }
        }

        const variance = expected - collected;

        const snap = computeBillingSnapshotAligned(c, asOf);
        const isPastDueAligned = snap.missedMonths > 0 && !snap.isPaidInFull;
        const clientPastDueTotal = isPastDueAligned ? Number(snap.amountDue || 0) : 0;

        if (isPastDueAligned && snap.oldestUnpaidDueDate) {
          const daysDiff = Math.floor(
            (asOf.getTime() - snap.oldestUnpaidDueDate.getTime()) /
              (1000 * 60 * 60 * 24)
          );

          if (!isNaN(daysDiff) && daysDiff >= 0) {
            const bucketDef = AGING_BUCKETS_DEF.find(
              (b) => daysDiff >= b.min && daysDiff <= b.max
            );
            if (bucketDef) {
              const agg = bucketAgg.get(bucketDef.key);
              agg.clientsSet.add(c.id);

              const due = Number(snap.amountDue || 0);
              agg.expected += due;
              agg.actual += 0;
              agg.remaining += due;
            }
          }
        }

        byClient.push({
          id: c.id,
          name: `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.id,
          caseType: c.caseType || "—",
          status: (c.billingStatus || c.status || "active").toLowerCase(),
          expected,
          actual: collected,
          variance,
          lastPaymentDate: lastPaymentDate(c),
          totalPastDue: clientPastDueTotal,
        });

        const key = c.caseType || "—";
        const prev =
          byCaseTypeAcc.get(key) || {
            caseType: key,
            expected: 0,
            actual: 0,
            variance: 0,
            clients: 0,
          };
        prev.expected += expected;
        prev.actual += collected;
        prev.variance = prev.expected - prev.actual;
        prev.clients += 1;
        byCaseTypeAcc.set(key, prev);
      }

      byClient.sort(
        (a, b) => b.expected - b.actual - (a.expected - a.actual)
      );
      const byCaseType = Array.from(byCaseTypeAcc.values()).sort(
        (a, b) => b.expected - a.expected
      );

      const agingBucketsArr = Array.from(bucketAgg.values())
        .map((b) => ({
          key: b.key,
          label: b.label,
          expected: b.expected,
          actual: b.actual,
          remaining: b.remaining,
          clients: b.clientsSet.size,
        }))
        .filter((b) => b.expected > 0 || b.remaining > 0);

      const actionList = byClient
        .filter((r) => r.totalPastDue > 0)
        .sort((a, b) => b.totalPastDue - a.totalPastDue)
        .slice(0, 20);

      return {
        byClientRows: byClient,
        byCaseTypeRows: byCaseType,
        agingBuckets: agingBucketsArr,
        actionListRows: actionList,
      };
    }, [filteredClients, from, to]);

  const data = useMemo(() => {
    const rows = (computed?.rows || []).map((r) => ({
      label: r.label,
      expected: r.expected,
      actual: r.collected,
      variance: r.variance,
      ratePct: r.collectionRate,
      excess: r.excessCollected,
    }));

    const totals = computed?.totals || {
      expected: 0,
      collected: 0,
      variance: 0,
      excessCollected: 0,
      collectionRate: 0,
    };

    return {
      byPeriod: rows,
      byCaseType: byCaseTypeRows.map((r) => ({
        ...r,
        ratePct: r.expected > 0 ? Math.min(100, (r.actual / r.expected) * 100) : 0,
      })),
      byClient: byClientRows.map((r) => ({
        ...r,
        ratePct: r.expected > 0 ? Math.min(100, (r.actual / r.expected) * 100) : 0,
      })),
      agingBuckets,
      actionList: actionListRows,
      totals: {
        expected: totals.expected,
        actual: totals.collected,
        variance: totals.variance,
        ratePct: totals.collectionRate,
        excess: totals.excessCollected,
      },
    };
  }, [computed, byCaseTypeRows, byClientRows, agingBuckets, actionListRows]);

  const exportGrid = () => {
    const wb = XLSX.utils.book_new();

    const sumSheet = XLSX.utils.json_to_sheet([
      {
        From: from,
        To: to,
        "Expected (Range)": data?.totals?.expected || 0,
        "Actual (Range)": data?.totals?.actual || 0,
        Variance: data?.totals?.variance || 0,
        "Collection Rate % (capped)": data?.totals?.ratePct || 0,
        "Excess Collected": data?.totals?.excess || 0,
      },
    ]);
    XLSX.utils.book_append_sheet(wb, sumSheet, "Summary");

    const byPeriod = (data?.byPeriod || []).map((r) => ({
      Period: r.label,
      Expected: r.expected,
      Actual: r.actual,
      Variance: r.variance,
      "Rate % (capped)": r.ratePct,
      "Excess Collected": r.excess,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byPeriod), "ByPeriod");

    const byCT = (data?.byCaseType || []).map((r) => ({
      "Case Type": r.caseType || "—",
      Expected: r.expected,
      Actual: r.actual,
      Variance: r.variance,
      "Rate % (capped)": r.ratePct,
      Clients: r.clients,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byCT), "ByCaseType");

    const byClient = (data?.byClient || []).map((r) => ({
      Client: r.name,
      "Case Type": r.caseType || "—",
      Billing: (r.status || "active").toUpperCase(),
      Expected: r.expected,
      Actual: r.actual,
      Variance: r.variance,
      "Rate % (capped)": r.ratePct,
      "Last Payment": r.lastPaymentDate || "—",
      "Client ID": r.id,
      "Total Past Due": r.totalPastDue || 0,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byClient), "ByClient");

    XLSX.writeFile(wb, `collections_${from}_${to}.xlsx`);
  };

  const applyQuick = (key) => {
    const d = new Date();

    if (key === "MTD") {
      setFrom(toYMD(startOfMonth(d)));
      setTo(toYMD(d));
    } else if (key === "L3M") {
      const start3 = new Date(d.getFullYear(), d.getMonth() - 2, 1);
      setFrom(toYMD(start3));
      setTo(toYMD(d));
    } else if (key === "YTD") {
      const jan1 = new Date(d.getFullYear(), 0, 1);
      setFrom(toYMD(jan1));
      setTo(toYMD(d));
    }
  };

  const headerBg = `linear-gradient(90deg, ${alpha(
    theme.palette.primary.main,
    0.08
  )}, ${alpha(theme.palette.secondary.main, 0.08)})`;

  return (
    <Card sx={{ borderRadius: 3 }}>
      <Box
        sx={{
          px: 3,
          py: 2,
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          background: headerBg,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Stack
          direction={{ xs: "column", lg: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", lg: "center" }}
        >
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box component="span" sx={{ fontWeight: 800, fontSize: 18 }}>
                Collections
              </Box>
              <Tooltip title="Payments are allocated to the original due month (oldest-first). Rate is capped at 100%.">
                <InfoOutlinedIcon fontSize="small" color="action" />
              </Tooltip>
            </Box>
            <Box sx={{ color: "text.secondary", fontSize: 13 }}>
              Cash received vs expected installments for the selected period.
            </Box>
          </Box>

          <Box flexGrow={1} />

          <Stack direction="row" spacing={1} flexWrap="wrap">
            {QUICK.map((q) => (
              <Chip
                key={q.key}
                size="small"
                label={q.label}
                onClick={() => applyQuick(q.key)}
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            ))}
          </Stack>
        </Stack>
      </Box>

      <CardContent sx={{ pt: 2 }}>
        <Section
          title="Filters"
          subtitle="Pick a date range and narrow by attributes"
          action={
            <Stack direction="row" spacing={1} alignItems="center">
              <Tooltip title={dense ? "Comfortable density" : "Compact density"}>
                <IconButton onClick={() => setDense((d) => !d)} size="small">
                  {dense ? <DensityMediumIcon /> : <DensitySmallIcon />}
                </IconButton>
              </Tooltip>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={exportGrid}
                size="small"
              >
                Export XLSX
              </Button>
            </Stack>
          }
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            alignItems={{ xs: "stretch", md: "center" }}
          >
            <TextField
              label="From"
              type="date"
              size="small"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 160 }}
            />
            <TextField
              label="To"
              type="date"
              size="small"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 160 }}
            />

            <TextField
              select
              label="Group By"
              size="small"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              sx={{ minWidth: 140 }}
            >
              {GROUPINGS.map((g) => (
                <MenuItem key={g} value={g}>
                  {g}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Case Type"
              size="small"
              value={caseType}
              onChange={(e) => setCaseType(e.target.value)}
              sx={{ minWidth: 180 }}
            >
              {caseTypes.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Case Status"
              size="small"
              value={caseStatus}
              onChange={(e) => setCaseStatus(e.target.value)}
              sx={{ minWidth: 160 }}
            >
              {["Any", "ACTIVE", "FILED", "APPROVED"].map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Billing Status"
              size="small"
              value={billingStatus}
              onChange={(e) => setBillingStatus(e.target.value)}
              sx={{ minWidth: 160 }}
            >
              {["Any", "Active", "Paused", "Closed"].map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>

            <Box flexGrow={1} />

            <ToggleButtonGroup
              exclusive
              size="small"
              value={dense ? "compact" : "cozy"}
              onChange={(_, v) => v && setDense(v === "compact")}
              sx={{ alignSelf: { xs: "flex-start", md: "center" } }}
            >
              <ToggleButton value="compact">
                <DensitySmallIcon fontSize="small" />
              </ToggleButton>
              <ToggleButton value="cozy">
                <DensityMediumIcon fontSize="small" />
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Section>

        <Divider sx={{ my: 2 }} />

        <CollectionsSummary totals={data?.totals} />

        <Divider sx={{ my: 2 }} />

        <CollectionsPeriodChart byPeriod={data?.byPeriod || []} />

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: "grid", gap: 2 }}>
          <Section title="By Period" subtitle="Expected vs Actual by month">
            <ByPeriodTable rows={data?.byPeriod || []} dense={dense} />
          </Section>

          <Section title="By Case Type" subtitle="Rollup by case category">
            <ByCaseTypeTable rows={data?.byCaseType || []} dense={dense} />
          </Section>

          {/* ✅ AR Aging Buckets UI hidden (logic kept) */}

          <Section
            title="Collections Action List"
            subtitle="Top clients with past-due balances to prioritize follow-up"
            action={
              <Button
                size="small"
                startIcon={<FilterAltIcon />}
                variant="text"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              >
                Adjust Filters
              </Button>
            }
          >
            <ByClientTable rows={data?.actionList || []} dense={dense} />
          </Section>
        </Box>
      </CardContent>
    </Card>
  );
}

/* ======================
   Per-client allocation (CANONICAL / CAP-AWARE / OPTION #1 paused)
   ====================== */

function allocateClientByDueMonth(client, rangeStart, rangeEnd, asOf) {
  const status = (client.billingStatus || client.status || "active").toLowerCase();
  const isClosed = status === "closed";
  if (isClosed) return { months: new Map() };

  // ✅ OPTION #1 alignment: paused contributes nothing
  if (status === "paused") return { months: new Map() };

  const toDateSafe = (v) =>
    v?.toDate?.() ? v.toDate() : isNaN(new Date(v)) ? null : new Date(v);

  const firstInstallmentDate = toDateSafe(client.firstInstallmentDate);
  if (!firstInstallmentDate) return { months: new Map() };

  function computeInvoiceEffective(c) {
    const base = Number(c?.invoiceTotal || 0);
    const adjustments = Array.isArray(c?.invoiceAdjustments) ? c.invoiceAdjustments : [];
    const adjToBalanceTotal = adjustments.reduce((sum, a) => {
      const applyTo = (a?.applyTo || "balance").toLowerCase();
      const amt = Number(a?.amount || 0);
      const dp = Number(a?.downPayment || 0);
      return applyTo === "balance" ? sum + (amt - dp) : sum;
    }, 0);
    return Math.max(0, base + adjToBalanceTotal);
  }

  function getCollectibleCap(c) {
    const invoiceEffective = computeInvoiceEffective(c);
    const initialPayment = Number(c?.initialPaymentAmount || 0);
    return Math.max(0, invoiceEffective - initialPayment);
  }

  const collectibleCap = getCollectibleCap(client);
  if (collectibleCap <= 0) return { months: new Map() };

  const skipSet = new Set((client.skipMonths || client.skippedMonths || []).map(String));

  const schedule = (client.installmentSchedule || [])
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const getInstallmentAmountForDate = (date) => {
    if (!Array.isArray(schedule) || schedule.length === 0) {
      return Number(client.installmentAmount || 500);
    }
    for (const s of schedule) {
      const sStart = new Date(s.start);
      const sEnd = new Date(s.end);
      if (date >= sStart && date <= sEnd) return Number(s.amount || 500);
    }
    return Number(client.installmentAmount || 500);
  };

  const DUE_DAY = 15;
  const months = new Map();

  const firstDue = new Date(
    firstInstallmentDate.getFullYear(),
    firstInstallmentDate.getMonth(),
    DUE_DAY
  );

  const endOfAsOfMonth = new Date(
    asOf.getFullYear(),
    asOf.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );

  let expectedAccum = 0;
  const cursor = new Date(firstDue);

  while (cursor <= endOfAsOfMonth) {
    const ym = ymKey(cursor);
    const expected = skipSet.has(ym) ? 0 : getInstallmentAmountForDate(cursor);

    if (expectedAccum >= collectibleCap) break;
    if (expected > 0 && expectedAccum + expected > collectibleCap) break;

    months.set(ym, { expected, collected: 0 });
    expectedAccum += expected;

    cursor.setMonth(cursor.getMonth() + 1);
  }

  const initialCutoff = toDateSafe(client.initialPaymentDate);

  const isInitialFlag = (p) => {
    const t = (p?.type || p?.category || "").toString().toLowerCase();
    return p?.isInitial === true || t === "initial" || t === "retainer" || t === "setup";
  };

  const rawPayments = (client.payments || [])
    .map((p) => ({ amount: Number(p.amount || 0), date: toDateSafe(p.date), raw: p }))
    .filter(
      (p) =>
        p.amount > 0 &&
        p.date &&
        p.date <= endOfAsOfMonth &&
        !isInitialFlag(p.raw) &&
        (initialCutoff ? p.date > initialCutoff : true)
    )
    .sort((a, b) => a.date - b.date);

  const allocKeys = Array.from(months.keys()).sort();

  for (const pay of rawPayments) {
    let remaining = pay.amount;
    for (const ym of allocKeys) {
      if (remaining <= 0) break;
      const rec = months.get(ym);
      if (!rec) continue;
      const cap = Math.max(0, rec.expected - rec.collected);
      if (cap <= 0) continue;
      const take = Math.min(cap, remaining);
      rec.collected += take;
      remaining -= take;
    }
  }

  return { months };
}

function lastPaymentDate(client) {
  const arr = client.payments || [];
  if (!arr.length) return null;
  const latest = arr.reduce((acc, p) =>
    new Date(p.date) > new Date(acc.date) ? p : acc
  );
  try {
    return new Date(latest.date).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function ymKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthInRange(ym, start, end) {
  const s = ymKey(start);
  const endPlus = new Date(end);
  endPlus.setMonth(endPlus.getMonth() + 1);
  const ePlus = ymKey(endPlus);
  return ym >= s && ym < ePlus;
}

function parseYMD(str) {
  if (!str) return new Date();
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}