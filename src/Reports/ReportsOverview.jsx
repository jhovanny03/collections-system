// src/Reports/ReportsOverview.jsx
// The pulse of billing on one page: where the money stands, how collection is going,
// who is behind and why. All from the shared portfolio calculation.
import React, { useMemo, useState } from "react";
import { Box, Button, Chip, LinearProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow, TableContainer, Typography, ToggleButton, ToggleButtonGroup, Link } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { BarChart } from "@mui/x-charts/BarChart";
import { LineChart } from "@mui/x-charts/LineChart";
import { Link as RouterLink } from "react-router-dom";
import { useClients } from "../data/ClientsProvider";
import { usePortfolio, collectionsByMonth, collectionRateByMonth, money, pct } from "../billing/portfolio";
import { chartColors } from "../theme/brand";
import { StatCard, Section, Tiles } from "../ui/kit";

const k = (v) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);

function downloadCsv(name, header, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [header.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsOverview() {
  const theme = useTheme();
  const colors = chartColors(theme.palette.mode);
  const { clients, loading } = useClients();
  const { rows, payments, summary: s } = usePortfolio(clients);
  const [rateMonths, setRateMonths] = useState(6);

  const months = useMemo(() => collectionsByMonth(payments, 12), [payments]);
  const rate = useMemo(() => (clients.length ? collectionRateByMonth(clients, rateMonths) : []), [clients, rateMonths]);

  const plan = useMemo(() => rows.filter((r) => r.status !== "closed" && r.inPlan && r.status !== "paused" && (r.balance > 0 || r.amountDue > 0)), [rows]);
  const pastDue = useMemo(() => plan.filter((r) => r.amountDue > 0), [plan]);
  // Every month of the plan has passed and they still owe.
  const planEnded = useMemo(() => pastDue.filter((r) => r.planEnded), [pastDue]);

  const byType = useMemo(() => {
    const m = new Map();
    for (const r of plan) {
      const t = r.caseType || "—";
      const e = m.get(t) || { type: t, clients: 0, pastDue: 0, pastDueAmount: 0, balance: 0 };
      e.clients++;
      e.balance += r.balance;
      if (r.amountDue > 0) {
        e.pastDue++;
        e.pastDueAmount += r.amountDue;
      }
      m.set(t, e);
    }
    return [...m.values()].sort((a, b) => b.pastDueAmount - a.pastDueAmount);
  }, [plan]);

  const bySource = useMemo(() => {
    const m = new Map();
    for (const r of plan) {
      const e = m.get(r.source) || { source: r.source, clients: 0, pastDue: 0, amount: 0 };
      e.clients++;
      if (r.amountDue > 0) {
        e.pastDue++;
        e.amount += r.amountDue;
      }
      m.set(r.source, e);
    }
    return [...m.values()];
  }, [plan]);

  const top = useMemo(() => [...pastDue].sort((a, b) => b.amountDue - a.amountDue).slice(0, 15), [pastDue]);
  const avg6 = months.slice(-7, -1).reduce((t, m) => t + m.total, 0) / 6;

  return (
    <Box>
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Tiles min={200} sx={{ mb: 3 }}>
        <StatCard label="Outstanding" value={money(s.outstanding)} sub={`${s.outstandingClients.toLocaleString()} clients · due by today, not paid`} help="Every installment the plans say should have been paid by today and has not been, all plans." />
        <StatCard label="Past due this month" value={money(s.pastDue.amount)} sub={`${s.pastDue.clients.toLocaleString()} clients missed this month's installment`} tone="bad" />
        <StatCard label="Left to collect on plans" value={money(s.leftOnPlans)} sub={`${s.clients.inPlan.toLocaleString()} clients still paying`} help="Everything still to be collected on all plans, including installments not due yet." />
        <StatCard label="Plan ended, still owes" value={money(planEnded.reduce((t, r) => t + r.amountDue, 0))} sub={`${planEnded.length} clients · included in Outstanding`} tone="danger" help="Every month of their plan has passed and they still owe. These need a special call." />
        <StatCard label="Collection rate this month" value={pct(s.month.collectionRate)} sub={`${money(s.month.collectedOnPlan)} of ${money(s.month.expected)}`} tone={s.month.collectionRate >= 0.8 ? "good" : "warn"} />
        <StatCard label="Collected this year" value={money(s.collected.ytd)} sub={`${money(avg6)} a month (last 6 full months)`} tone="good" />
        <StatCard label="Clients" value={s.clients.open.toLocaleString()} sub={`${s.clients.paused} paused · ${s.clients.paidInFull} paid in full · ${s.clients.closed} closed`} />
      </Tiles>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, mb: 3 }}>
        <Section
          title="Collection rate by month"
          subtitle="Installments due from clients up to date going into the month, and how much was paid"
          action={
            <ToggleButtonGroup size="small" exclusive value={rateMonths} onChange={(_, v) => v && setRateMonths(v)}>
              <ToggleButton value={6}>6 mo</ToggleButton>
              <ToggleButton value={12}>12 mo</ToggleButton>
            </ToggleButtonGroup>
          }
        >
          <Box sx={{ height: 290 }}>
            <BarChart
              dataset={rate}
              xAxis={[{ scaleType: "band", dataKey: "label" }]}
              yAxis={[{ valueFormatter: k, width: 56 }]}
              series={[
                { dataKey: "expected", label: "Due", color: theme.palette.mode === "dark" ? "#4A5080" : "#C9CDEB", valueFormatter: (v) => money(v) },
                { dataKey: "collected", label: "Collected", color: colors[0], valueFormatter: (v, c) => `${money(v)} (${pct(rate[c.dataIndex]?.rate)})` },
              ]}
              borderRadius={4}
              margin={{ left: 8, right: 8, top: 16, bottom: 8 }}
            />
          </Box>
        </Section>
        <Section title="Money received, last 12 months" subtitle="Every payment that came in (initial payments and installments, any month), by date received">
          <Box sx={{ height: 290 }}>
            <LineChart
              dataset={months}
              xAxis={[{ scaleType: "point", dataKey: "label" }]}
              yAxis={[{ valueFormatter: k, width: 56 }]}
              series={[
                { dataKey: "total", label: "Total", color: colors[0], area: true, valueFormatter: (v) => money(v) },
                { dataKey: "installments", label: "Installments", color: colors[1], valueFormatter: (v) => money(v) },
              ]}
              margin={{ left: 8, right: 16, top: 16, bottom: 8 }}
              sx={{ "& .MuiAreaElement-root": { fillOpacity: 0.12 } }}
            />
          </Box>
        </Section>
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "2fr 3fr" }, mb: 3 }}>
        <Section title="Aging" subtitle="What is owed by age, from the 1st of each installment's month" action={<Button size="small" component={RouterLink} to="/reports?tab=aging">Full report</Button>} pad={false}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Age</TableCell>
                  <TableCell align="right">Clients</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell align="right">Share</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {s.buckets.map((b, i) => (
                  <TableRow key={b.key} hover>
                    <TableCell>
                      <Chip size="small" label={b.label} color={i === 0 ? "warning" : i === 3 ? "error" : "secondary"} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">{b.clients.toLocaleString()}</TableCell>
                    <TableCell align="right">{money(b.amount)}</TableCell>
                    <TableCell align="right">{pct(b.amount / Math.max(1, s.receivable.amount))}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell sx={{ fontWeight: 800 }}>Total receivable</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800 }}>{s.receivable.clients.toLocaleString()}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800 }}>{money(s.receivable.amount)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 2.25, py: 1.5 }}>
            By source: {bySource.map((b) => `${b.source} ${b.pastDue}/${b.clients} past due`).join(" · ")}
          </Typography>
        </Section>

        <Section
          title="Past due by case type"
          action={<Button size="small" onClick={() => downloadCsv("past-due-by-case-type.csv", ["Case type", "Clients paying", "Past due clients", "Past due $", "Balance $"], byType.map((t) => [t.type, t.clients, t.pastDue, t.pastDueAmount.toFixed(2), t.balance.toFixed(2)]))}>Download CSV</Button>}
          pad={false}
        >
          <TableContainer sx={{ maxHeight: 360 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Case type</TableCell>
                  <TableCell align="right">Paying</TableCell>
                  <TableCell align="right">Past due</TableCell>
                  <TableCell align="right">% behind</TableCell>
                  <TableCell align="right">Past due $</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {byType.map((t) => (
                  <TableRow key={t.type} hover>
                    <TableCell>{t.type}</TableCell>
                    <TableCell align="right">{t.clients}</TableCell>
                    <TableCell align="right">{t.pastDue}</TableCell>
                    <TableCell align="right">{pct(t.pastDue / Math.max(1, t.clients))}</TableCell>
                    <TableCell align="right">{money(t.pastDueAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Section>
      </Box>

      <Section
        title="Who owes the most right now"
        subtitle="The 15 clients with the most installments due and unpaid"
        action={
          <Button size="small" onClick={() => downloadCsv("past-due-clients.csv", ["Client", "Case type", "Months behind", "Past due $", "Balance $", "Source", "MyCase"], [...pastDue].sort((a, b) => b.amountDue - a.amountDue).map((r) => [r.name, r.caseType, r.missedMonths, r.amountDue.toFixed(2), r.balance.toFixed(2), r.source, r.myCaseLink]))}>
            Download all {pastDue.length} (CSV)
          </Button>
        }
        pad={false}
      >
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Client</TableCell>
                <TableCell>Case type</TableCell>
                <TableCell align="right">Months behind</TableCell>
                <TableCell align="right">Owed now</TableCell>
                <TableCell align="right">Balance left</TableCell>
                <TableCell>Last payment</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {top.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>
                    <Link component={RouterLink} to={`/client/${r.id}`} fontWeight={700}>
                      {r.name}
                    </Link>
                    {r.planEnded && <Chip size="small" label="Plan ended" color="error" variant="outlined" sx={{ ml: 1 }} />}
                  </TableCell>
                  <TableCell>{r.caseType}</TableCell>
                  <TableCell align="right">{r.missedMonths}</TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={800} color="secondary.main" component="span">
                      {money(r.amountDue)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{money(r.balance)}</TableCell>
                  <TableCell>{r.lastPayment?.date ? String(r.lastPayment.date).slice(0, 10) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Section>

      <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
        <Typography variant="caption" color="text.secondary">
          Installments are due on the 15th. "Still paying" excludes paused, closed and paid-in-full clients. Aging counts from the 1st of each installment's month, so this month's installment is in 0–30 days.
        </Typography>
      </Stack>
    </Box>
  );
}
