// src/Reports/MyCaseSyncReport.jsx
// Is the MyCase connection healthy, what did it bring in, and what is waiting on a person.
import React, { useEffect, useMemo, useState } from "react";
import { Box, Button, Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { BarChart } from "@mui/x-charts/BarChart";
import { Link as RouterLink } from "react-router-dom";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import db from "../firebase";
import { useClients } from "../data/ClientsProvider";
import { useWorkQueue } from "../data/WorkQueueProvider";
import { usePortfolio, money, pct, ymdOf } from "../billing/portfolio";
import { chartColors } from "../theme/brand";
import { StatCard, Section, Tiles } from "../ui/kit";
import { parseDate } from "../utils/dates";

const REVIEW_REASONS = {
  multiple_matching_clients: "Two records on one case",
  untagged_invoice: "Invoice not tagged yet",
  invalid_date: "Bad payment date in MyCase",
  refund_or_reversal: "Refund / bounced payment",
  possible_duplicate: "Maybe typed in already",
  no_matching_client: "Record not found",
};

export default function MyCaseSyncReport() {
  const theme = useTheme();
  const colors = chartColors(theme.palette.mode);
  const { clients } = useClients();
  const { counts } = useWorkQueue();
  const { rows, payments } = usePortfolio(clients);
  const [syncAt, setSyncAt] = useState({});
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    (async () => {
      const ids = { payments: "mycasePayments", cases: "mycase_cases", invoices: "mycase_invoices" };
      const out = {};
      for (const [k, id] of Object.entries(ids)) {
        try {
          const s = await getDoc(doc(db, "integrations", id));
          out[k] = s.exists() ? parseDate(s.data().updatedAt) : null;
        } catch {
          out[k] = null;
        }
      }
      setSyncAt(out);
      try {
        setReviews((await getDocs(query(collection(db, "mycasePaymentReview"), where("status", "==", "open")))).docs.map((d) => d.data()));
      } catch {
        setReviews([]);
      }
    })();
  }, []);

  // MyCase payments added to Collections, by the day they arrived (last 14 days).
  const arrivals = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ key: ymdOf(d), label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), count: 0, amount: 0 });
    }
    const map = new Map(days.map((d) => [d.key, d]));
    for (const p of payments) {
      if (!p.fromMyCase || p.amount <= 0) continue;
      // By the day the client paid (the rebuild stamped all past payments with its own date).
      const day = map.get(ymdOf(p.date));
      if (day) {
        day.count++;
        day.amount += p.amount;
      }
    }
    return days;
  }, [payments]);

  const coverage = useMemo(() => {
    const open = rows.filter((r) => r.status !== "closed");
    const by = {};
    open.forEach((r) => (by[r.source] = (by[r.source] || 0) + 1));
    return { open: open.length, by };
  }, [rows]);

  const reasons = useMemo(() => {
    const m = {};
    reviews.forEach((r) => (m[r.reason || "other"] = (m[r.reason || "other"] || 0) + 1));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [reviews]);

  const last = syncAt.payments;
  const fresh = last && Date.now() - last.getTime() < 3 * 3600e3;
  const auto = (coverage.by["MyCase"] || 0) + (coverage.by["Rebuilt from MyCase"] || 0);

  return (
    <Box>
      <Tiles min={200} sx={{ mb: 3 }}>
        <StatCard label="Last sync" value={last ? last.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Never"} sub={fresh ? "Healthy: runs every hour" : "Not in the last 3 hours: check the connection"} tone={fresh ? "good" : "danger"} />
        <StatCard label="MyCase payments, last 14 days" value={arrivals.reduce((t, d) => t + d.count, 0)} sub={money(arrivals.reduce((t, d) => t + d.amount, 0))} tone="good" />
        <StatCard label="Payments come in automatically" value={pct(auto / Math.max(1, coverage.open))} sub={`${auto.toLocaleString()} of ${coverage.open.toLocaleString()} open clients`} help="Clients created from MyCase or rebuilt from it get their MyCase payments automatically. Hand-entered clients still need payments typed in." />
        <StatCard label="Waiting on a person" value={(counts.reviewOpen || 0) + (counts.linkProblems || 0) + (counts.newCases || 0) + (counts.waitingPlan || 0)} sub="Reviews, link problems, new cases, plans" tone="warn" />
      </Tiles>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "3fr 2fr" }, mb: 3 }}>
        <Section title="MyCase payments, by day" subtitle="Payments clients made in MyCase that are on their Collections record, by payment date">
          <Box sx={{ height: 280 }}>
            <BarChart
              dataset={arrivals}
              xAxis={[{ scaleType: "band", dataKey: "label" }]}
              series={[{ dataKey: "count", label: "Payments", color: colors[1], valueFormatter: (v, c) => `${v} · ${money(arrivals[c.dataIndex]?.amount)}` }]}
              borderRadius={4}
              hideLegend
              margin={{ left: 8, right: 8, top: 16, bottom: 8 }}
            />
          </Box>
        </Section>
        <Section title="How clients are connected" pad={false}>
          <Table size="small">
            <TableBody>
              {[
                ["MyCase", "Created from MyCase (new intake)", "success"],
                ["Rebuilt from MyCase", "History rebuilt from MyCase", "success"],
                ["Hand-entered", "Typed in by hand (payments typed too)", "warning"],
              ].map(([k, label, color]) => (
                <TableRow key={k}>
                  <TableCell>
                    <Chip size="small" color={color} variant="outlined" label={k} />
                    <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                  </TableCell>
                  <TableCell align="right">{(coverage.by[k] || 0).toLocaleString()}</TableCell>
                  <TableCell align="right">{pct((coverage.by[k] || 0) / Math.max(1, coverage.open))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Box sx={{ p: 2 }}>
            <Button size="small" variant="outlined" component={RouterLink} to="/case-setup">Tag existing clients ({counts.toTag ?? "…"})</Button>
          </Box>
        </Section>
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
        <Section title="Waiting on a person" pad={false}>
          <Table size="small">
            <TableBody>
              {[
                ["New MyCase cases to set up", counts.newCases, "/case-setup"],
                ["Clients waiting for a plan", counts.waitingPlan, "/case-setup"],
                ["Existing clients to tag", counts.toTag, "/case-setup"],
                ["MyCase link problems", counts.linkProblems, "/case-setup"],
                ["Payments to review", counts.reviewOpen, "/mycase-review"],
                ["Paid in MyCase, not logged", counts.followUpsUnlogged, "/follow-ups"],
              ].map(([label, n, to]) => (
                <TableRow key={label} hover>
                  <TableCell>{label}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800 }}>{n ?? "…"}</TableCell>
                  <TableCell align="right">
                    <Button size="small" component={RouterLink} to={to}>Open</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
        <Section title="Why payments are waiting for review" pad={false}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Reason</TableCell>
                <TableCell align="right">Payments</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reasons.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2}>Nothing waiting.</TableCell>
                </TableRow>
              )}
              {reasons.map(([r, n]) => (
                <TableRow key={r}>
                  <TableCell>{REVIEW_REASONS[r] || r}</TableCell>
                  <TableCell align="right">{n}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 2.25, py: 1.5 }}>
            Cases and invoices last synced: {syncAt.cases ? syncAt.cases.toLocaleString() : "—"} / {syncAt.invoices ? syncAt.invoices.toLocaleString() : "—"}
          </Typography>
        </Section>
      </Box>
    </Box>
  );
}
