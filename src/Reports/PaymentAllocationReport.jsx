// src/Reports/PaymentAllocationReport.jsx
// Payment allocation: for an installment month, every client who had an installment,
// how much of it is paid and by which payment(s). Payments go to the oldest unpaid
// installment first (src/billing/ledger.js), so this is the same split every figure uses.
import React, { useMemo, useState } from "react";
import { Box, Button, Chip, LinearProgress, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography, Link } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useClients } from "../data/ClientsProvider";
import { allocationForMonth } from "../billing/ledger";
import { clientName, monthLabel, money, pct, ymOf, usePortfolio } from "../billing/portfolio";
import { StatCard, Section, Tiles, Empty } from "../ui/kit";

const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const VIEWS = [
  { key: "paid", label: "Paid (full or part)" },
  { key: "full", label: "Paid in full" },
  { key: "part", label: "Partly paid" },
  { key: "none", label: "Not paid" },
  { key: "all", label: "All" },
];

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

export default function PaymentAllocationReport() {
  const { clients, loading } = useClients();
  const { rows: book } = usePortfolio(clients);
  // Older months still owed today, per client (any plan, plan-ended balances, initial).
  const owesOlder = useMemo(() => new Map(book.map((r) => [r.id, r.pastMonthsDue > 0.005])), [book]);
  const now = useMemo(() => new Date(), []);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => ymOf(new Date(now.getFullYear(), now.getMonth() - i, 1))), [now]);
  const [ym, setYm] = useState(months[0]);
  const [view, setView] = useState("paid");
  // Whose installments: clients who were up to date going into the month (the same
  // clients as Home's collection rate and Past due this month), clients already behind, or all.
  const [group, setGroup] = useState("current");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const [y, m] = ym.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59);
    const out = [];
    for (const c of clients) {
      let allocs = [];
      try {
        allocs = allocationForMonth(c, ym, now);
      } catch (e) {
        continue;
      }
      // Client-wide, like Home: a client with an older month unpaid on any plan is "behind".
      // This month: the same test as Home's Past due (no older month owed today).
      const clientCurrent = ym === months[0] ? !owesOlder.get(c.id) : allocs.every((a) => a.wasCurrent);
      for (const a of allocs) {
        const pieces = a.pieces.map((p) => ({ ...p, when: p.date < start ? "ahead" : p.date > end ? "late" : "in month" }));
        out.push({
          id: c.id,
          name: clientName(c),
          caseType: c.caseType || "—",
          plan: a.plan,
          due: a.due,
          paid: a.paid,
          left: Math.max(0, a.due - a.paid),
          status: a.paid >= a.due - 0.005 ? "full" : a.paid > 0.005 ? "part" : "none",
          wasCurrent: clientCurrent,
          pieces,
          by: [...new Set(pieces.map((p) => p.by))].join(", "),
        });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, ym, now, owesOlder, months]);

  const inGroup = useMemo(() => rows.filter((r) => group === "all" || (group === "current" ? r.wasCurrent : !r.wasCurrent)), [rows, group]);
  const groupCounts = useMemo(() => ({ current: rows.filter((r) => r.wasCurrent).length, behind: rows.filter((r) => !r.wasCurrent).length, all: rows.length }), [rows]);
  const totals = useMemo(() => {
    const t = { due: 0, paid: 0, n: inGroup.length, full: 0, fullAmt: 0, part: 0, partAmt: 0, none: 0, noneAmt: 0, late: 0, ahead: 0, inMonth: 0, left: 0, leftN: 0 };
    for (const r of inGroup) {
      t.left += r.left;
      if (r.left > 0.005) t.leftN++;
      t.inMonth += r.pieces.filter((p) => p.when === "in month").reduce((s, p) => s + p.amount, 0);
      t.due += r.due;
      t.paid += r.paid;
      if (r.status === "full") {
        t.full++;
        t.fullAmt += r.paid;
      } else if (r.status === "part") {
        t.part++;
        t.partAmt += r.paid;
      } else {
        t.none++;
        t.noneAmt += r.due;
      }
      t.late += r.pieces.filter((p) => p.when === "late").reduce((s, p) => s + p.amount, 0);
      t.ahead += r.pieces.filter((p) => p.when === "ahead").reduce((s, p) => s + p.amount, 0);
    }
    return t;
  }, [inGroup]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inGroup.filter((r) => (view === "all" || (view === "paid" ? r.status !== "none" : r.status === view)) && (!q || r.name.toLowerCase().includes(q) || r.caseType.toLowerCase().includes(q)));
  }, [inGroup, view, search]);

  if (loading) return <LinearProgress />;
  const label = monthLabel(ym, "long");

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }} alignItems={{ sm: "center" }}>
        <TextField select size="small" label="Installment month" value={ym} onChange={(e) => setYm(e.target.value)} sx={{ minWidth: 200 }}>
          {months.map((k) => (
            <MenuItem key={k} value={k}>
              {monthLabel(k, "long")}
            </MenuItem>
          ))}
        </TextField>
        <TextField size="small" label="Search client or case type" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 240 }} />
      </Stack>

      <ToggleButtonGroup size="small" exclusive value={group} onChange={(_, v) => v && setGroup(v)} sx={{ mb: 2, flexWrap: "wrap" }}>
        <ToggleButton value="current">Clients who were current ({groupCounts.current.toLocaleString()})</ToggleButton>
        <ToggleButton value="behind">Clients already behind ({groupCounts.behind.toLocaleString()})</ToggleButton>
        <ToggleButton value="all">Everyone ({groupCounts.all.toLocaleString()})</ToggleButton>
      </ToggleButtonGroup>

      <Tiles min={190} sx={{ mb: 2.5 }}>
        <StatCard
          label={`${label} installments due`}
          value={money(totals.due)}
          sub={`${totals.n.toLocaleString()} installments`}
          help={group === "current" ? `Clients who had paid every earlier month: the same as "due" in Home's collection rate.` : group === "behind" ? `Clients who still owed an earlier month. Their payments go to that older month first, so this month's installment stays unpaid until they catch up.` : "Every client with an installment this month."}
        />
        <StatCard
          label="Paid"
          value={money(totals.paid)}
          sub={`${totals.full.toLocaleString()} in full · ${totals.part.toLocaleString()} partly · ${pct(totals.due ? totals.paid / totals.due : null)}`}
          tone="good"
          onClick={() => setView("paid")}
          help={`${money(totals.inMonth)} was paid during ${label}, ${money(totals.ahead)} before it (paid ahead)${totals.late > 0.005 ? ` and ${money(totals.late)} after it (late)` : ""}.`}
        />
        <StatCard
          label="Not paid yet"
          value={money(totals.left)}
          sub={`${totals.leftN.toLocaleString()} installments${group === "current" && ym === months[0] ? " · = Past due this month" : ""}`}
          tone="bad"
          onClick={() => setView("none")}
          help="What is still owed on these installments (partly paid ones included)."
        />
        <StatCard label="Paid ahead" value={money(totals.ahead)} sub={`before ${label} began`} help={`Money toward ${label}'s installments that came in an earlier month (for example a client who paid two months at once).`} />
      </Tiles>

      <Section
        title={`Who paid ${label}'s installment`}
        subtitle="Payments go to the oldest unpaid installment first: a client who was behind pays older months before this one."
        pad={false}
        action={
          <Button
            size="small"
            onClick={() =>
              downloadCsv(
                `payment-allocation-${ym}.csv`,
                ["Client", "Case type", "Plan", "Installment $", "Paid toward it $", "Left $", "Status", "Paid on", "Recorded by"],
                shown.map((r) => [r.name, r.caseType, r.plan || "", r.due.toFixed(2), r.paid.toFixed(2), r.left.toFixed(2), VIEWS.find((v) => v.key === r.status).label, r.pieces.map((p) => `${ymd(p.date)} ${p.amount.toFixed(2)}`).join("; "), r.by])
              )
            }
          >
            Download CSV
          </Button>
        }
      >
        <Box sx={{ px: 2.25, pt: 1.5 }}>
          <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
            {VIEWS.map((v) => (
              <ToggleButton key={v.key} value={v.key}>
                {v.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        {shown.length === 0 ? (
          <Empty title="No clients in this view" />
        ) : (
          <TableContainer sx={{ maxHeight: 640 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Client</TableCell>
                  <TableCell>Case type</TableCell>
                  <TableCell align="right">Installment</TableCell>
                  <TableCell align="right">Paid toward it</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Paid on</TableCell>
                  <TableCell>Recorded by</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.slice(0, 1500).map((r, i) => (
                  <TableRow key={`${r.id}-${i}`} hover>
                    <TableCell>
                      <Link component={RouterLink} to={`/client/${r.id}`} fontWeight={700} underline="hover">
                        {r.name}
                      </Link>
                      {r.plan && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          {r.plan}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{r.caseType}</TableCell>
                    <TableCell align="right">{money(r.due)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{money(r.paid)}</TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined" label={r.status === "full" ? "Paid" : r.status === "part" ? `${money(r.left)} left` : "Not paid"} color={r.status === "full" ? "success" : r.status === "part" ? "warning" : "error"} />
                    </TableCell>
                    <TableCell>
                      {r.pieces.length === 0
                        ? "—"
                        : r.pieces.map((p, j) => (
                            <Typography key={j} variant="body2" component="div" sx={{ whiteSpace: "nowrap" }}>
                              {p.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: p.date.getFullYear() !== now.getFullYear() ? "numeric" : undefined })} · {money(p.amount)}
                              {p.when !== "in month" && <Chip size="small" label={p.when} sx={{ ml: 0.75, height: 18 }} />}
                            </Typography>
                          ))}
                    </TableCell>
                    <TableCell>{r.by || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {shown.length > 1500 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 2.25, py: 1 }}>
            Showing 1,500 of {shown.length.toLocaleString()}. Download the CSV for all of them.
          </Typography>
        )}
      </Section>
    </Box>
  );
}
