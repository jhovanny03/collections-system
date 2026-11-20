// src/Reports/FollowUpsReport.jsx
// How follow-ups and promises are working, month by month.
import React, { useEffect, useMemo, useState } from "react";
import { Box, Chip, LinearProgress, Table, TableBody, TableCell, TableHead, TableRow, TableContainer, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { BarChart } from "@mui/x-charts/BarChart";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import db from "../firebase";
import { monthLabel, money, pct } from "../billing/portfolio";
import { chartColors } from "../theme/brand";
import { StatCard, Section, Tiles, Empty } from "../ui/kit";

const REASONS = {
  CASE_TAKING_TOO_LONG: "Case taking too long",
  CARD_ISSUES: "Card / payment method issues",
  FINANCIAL_DIFFICULTIES: "Financial difficulties",
  NO_EAD_YET: "No EAD yet",
  NO_RECEIPT_NOTICE: "No receipt notice",
  NOT_RECEIVING_UPDATES: "Not receiving case updates",
  CLIENT_UNRESPONSIVE: "Client unresponsive",
  OTHER: "Other",
};
const isPaid = (it) => ["paid", "paid_mycase"].includes(it.resolvedReason) || (it.status || "").toLowerCase() === "resolved";
const contacted = (it) => (it.attemptCount || 0) > 0 || !!it.lastContactAt;
const reached = (it) => ["Reached-Working", "Promise", "Partial-Payment", "Resolved"].includes(it.status);

export default function FollowUpsReport() {
  const theme = useTheme();
  const colors = chartColors(theme.palette.mode);
  const [months, setMonths] = useState(null);
  const [promises, setPromises] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const cohorts = (await getDocs(collection(db, "followUpsCohorts"))).docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => /^\d{4}-\d{2}$/.test(c.id)).sort((a, b) => a.id.localeCompare(b.id)).slice(-6);
      const out = [];
      for (const c of cohorts) {
        const items = (await getDocs(collection(db, "followUpsCohorts", c.id, "items"))).docs.map((d) => d.data());
        // Clients who were current and missed the 15th (closed or no-longer-due rows left out).
        const main = items.filter((i) => (i.section || "current") === "current" && i.resolvedReason !== "no_longer_due");
        const reasons = {};
        items.forEach((i) => i.nonPayReason && (reasons[i.nonPayReason] = (reasons[i.nonPayReason] || 0) + 1));
        out.push({
          id: c.id,
          label: monthLabel(c.id),
          listed: main.length,
          behind: items.length - main.length,
          amount: main.reduce((t, i) => t + Number(i.amountDueCurrentMonth || 0), 0),
          contacted: main.filter(contacted).length,
          reached: main.filter(reached).length,
          promised: main.filter((i) => i.status === "Promise").length,
          paid: main.filter(isPaid).length,
          paidUnlogged: main.filter((i) => i.resolvedReason === "paid_mycase").length,
          reasons,
        });
      }
      let pr = [];
      try {
        pr = (await getDocs(query(collection(db, "paymentPromises"), orderBy("createdAt", "desc"), limit(1000)))).docs.map((d) => d.data());
      } catch (e) {
        /* collection may not exist yet */
      }
      if (alive) {
        setMonths(out);
        setPromises(pr);
      }
    })().catch((e) => {
      console.error(e);
      if (alive) setMonths([]);
    });
    return () => {
      alive = false;
    };
  }, []);

  const latest = months && months[months.length - 1];
  const reasonRows = useMemo(() => {
    if (!months) return [];
    const total = {};
    months.forEach((m) => Object.entries(m.reasons).forEach(([r, n]) => (total[r] = (total[r] || 0) + n)));
    const sum = Object.values(total).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(total).map(([r, n]) => ({ reason: REASONS[r] || r, n, share: n / sum })).sort((a, b) => b.n - a.n);
  }, [months]);
  const promiseStats = useMemo(() => {
    const done = promises.filter((p) => p.status === "kept" || p.status === "broken");
    const kept = done.filter((p) => p.status === "kept");
    return { total: promises.length, open: promises.filter((p) => p.status === "open").length, kept: kept.length, rate: done.length ? kept.length / done.length : null, keptAmount: kept.reduce((t, p) => t + Number(p.paidAmount || 0), 0) };
  }, [promises]);

  if (!months) return <LinearProgress />;
  if (!months.length) return <Empty title="No follow-up lists yet">The first list is built on the 16th at 9 AM.</Empty>;

  return (
    <Box>
      <Tiles min={200} sx={{ mb: 3 }}>
        <StatCard label={`Listed in ${latest.label}`} value={latest.listed} sub={`${money(latest.amount)} missed · ${latest.behind} more already behind`} />
        <StatCard label="Contacted" value={pct(latest.contacted / Math.max(1, latest.listed))} sub={`${latest.contacted} of ${latest.listed} called at least once`} tone={latest.contacted / Math.max(1, latest.listed) >= 0.8 ? "good" : "warn"} />
        <StatCard label="Paid since the list" value={pct(latest.paid / Math.max(1, latest.listed))} sub={`${latest.paid} clients${latest.paidUnlogged ? ` (${latest.paidUnlogged} in MyCase, not logged)` : ""}`} tone="good" />
        <StatCard label="Promises kept" value={pct(promiseStats.rate)} sub={promiseStats.total ? `${promiseStats.kept} kept · ${promiseStats.open} open · ${money(promiseStats.keptAmount)} paid` : "Tracked from now on (checked nightly)"} />
      </Tiles>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "3fr 2fr" }, mb: 3 }}>
        <Section title="Follow-up results by month" subtitle="Clients who were current and missed the 15th">
          <Box sx={{ height: 300 }}>
            <BarChart
              dataset={months}
              xAxis={[{ scaleType: "band", dataKey: "label" }]}
              series={[
                { dataKey: "listed", label: "Listed", color: theme.palette.mode === "dark" ? "#4A5080" : "#C9CDEB" },
                { dataKey: "contacted", label: "Contacted", color: colors[0] },
                { dataKey: "paid", label: "Paid", color: colors[1] },
              ]}
              borderRadius={4}
              margin={{ left: 8, right: 8, top: 16, bottom: 8 }}
            />
          </Box>
        </Section>
        <Section title="Why clients say they did not pay" subtitle="Last 6 months, as logged on calls" pad={false}>
          {reasonRows.length === 0 ? (
            <Empty title="No reasons logged yet" />
          ) : (
            <Table size="small">
              <TableBody>
                {reasonRows.map((r) => (
                  <TableRow key={r.reason}>
                    <TableCell>{r.reason}</TableCell>
                    <TableCell align="right">{r.n}</TableCell>
                    <TableCell align="right" sx={{ width: 140 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Box sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: "action.hover" }}>
                          <Box sx={{ width: `${Math.round(r.share * 100)}%`, height: "100%", borderRadius: 3, bgcolor: "secondary.main" }} />
                        </Box>
                        <Typography variant="caption">{pct(r.share)}</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      </Box>

      <Section title="Month by month" pad={false}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Month</TableCell>
                <TableCell align="right">Listed</TableCell>
                <TableCell align="right">Missed $</TableCell>
                <TableCell align="right">Contacted</TableCell>
                <TableCell align="right">Reached</TableCell>
                <TableCell align="right">Promised</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Already behind</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...months].reverse().map((m) => (
                <TableRow key={m.id} hover>
                  <TableCell>{monthLabel(m.id, "long")}</TableCell>
                  <TableCell align="right">{m.listed}</TableCell>
                  <TableCell align="right">{money(m.amount)}</TableCell>
                  <TableCell align="right">{m.contacted} <Chip size="small" label={pct(m.contacted / Math.max(1, m.listed))} sx={{ ml: 0.5 }} /></TableCell>
                  <TableCell align="right">{m.reached}</TableCell>
                  <TableCell align="right">{m.promised}</TableCell>
                  <TableCell align="right">{m.paid}</TableCell>
                  <TableCell align="right">{m.behind || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 2.25, py: 1.5 }}>
          Before November 2026, clients who paid were removed from the list, so "Paid" undercounts those months.
        </Typography>
      </Section>
    </Box>
  );
}
