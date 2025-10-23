// src/Dashboard/SummaryCards.jsx
import * as React from "react";
import {
  Card,
  CardContent,
  Stack,
  Box,
  Typography,
  Avatar,
  Grid,
  LinearProgress,
} from "@mui/material";
import ArrowUpwardRounded from "@mui/icons-material/ArrowUpwardRounded";
import ArrowDownwardRounded from "@mui/icons-material/ArrowDownwardRounded";
import PeopleRounded from "@mui/icons-material/PeopleRounded";
import ReportProblemRounded from "@mui/icons-material/ReportProblemRounded";
import AttachMoneyRounded from "@mui/icons-material/AttachMoneyRounded";
import EventAvailableRounded from "@mui/icons-material/EventAvailableRounded";
import PersonRounded from "@mui/icons-material/PersonRounded";

// 🔥 Framer Motion
import {
  motion,
  AnimatePresence,
  animate,
  useMotionValue,
  useTransform,
} from "framer-motion";

const CARD_MIN_HEIGHT = 112;

// ----- formatting helpers -----
const isFiniteNum = (n) => typeof n === "number" && Number.isFinite(n);
const fmtNumber = (n) => (isFiniteNum(n) ? n.toLocaleString() : "—");
const fmtCurrency = (n) =>
  isFiniteNum(n) ? `$${Math.round(n).toLocaleString()}` : "—";

// ----- animation helpers -----
// Generic count-up hook for integers; returns a MotionValue<string>
function useCountUp(target, { duration = 0.6 } = {}) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v).toLocaleString());
  React.useEffect(() => {
    const to = Number(target || 0);
    const controls = animate(mv, to, { duration, ease: "easeOut" });
    return () => controls.stop();
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  return rounded;
}

// Extract numeric value and currency prefix if value is a formatted string like "$12,345"
function parseDisplayValue(v) {
  if (isFiniteNum(v)) return { num: v, prefix: "" };
  if (typeof v === "string") {
    const hasDollar = v.trim().startsWith("$");
    const num = Number(v.replace(/[^0-9.-]/g, "")) || 0;
    return { num, prefix: hasDollar ? "$" : "" };
  }
  return { num: 0, prefix: "" };
}

// Container/card motion variants
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

export default function SummaryCards({
  data = {},
  diffs = {},
  omitKeys = [],
  extraEndSlot = null,
}) {
  const {
    totalOwed = 0,
    totalClients = 0,
    pastDueClients = 0,
    promisedPayments = 0,
    activeArrangements = 0,

    // main + current-only splits (already computed in Dashboard)
    expectedPaymentsThisMonth = 0,
    expectedPaymentsThisMonthCurrentOnly = 0,

    mtdAccountsReceivable = 0,
    mtdAccountsReceivableCurrentOnly = 0,

    ytdOutstandingBalance = 0,
  } = data;

  const ordered = [
    {
      key: "totalClients",
      title: "Total Clients",
      value: fmtNumber(totalClients),
      diff: diffs?.totalClients,
      color: "rgb(20,184,166)",
      Icon: PeopleRounded,
    },
    {
      key: "pastDueClients",
      title: "Past Due Clients",
      value: fmtNumber(pastDueClients),
      diff: diffs?.pastDueClients,
      color: "rgb(245,158,11)",
      Icon: ReportProblemRounded,
    },
    {
      key: "totalOwed",
      title: "Total Owed",
      value: fmtCurrency(totalOwed),
      diff: diffs?.totalOwed,
      color: "rgb(102,95,239)",
      Icon: AttachMoneyRounded,
    },
    {
      key: "promisedPayments",
      title: "Promised Payments",
      value: fmtCurrency(promisedPayments),
      diff: diffs?.promisedPayments,
      color: "rgb(99,102,241)",
      Icon: AttachMoneyRounded,
    },

    // Split cards (with subtle subnote)
    {
      key: "expectedPaymentsThisMonth",
      title: ["Expected Payments", "This Month"],
      value: null,
      diff: diffs?.expectedPaymentsThisMonth,
      color: "rgb(102,95,239)",
      Icon: EventAvailableRounded,
      split: {
        aLabel: "All",
        aValue: fmtCurrency(expectedPaymentsThisMonth),
        bLabel: "Current-only",
        bValue: fmtCurrency(expectedPaymentsThisMonthCurrentOnly),
      },
      subnote: "Counts month as due on/after the 15th",
    },
    {
      key: "mtdAccountsReceivable",
      title: ["MTD Accounts", "Receivable"],
      value: null,
      diff: diffs?.mtdAccountsReceivable,
      color: "rgb(239,68,68)",
      Icon: AttachMoneyRounded,
      split: {
        aLabel: "All",
        aValue: fmtCurrency(mtdAccountsReceivable),
        bLabel: "From current-only",
        bValue: fmtCurrency(mtdAccountsReceivableCurrentOnly),
      },
      subnote: "Counts month as due on/after the 15th",
    },

    {
      key: "ytdOutstandingBalance",
      title: ["YTD Outstanding", "Balance"],
      value: fmtCurrency(ytdOutstandingBalance),
      diff: diffs?.ytdOutstandingBalance,
      color: "rgb(234,88,12)",
      Icon: AttachMoneyRounded,
    },
  ];

  const items = ordered.filter((i) => !omitKeys.includes(i.key));

  return (
    <Box
      component={motion.div}
      variants={containerVariants}
      initial="hidden"
      animate="show"
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 1.25,
        alignItems: "stretch",
        mb: 0,
      }}
    >
      {items.map((c) => (
        <Box key={c.key} component={motion.div} variants={itemVariants} layout>
          <SummaryCard
            title={c.title}
            value={c.value}
            diff={c.diff}
            iconBg={c.color}
            Icon={c.Icon}
            split={c.split}
            subnote={c.subnote}
          />
        </Box>
      ))}

      {extraEndSlot && <Box component={motion.div}>{extraEndSlot}</Box>}
    </Box>
  );
}

function SummaryCard({
  title,
  value,
  valueSuffix = "",
  iconBg = "rgb(102,95,239)",
  diff,
  progress,
  split, // { aLabel, aValue, bLabel, bValue }
  subnote,
  Icon = PeopleRounded,
}) {
  const showDiff = diff && isFiniteNum(diff.value);
  const isDown = showDiff && diff.direction === "down";
  const DiffIcon = isDown ? ArrowDownwardRounded : ArrowUpwardRounded;

  // Prepare animated values
  const { num: mainNum, prefix: mainPrefix } = parseDisplayValue(value);
  const mainAnimated = useCountUp(mainNum);

  const { num: aNum, prefix: aPrefix } = parseDisplayValue(split?.aValue);
  const aAnimated = useCountUp(aNum);

  const { num: bNum, prefix: bPrefix } = parseDisplayValue(split?.bValue);
  const bAnimated = useCountUp(bNum);

  return (
    <Card
      component={motion.div}
      whileHover={{ y: -3, boxShadow: "0 12px 28px rgba(16,24,40,0.12)" }}
      whileTap={{ scale: 0.995 }}
      transition={{ type: "spring", stiffness: 350, damping: 30, mass: 0.4 }}
      elevation={0}
      sx={{
        borderRadius: 1,
        boxShadow: "0 12px 28px rgba(16,24,40,0.06)",
        border: "1px solid rgba(0,0,0,0.04)",
        height: "100%",
        minHeight: CARD_MIN_HEIGHT,
      }}
      layout
    >
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" spacing={3.5} alignItems="flex-start">
          <Box sx={{ flex: 1, minWidth: 0, pr: 1 }}>
            {/* Title */}
            {Array.isArray(title) ? (
              <Box sx={{ lineHeight: 1.1 }}>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    letterSpacing: 0.6,
                    fontWeight: 600,
                    display: "block",
                  }}
                >
                  {String(title[0]).toUpperCase()}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    letterSpacing: 0.6,
                    fontWeight: 600,
                    display: "block",
                  }}
                >
                  {String(title[1]).toUpperCase()}
                </Typography>
              </Box>
            ) : (
              <Typography
                variant="caption"
                noWrap
                sx={{
                  color: "text.secondary",
                  letterSpacing: 0.6,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {String(title).toUpperCase()}
              </Typography>
            )}

            {/* Value / Split */}
            {split ? (
              <Grid container spacing={1.5} sx={{ mt: 1 }} columns={12} alignItems="stretch">
                <Grid item xs={12} sm={6}>
                  <Box
                    sx={{
                      p: 1,
                      borderRadius: 1,
                      bgcolor: "rgba(0,0,0,0.02)",
                      height: "100%",
                    }}
                  >
                    <Typography
                      variant="overline"
                      sx={{ color: "text.secondary", letterSpacing: 0.6 }}
                    >
                      {split.aLabel}
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                      {aPrefix}
                      <Box component={motion.span}>{aAnimated}</Box>
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box
                    sx={{
                      p: 1,
                      borderRadius: 1,
                      bgcolor: "rgba(0,0,0,0.02)",
                      height: "100%",
                    }}
                  >
                    <Typography
                      variant="overline"
                      sx={{ color: "text.secondary", letterSpacing: 0.6 }}
                    >
                      {split.bLabel}
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                      {bPrefix}
                      <Box component={motion.span}>{bAnimated}</Box>
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            ) : (
              <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: 1 }}>
                <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1 }}>
                  {mainPrefix}
                  <Box component={motion.span}>{mainAnimated}</Box>
                  {valueSuffix}
                </Typography>
              </Stack>
            )}

            {subnote && (
              <Typography
                variant="caption"
                sx={{ color: "text.secondary", display: "block", mt: 0.5 }}
              >
                {subnote}
              </Typography>
            )}

            {isFiniteNum(progress) && (
              <Box sx={{ mt: 2 }}>
                <LinearProgress
                  variant="determinate"
                  value={progress}
                  sx={{
                    height: 6,
                    borderRadius: 999,
                    "& .MuiLinearProgress-bar": { borderRadius: 999 },
                  }}
                />
              </Box>
            )}

            <AnimatePresence initial={false}>
              {showDiff && (
                <Stack
                  component={motion.div}
                  key="diff"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mt: 1.5 }}
                >
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    {(isDown ? (
                      <ArrowDownwardRounded
                        fontSize="small"
                        sx={{ color: "error.main" }}
                      />
                    ) : (
                      <ArrowUpwardRounded
                        fontSize="small"
                        sx={{ color: "success.main" }}
                      />
                    ))}
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        color: isDown ? "error.main" : "success.main",
                      }}
                    >
                      {Math.abs(diff.value).toFixed(1)}%
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {diff.label ?? "Since last month"}
                  </Typography>
                </Stack>
              )}
            </AnimatePresence>
          </Box>

          <Avatar
            variant="circular"
            sx={{
              width: 40,
              height: 40,
              ml: "auto",
              flexShrink: 0,
              bgcolor: iconBg,
              color: "common.white",
              boxShadow: "0 6px 14px rgba(102,95,239,0.18)",
            }}
          >
            {Icon ? <Icon fontSize="small" /> : <PersonRounded fontSize="small" />}
          </Avatar>
        </Stack>
      </CardContent>
    </Card>
  );
}