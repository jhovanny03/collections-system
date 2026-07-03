// src/ClientFollowUps/FollowUpsInsightsView.jsx
import React, { useMemo } from "react";
import {
  Box,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography,
  Chip,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from "@mui/material";
import { FOLLOW_UP_STATUS } from "./followUps.types";

// Keep labels in sync with main file
const NON_PAY_REASONS = [
  { value: "CASE_TAKING_TOO_LONG", label: "Case taking too long" },
  { value: "CARD_ISSUES", label: "Card / payment method issues" },
  { value: "FINANCIAL_DIFFICULTIES", label: "Financial difficulties" },
  { value: "NO_EAD_YET", label: "No EAD yet" },
  { value: "NO_RECEIPT_NOTICE", label: "No receipt notice received" },
  { value: "NOT_RECEIVING_UPDATES", label: "Not receiving case updates" },
  { value: "CLIENT_UNRESPONSIVE", label: "Client unresponsive" },
  { value: "OTHER", label: "Other / Custom reason" },
];

const reasonLabel = (value, custom) => {
  if (!value) return "Not captured";
  if (value === "OTHER") return custom || "Other / custom reason";
  const found = NON_PAY_REASONS.find((r) => r.value === value);
  return found?.label || custom || value;
};

const pct = (num, den) =>
  !den || !num ? "0%" : `${Math.round((num / den) * 100)}%`;

export default function FollowUpsInsightsView({ items = [] }) {
  const {
    totals,
    statusCounts,
    contactedCount,
    resolvedCount,
    reasonStats,
    activityStats,
  } = useMemo(() => {
    const total = items.length;

    const statusCounts = {
      [FOLLOW_UP_STATUS.PENDING]: 0,
      [FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT]: 0,
      [FOLLOW_UP_STATUS.REACHED_WORKING]: 0,
      [FOLLOW_UP_STATUS.PROMISE]: 0,
      [FOLLOW_UP_STATUS.PARTIAL_PAYMENT]: 0,
      [FOLLOW_UP_STATUS.RESOLVED]: 0,
    };

    const reasonAgg = {}; // key: value, { count, totalAmount, customSamples }

    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    let noContact = 0;
    let touched7d = 0;
    let stale30d = 0;

    items.forEach((it) => {
      const s = it.status || FOLLOW_UP_STATUS.PENDING;
      if (statusCounts[s] == null) statusCounts[s] = 0;
      statusCounts[s] += 1;

      // reasons
      const rv = it.nonPayReason || null;
      const rc = it.nonPayReasonCustom || "";
      const key = rv || "NONE";
      const amt = Number(it.amountDueCurrentMonth || 0);

      if (!reasonAgg[key]) {
        reasonAgg[key] = {
          value: rv,
          custom: rc,
          count: 0,
          totalAmount: 0,
        };
      }
      reasonAgg[key].count += 1;
      reasonAgg[key].totalAmount += amt;

      // activity
      if (!it.lastContactAt) {
        noContact += 1;
      } else {
        const last = new Date(it.lastContactAt);
        const diffDays = (now - last) / msPerDay;
        if (diffDays <= 7) touched7d += 1;
        if (diffDays >= 30) stale30d += 1;
      }
    });

    const contactedCount =
      statusCounts[FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT] +
      statusCounts[FOLLOW_UP_STATUS.REACHED_WORKING] +
      statusCounts[FOLLOW_UP_STATUS.PROMISE] +
      statusCounts[FOLLOW_UP_STATUS.PARTIAL_PAYMENT] +
      statusCounts[FOLLOW_UP_STATUS.RESOLVED];

    const resolvedCount = statusCounts[FOLLOW_UP_STATUS.RESOLVED] || 0;

    const reasonStats = Object.values(reasonAgg).map((r) => ({
      ...r,
      label: reasonLabel(r.value, r.custom),
    }));

    const activityStats = {
      noContact,
      touched7d,
      stale30d,
    };

    return {
      totals: { total },
      statusCounts,
      contactedCount,
      resolvedCount,
      reasonStats,
      activityStats,
    };
  }, [items]);

  const total = totals.total || 0;

  return (
    <Box>
      <Grid container spacing={2}>
        {/* Cohort overview */}
        <Grid item xs={12} md={6}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Cohort overview
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip
                  label={`Total: ${total}`}
                  variant="outlined"
                  sx={{ mb: 1 }}
                />
                <Chip
                  label={`Contacted: ${contactedCount} (${pct(
                    contactedCount,
                    total
                  )})`}
                  color="primary"
                  variant="outlined"
                  sx={{ mb: 1 }}
                />
                <Chip
                  label={`Resolved: ${resolvedCount} (${pct(
                    resolvedCount,
                    total
                  )})`}
                  color="success"
                  variant="outlined"
                  sx={{ mb: 1 }}
                />
              </Stack>

              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  By status
                </Typography>
                <Stack spacing={0.5}>
                  <Typography variant="body2">
                    Pending: {statusCounts[FOLLOW_UP_STATUS.PENDING] || 0}
                  </Typography>
                  <Typography variant="body2">
                    Attempted – No Contact:{" "}
                    {statusCounts[FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT] || 0}
                  </Typography>
                  <Typography variant="body2">
                    Reached – Working:{" "}
                    {statusCounts[FOLLOW_UP_STATUS.REACHED_WORKING] || 0}
                  </Typography>
                  <Typography variant="body2">
                    Promise: {statusCounts[FOLLOW_UP_STATUS.PROMISE] || 0}
                  </Typography>
                  <Typography variant="body2">
                    Partial Payment:{" "}
                    {statusCounts[FOLLOW_UP_STATUS.PARTIAL_PAYMENT] || 0}
                  </Typography>
                  <Typography variant="body2">
                    Resolved: {statusCounts[FOLLOW_UP_STATUS.RESOLVED] || 0}
                  </Typography>
                </Stack>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Contact activity */}
        <Grid item xs={12} md={6}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Contact activity
              </Typography>
              <Stack spacing={0.5}>
                <Typography variant="body2">
                  No contact logged yet: {activityStats.noContact}
                </Typography>
                <Typography variant="body2">
                  Contacted in last 7 days: {activityStats.touched7d}
                </Typography>
                <Typography variant="body2">
                  No contact in 30+ days: {activityStats.stale30d}
                </Typography>
              </Stack>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1.5, display: "block" }}
              >
                Based on the lastContactAt timestamp in each follow-up item.
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Reasons for non-payment */}
        <Grid item xs={12}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Reasons for non-payment
              </Typography>

              {reasonStats.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No reasons have been logged yet.
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Reason</TableCell>
                      <TableCell align="right">Clients</TableCell>
                      <TableCell align="right">% of cohort</TableCell>
                      <TableCell align="right">
                        Total Amount Due (current month)
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {reasonStats
                      .sort((a, b) => b.count - a.count)
                      .map((r) => (
                        <TableRow key={r.label}>
                          <TableCell>{r.label}</TableCell>
                          <TableCell align="right">{r.count}</TableCell>
                          <TableCell align="right">
                            {pct(r.count, total)}
                          </TableCell>
                          <TableCell align="right">
                            $
                            {Number(r.totalAmount || 0).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1.5, display: "block" }}
              >
                Reasons are pulled from the Follow-Ups log dialog. Use this to
                spot the most common blockers for payments this month.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}