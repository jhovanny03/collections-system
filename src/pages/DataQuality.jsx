// src/pages/DataQuality.jsx
// Clean-up list: what makes the numbers less trustworthy, and a one-click fix for each.
//  1. Monthly amount to confirm: clients on the $500 standard who steadily pay another
//     amount (src/billing/dataQuality.js). Billing confirms: set that amount from a month
//     on, or keep $500 (they are underpaying). Nothing changes until billing decides.
//  2. Plan ended, still owes, by reason (no payment in 6+ months / on the $500 standard /
//     plan ran out while paying).
//  3. The queues that feed bad numbers (invoices to tag, new cases, links, MyCase review).
// Rows come from the prepared figures (src/data/BookProvider.jsx); "Update figures" redoes them.
import React, { useMemo, useState } from "react";
import { Alert, Box, Button, Chip, LinearProgress, Link as MuiLink, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tab, Tabs, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { arrayUnion, doc, getDoc, updateDoc } from "firebase/firestore";
import db from "../firebase";
import { useBook } from "../data/BookProvider";
import { useWorkQueue } from "../data/WorkQueueProvider";
import { useAuth } from "../auth/useAuth";
import { getActor } from "../auth/actor";
import { money, monthLabel } from "../billing/portfolio";
import { confirmedEntry, STANDARD_MONTHLY } from "../billing/dataQuality";
import { PageHeader, Section, StatCard, Tiles, Empty } from "../ui/kit";

const REASONS = {
  quiet: { label: "No payment in 6+ months", tone: "error", todo: "Review for write-off, outside collections or closing the case." },
  default: { label: "On the $500 standard", tone: "warning", todo: "Check the agreed monthly amount; part of the plan uses the $500 standard." },
  ranOut: { label: "Plan ran out while paying", tone: "info", todo: "Check the invoice total and plan length: they keep paying after the plan ended." },
};

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

export default function DataQuality() {
  const { rows, ready, generatedAt, refresh, refreshing, source } = useBook();
  const { counts } = useWorkQueue();
  const { isEditorOrHigher } = useAuth();
  const editor = isEditorOrHigher();
  const [tab, setTab] = useState("amounts");
  const [reason, setReason] = useState("quiet");
  // Paying less matters most: it makes a client look behind when they may have agreed to it.
  const [side, setSide] = useState("less");
  const [done, setDone] = useState({}); // client id -> "set" | "keep" (this visit)
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const steady = useMemo(() => rows.filter((r) => r.steadyPay).sort((a, b) => b.amountDue - a.amountDue || a.name.localeCompare(b.name)), [rows]);
  const ended = useMemo(() => rows.filter((r) => r.planEnded && r.endedReason), [rows]);
  const endedBy = useMemo(() => {
    const m = { quiet: [], default: [], ranOut: [] };
    ended.forEach((r) => m[r.endedReason] && m[r.endedReason].push(r));
    Object.values(m).forEach((l) => l.sort((a, b) => b.amountDue - a.amountDue));
    return m;
  }, [ended]);
  const open = steady.filter((r) => !done[r.id]);
  const less = steady.filter((r) => r.steadyPay.amount < r.steadyPay.expected);
  const more = steady.filter((r) => r.steadyPay.amount > r.steadyPay.expected);
  const shown = side === "less" ? less : more;

  // Both decisions are written on the client (and noted in its log); the plan change
  // shows in the figures after "Update figures" or the next sync.
  async function decide(r, decision) {
    setBusy(r.id);
    setError("");
    try {
      const who = getActor();
      const ref = doc(db, "clients", r.id);
      const at = new Date().toISOString();
      const sp = r.steadyPay;
      if (decision === "set") {
        const cur = ((await getDoc(ref)).data() || {}).installmentSchedule || [];
        await updateDoc(ref, {
          installmentSchedule: [...cur, confirmedEntry(sp.amount, sp.fromYm, who.name)],
          "dataQuality.monthly": { decision: "set", amount: sp.amount, fromYm: sp.fromYm, by: who.name, at },
          communicationLogs: arrayUnion({ message: `Monthly amount set to ${money(sp.amount)} from ${monthLabel(sp.fromYm, "long")} (they have been paying it; the $500 standard no longer applies). Data quality.`, timestamp: at, user: who.name }),
        });
      } else {
        await updateDoc(ref, {
          "dataQuality.monthly": { decision: "keep", amount: STANDARD_MONTHLY, paying: sp.amount, by: who.name, at },
          communicationLogs: arrayUnion({ message: `Monthly amount kept at ${money(STANDARD_MONTHLY)}: paying ${money(sp.amount)} is underpaying. Data quality.`, timestamp: at, user: who.name }),
        });
      }
      setDone((d) => ({ ...d, [r.id]: decision }));
    } catch (e) {
      setError(`Could not save ${r.name}: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  const queues = [
    { label: "Invoices to tag", n: counts.toTag, to: "/case-setup", help: "Existing clients whose MyCase invoices are not tagged initial / installment / other (Case Setup → Existing clients to tag)." },
    { label: "New MyCase cases", n: counts.newCases, to: "/case-setup", help: "Open MyCase cases with a balance that are not in Collections: their payments are not counted anywhere." },
    { label: "Link problems", n: counts.linkProblems, to: "/case-setup", help: "Records with no MyCase case link (payments never sync) or several records on one case." },
    { label: "MyCase payments to review", n: counts.reviewOpen, to: "/mycase-review", help: "Payments the sync could not place on its own (refunds, no plan, more than the balance)." },
    { label: "Waiting for a plan", n: counts.waitingPlan, to: "/case-setup", help: "New intake clients with no monthly plan yet." },
  ];

  return (
    <Box>
      <PageHeader
        title="Data quality"
        subtitle="What makes the numbers less reliable, and the fix for each. Nothing changes until someone decides."
        actions={
          source === "prepared" && (
            <Button variant="outlined" disabled={refreshing} onClick={() => refresh().catch((e) => setError(`Could not update: ${e.message}`))}>
              {refreshing ? "Updating figures…" : `Update figures${generatedAt ? ` (as of ${generatedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })})` : ""}`}
            </Button>
          )
        }
      />
      {!ready && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      <Tiles min={200} sx={{ mb: 2.5 }}>
        <StatCard label="Monthly amount to confirm" value={open.length} sub={`${steady.filter((r) => r.amountDue > 0).length} of them show as owing`} tone={open.length ? "warn" : "good"} onClick={() => setTab("amounts")} />
        <StatCard label="Plan ended, still owes" value={ended.length} sub={money(ended.reduce((s, r) => s + r.amountDue, 0))} tone="bad" onClick={() => setTab("ended")} />
        <StatCard label="Queues to clear" value={queues.reduce((s, q) => s + (q.n || 0), 0).toLocaleString()} sub="tags, new cases, links, review" onClick={() => setTab("queues")} />
      </Tiles>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="amounts" label={`Monthly amount to confirm (${open.length})`} />
        <Tab value="ended" label={`Plan ended, still owes (${ended.length})`} />
        <Tab value="queues" label="Queues" />
      </Tabs>

      {tab === "amounts" && (
        <Section
          title="They pay a steady amount the plan does not expect"
          subtitle={`$${STANDARD_MONTHLY} is the standard monthly amount once a payment schedule ends. These clients have paid the same different amount most months. Did they agree to it (set it from the month they started), or are they underpaying (keep $${STANDARD_MONTHLY})?`}
          pad={false}
          action={<Button size="small" onClick={() => downloadCsv("monthly-amount-to-confirm.csv", ["Client", "Case type", "Plan expects", "They pay", "Since", "Owed now"], steady.map((r) => [r.name, r.caseType, r.steadyPay.expected, r.steadyPay.amount, r.steadyPay.since, r.amountDue.toFixed(2)]))}>Download CSV</Button>}
        >
          <Stack direction="row" spacing={1} sx={{ px: 2.25, pt: 2 }} flexWrap="wrap" useFlexGap>
            <Chip clickable color={side === "less" ? "warning" : "default"} variant={side === "less" ? "filled" : "outlined"} onClick={() => setSide("less")} label={`Pay less · ${less.length} · may look behind when they are not`} />
            <Chip clickable color={side === "more" ? "info" : "default"} variant={side === "more" ? "filled" : "outlined"} onClick={() => setSide("more")} label={`Pay more · ${more.length} · usually catching up; figures already right`} />
          </Stack>
          {shown.length === 0 ? (
            <Empty title="Nothing to confirm">Every client pays what their plan expects.</Empty>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Client</TableCell>
                    <TableCell align="right">Plan expects</TableCell>
                    <TableCell align="right">They pay</TableCell>
                    <TableCell>Since</TableCell>
                    <TableCell align="right">Owed now</TableCell>
                    <TableCell align="right">Decision</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shown.map((r) => {
                    const sp = r.steadyPay;
                    const d = done[r.id];
                    return (
                      <TableRow key={r.id} hover sx={{ opacity: d ? 0.55 : 1 }}>
                        <TableCell>
                          <MuiLink component={RouterLink} to={`/client/${r.id}`} fontWeight={700} underline="hover">{r.name}</MuiLink>
                          <Typography variant="caption" color="text.secondary" display="block">{r.caseType} · {sp.months} of the last 6 months</Typography>
                        </TableCell>
                        <TableCell align="right">{money(sp.expected)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: sp.amount < sp.expected ? "secondary.main" : "success.main" }}>{money(sp.amount)}</TableCell>
                        <TableCell>
                          {monthLabel(sp.since, "long")}
                          {sp.fromYm !== sp.since && <Typography variant="caption" color="text.secondary" display="block">would apply from {monthLabel(sp.fromYm, "long")}</Typography>}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{r.amountDue > 0 ? money(r.amountDue) : "—"}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                          {d ? (
                            <Chip size="small" color={d === "set" ? "success" : "default"} label={d === "set" ? `Set to ${money(sp.amount)}` : `Kept ${money(sp.expected)}`} />
                          ) : editor ? (
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              <Button size="small" variant="contained" disabled={busy === r.id} onClick={() => decide(r, "set")} title={`Set ${money(sp.amount)}/month from ${monthLabel(sp.fromYm, "long")}`}>Set {money(sp.amount)}</Button>
                              <Button size="small" variant="outlined" disabled={busy === r.id} onClick={() => decide(r, "keep")}>Keep {money(sp.expected)}</Button>
                            </Stack>
                          ) : (
                            <Typography variant="caption" color="text.secondary">Editors decide</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {Object.keys(done).length > 0 && (
            <Alert severity="success" variant="outlined" sx={{ m: 2 }}>
              {Object.keys(done).length} decided. They leave this list, and their plan figures change, once the figures are updated (button at the top, or the next sync).
            </Alert>
          )}
        </Section>
      )}

      {tab === "ended" && (
        <Section
          title="Every month of the plan has passed and money is still owed"
          subtitle={REASONS[reason].todo}
          pad={false}
          action={<Button size="small" onClick={() => downloadCsv(`plan-ended-${reason}.csv`, ["Client", "Case type", "Owed now", "Balance left", "Last payment", "Reason"], endedBy[reason].map((r) => [r.name, r.caseType, r.amountDue.toFixed(2), r.balance.toFixed(2), r.lastPayment ? `${r.lastPayment.date} ${r.lastPayment.amount}` : "", REASONS[reason].label]))}>Download CSV</Button>}
        >
          <Stack direction="row" spacing={1} sx={{ px: 2.25, pt: 2 }} flexWrap="wrap" useFlexGap>
            {Object.entries(REASONS).map(([k, v]) => (
              <Chip key={k} clickable color={reason === k ? v.tone : "default"} variant={reason === k ? "filled" : "outlined"} onClick={() => setReason(k)}
                label={`${v.label} · ${endedBy[k].length} · ${money(endedBy[k].reduce((s, r) => s + r.amountDue, 0))}`} />
            ))}
          </Stack>
          {endedBy[reason].length === 0 ? (
            <Empty title="No one here" />
          ) : (
            <TableContainer sx={{ mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Client</TableCell>
                    <TableCell>Case type</TableCell>
                    <TableCell align="right">Owed now</TableCell>
                    <TableCell align="right">Balance left</TableCell>
                    <TableCell>Last payment</TableCell>
                    <TableCell>Payments from</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {endedBy[reason].slice(0, 300).map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell><MuiLink component={RouterLink} to={`/client/${r.id}`} fontWeight={700} underline="hover">{r.name}</MuiLink></TableCell>
                      <TableCell>{r.caseType}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, color: "error.main" }}>{money(r.amountDue)}</TableCell>
                      <TableCell align="right">{money(r.balance)}</TableCell>
                      <TableCell>{r.lastPayment ? `${money(r.lastPayment.amount)} · ${r.lastPayment.date}` : "Never"}</TableCell>
                      <TableCell><Typography variant="caption" color="text.secondary">{r.source}</Typography></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Section>
      )}

      {tab === "queues" && (
        <Tiles min={230}>
          {queues.map((q) => (
            <StatCard key={q.label} label={q.label} value={q.n == null ? "…" : q.n.toLocaleString()} sub="Open" help={q.help} to={q.to} tone={q.n ? "warn" : "good"} />
          ))}
        </Tiles>
      )}
    </Box>
  );
}
