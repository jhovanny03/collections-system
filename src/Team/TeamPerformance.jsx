// src/Team/TeamPerformance.jsx
// Team leads and admins: how each person on the billing team is doing.
// Built from what the app records about who did what:
//   calls & notes (client communication logs), promises (logs + paymentPromises),
//   payments typed in (payments.recordedBy), Case Setup (clients.setupBy),
//   MyCase reviews (mycasePaymentReview.resolvedBy), link fixes (clients.linkedBy),
//   follow-up calls (followUpsCohorts items history: from Nov 19, 2026).
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Avatar, Box, Chip, LinearProgress, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { BarChart } from "@mui/x-charts/BarChart";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import db from "../firebase";
import { useClients } from "../data/ClientsProvider";
import { money, pct, ymOf, ymdOf } from "../billing/portfolio";
import { chartColors } from "../theme/brand";
import { PageHeader, StatCard, Section, Tiles, Empty } from "../ui/kit";
import PhoneActivity from "./PhoneActivity";
import { parseDate } from "../utils/dates";

const PERIODS = [
  { key: "month", label: "This month" },
  { key: "last", label: "Last month" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
];
function rangeOf(key) {
  const now = new Date();
  if (key === "month") return [new Date(now.getFullYear(), now.getMonth(), 1), now];
  if (key === "last") return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)];
  const from = new Date(now);
  from.setDate(now.getDate() - Number(key));
  from.setHours(0, 0, 0, 0);
  return [from, now];
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const KINDS = [
  { key: "calls", label: "Follow-up calls", help: "Calls logged on the Follow-ups page" },
  { key: "notes", label: "Notes", help: "Other notes in client communication logs" },
  { key: "promises", label: "Promises", help: "Payment promises recorded" },
  { key: "payments", label: "Payments typed", help: "Payments typed into Collections by hand" },
  { key: "setups", label: "Cases set up", help: "MyCase cases set up or tagged in Case Setup" },
  { key: "reviews", label: "Reviews", help: "MyCase payments resolved on MyCase Review" },
  { key: "links", label: "Links fixed", help: "MyCase links fixed on Link problems" },
];

/** Match the many ways a person appears ("Miguel", "Miguel Cañas", email) to one teammate. */
function makeResolver(users) {
  const byEmail = new Map();
  const byName = new Map();
  const byFirst = new Map();
  for (const u of users) {
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name || u.email;
    const person = { id: u.id, name, email: norm(u.email), role: u.role, photo: u.profileImageURL || "" };
    if (person.email) byEmail.set(person.email, person);
    [name, u.name].filter(Boolean).forEach((n) => byName.set(norm(n), person));
    const first = norm(name).split(" ")[0];
    if (first) byFirst.set(first, byFirst.has(first) ? null : person); // ambiguous first names → no match
  }
  const unknown = new Map();
  return (who) => {
    const k = norm(who);
    if (!k) return null;
    const hit = byEmail.get(k) || byName.get(k) || [...byName.entries()].find(([n]) => n.startsWith(k) || k.startsWith(n))?.[1] || byFirst.get(k.split(" ")[0]);
    if (hit) return hit;
    if (!unknown.has(k)) unknown.set(k, { id: `x:${k}`, name: who, email: "", role: "", photo: "" });
    return unknown.get(k);
  };
}

export default function TeamPerformance() {
  const theme = useTheme();
  const colors = chartColors(theme.palette.mode);
  const { clients, loading } = useClients();
  const [period, setPeriod] = useState("month");
  const [users, setUsers] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [items, setItems] = useState([]);
  const [promises, setPromises] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        setUsers((await getDocs(collection(db, "users"))).docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
        setUsers([]);
      }
      try {
        setReviews((await getDocs(query(collection(db, "mycasePaymentReview"), where("status", "==", "resolved")))).docs.map((d) => d.data()));
      } catch (e) {
        console.warn("Team: reviews not loaded:", e.message);
        setReviews([]);
      }
      try {
        setPromises((await getDocs(collection(db, "paymentPromises"))).docs.map((d) => d.data()));
      } catch (e) {
        console.warn("Team: promises not loaded:", e.message);
        setPromises([]);
      }
      // This month's follow-up list: per-call history and outcomes.
      try {
        const id = ymOf(new Date());
        const meta = await getDoc(doc(db, "followUpsCohorts", id));
        if (meta.exists()) setItems((await getDocs(collection(db, "followUpsCohorts", id, "items"))).docs.map((d) => d.data()));
      } catch (e) {
        console.warn("Team: follow-up list not loaded:", e.message);
        setItems([]);
      }
    })();
  }, []);

  const [from, to] = useMemo(() => rangeOf(period), [period]);
  const inRange = (d) => d && d >= from && d <= to;

  const data = useMemo(() => {
    if (!users) return null;
    const resolve = makeResolver(users);
    const people = new Map();
    const bump = (who, kind, extra = 0, when = null) => {
      const p = resolve(who);
      if (!p) return;
      const e = people.get(p.id) || { ...p, calls: 0, notes: 0, promises: 0, payments: 0, paymentsAmount: 0, setups: 0, reviews: 0, links: 0, reached: 0, paidAfter: 0, last: null, days: new Set() };
      e[kind]++;
      if (kind === "payments") e.paymentsAmount += extra;
      if (when && (!e.last || when > e.last)) e.last = when;
      if (when) e.days.add(ymdOf(when));
      people.set(p.id, e);
    };
    let unattributedCalls = 0;
    const weekly = new Map(); // week label -> counts per person

    for (const c of clients) {
      for (const log of [...(c.communicationLogs || []), ...(c.communicationLog || [])]) {
        const when = parseDate(log.timestamp);
        if (!inRange(when)) continue;
        const msg = String(log.message || "");
        const isCall = msg.startsWith("[Follow-Ups");
        if (log.user === "Follow-Ups") {
          unattributedCalls++;
          continue;
        }
        const kind = isCall ? "calls" : msg.startsWith("Client promised to pay") ? "promises" : "notes";
        bump(log.userEmail || log.user, kind, 0, when);
        if (kind === "calls") {
          const wk = new Date(when);
          wk.setDate(wk.getDate() - ((wk.getDay() + 6) % 7));
          const key = ymdOf(wk);
          const w = weekly.get(key) || {};
          const p = resolve(log.userEmail || log.user);
          w[p.name] = (w[p.name] || 0) + 1;
          weekly.set(key, w);
        }
      }
      for (const p of c.payments || []) {
        const by = p.recordedBy;
        if (!by || by === "MyCase sync" || String(p.paymentId || "").startsWith("mycase_")) continue;
        const when = parseDate(p.recordedAt) || parseDate(p.date);
        if (inRange(when)) bump(by, "payments", Number(p.amount || 0), when);
      }
      const setupAt = parseDate(c.setupAt);
      if (c.setupBy && inRange(setupAt)) bump(c.setupBy, "setups", 0, setupAt);
      const linkedAt = parseDate(c.linkedAt);
      if (c.linkedBy && inRange(linkedAt)) bump(c.linkedBy, "links", 0, linkedAt);
    }
    for (const r of reviews) {
      const when = parseDate(r.resolvedAt);
      if (r.resolvedBy && inRange(when)) bump(r.resolvedBy, "reviews", 0, when);
    }
    // Outcomes on this month's list: who reached the client, and did they pay after.
    for (const it of items) {
      if (!it.lastContactBy && !it.lastContactByEmail) continue;
      const p = resolve(it.lastContactByEmail || it.lastContactBy);
      const e = people.get(p.id);
      if (!e) continue;
      if (["Reached-Working", "Promise", "Partial-Payment", "Resolved"].includes(it.status)) e.reached++;
      if (["paid", "paid_mycase"].includes(it.resolvedReason)) e.paidAfter++;
    }
    // Promises kept (tracked from Nov 19, 2026)
    const promiseBy = new Map();
    for (const pr of promises) {
      const when = parseDate(pr.createdAt);
      if (!inRange(when) || !(pr.createdByEmail || pr.createdBy)) continue;
      const p = resolve(pr.createdByEmail || pr.createdBy);
      const e = promiseBy.get(p.id) || { kept: 0, broken: 0 };
      if (pr.status === "kept") e.kept++;
      if (pr.status === "broken") e.broken++;
      promiseBy.set(p.id, e);
    }

    const list = [...people.values()]
      .map((p) => {
        const pk = promiseBy.get(p.id);
        return { ...p, activeDays: p.days.size, total: p.calls + p.notes + p.promises + p.payments + p.setups + p.reviews + p.links, keptRate: pk && pk.kept + pk.broken ? pk.kept / (pk.kept + pk.broken) : null };
      })
      .filter((p) => p.total > 0)
      .sort((a, b) => b.total - a.total);
    const names = list.map((p) => p.name);
    const weeks = [...weekly.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, w]) => ({ label: new Date(`${k}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }), ...w }));
    return { list, names, weeks, unattributedCalls };
  }, [users, clients, reviews, items, promises, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const listStats = useMemo(() => {
    // Clients who were current, missed this month and still owe.
    const open = items.filter((i) => (i.section || "current") === "current" && !i.resolvedReason);
    const called = open.filter((i) => (i.attemptCount || 0) > 0);
    return { total: open.length, called: called.length, notCalled: open.length - called.length };
  }, [items]);

  const totals = data
    ? data.list.reduce((t, p) => ({ calls: t.calls + p.calls, promises: t.promises + p.promises, setups: t.setups + p.setups, reviews: t.reviews + p.reviews, payments: t.payments + p.paymentsAmount }), { calls: 0, promises: 0, setups: 0, reviews: 0, payments: 0 })
    : null;

  return (
    <Box>
      <PageHeader
        title="Team performance"
        subtitle="What each person on the billing team got done, from what the app records. Only team leads and admins see this page."
        actions={
          <ToggleButtonGroup size="small" exclusive value={period} onChange={(_, v) => v && setPeriod(v)}>
            {PERIODS.map((p) => (
              <ToggleButton key={p.key} value={p.key}>{p.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        }
      />
      {(loading || !data) && <LinearProgress sx={{ mb: 2 }} />}

      {data && (
        <>
          <Tiles min={200} sx={{ mb: 3 }}>
            <StatCard label="Follow-up calls" value={totals.calls.toLocaleString()} sub={data.unattributedCalls ? `+${data.unattributedCalls} saved without a name (before Nov 19)` : "logged by the team"} />
            <StatCard label="This month's list" value={pct(listStats.called / Math.max(1, listStats.total))} sub={`${listStats.called} of ${listStats.total} still owing called · ${listStats.notCalled} not called yet`} tone={listStats.notCalled ? "warn" : "good"} to="/follow-ups" />
            <StatCard label="Promises recorded" value={totals.promises.toLocaleString()} />
            <StatCard label="Cases set up / reviewed" value={`${totals.setups} / ${totals.reviews}`} sub="Case Setup / MyCase Review" />
            <StatCard label="Payments typed in" value={money(totals.payments)} sub="By hand (MyCase payments arrive on their own)" />
          </Tiles>

          <Section title="By person" subtitle={`${from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`} pad={false} sx={{ mb: 3 }}>
            {data.list.length === 0 ? (
              <Empty title="No recorded activity in this period" />
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Person</TableCell>
                      {KINDS.map((k) => (
                        <TableCell key={k.key} align="right">
                          <Tooltip title={k.help}><span>{k.label}</span></Tooltip>
                        </TableCell>
                      ))}
                      <TableCell align="right"><Tooltip title="Clients on this month's list this person reached / who then paid"><span>Reached / paid</span></Tooltip></TableCell>
                      <TableCell align="right"><Tooltip title="Share of this person's promises that were kept (tracked from Nov 19, 2026)"><span>Kept</span></Tooltip></TableCell>
                      <TableCell align="right">Active days</TableCell>
                      <TableCell>Last activity</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.list.map((p) => (
                      <TableRow key={p.id} hover>
                        <TableCell>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <Avatar src={p.photo} sx={{ width: 30, height: 30, fontSize: 13, bgcolor: "primary.main" }}>{p.name.slice(0, 1)}</Avatar>
                            <Box>
                              <Typography fontWeight={700} fontSize={14}>{p.name}</Typography>
                              {!p.email && <Typography variant="caption" color="text.secondary">not a user account</Typography>}
                            </Box>
                          </Stack>
                        </TableCell>
                        {KINDS.map((k) => (
                          <TableCell key={k.key} align="right" sx={{ fontWeight: p[k.key] ? 700 : 400, color: p[k.key] ? "text.primary" : "text.disabled" }}>
                            {k.key === "payments" && p.payments ? `${p.payments} (${money(p.paymentsAmount)})` : p[k.key] || "—"}
                          </TableCell>
                        ))}
                        <TableCell align="right">{p.reached || p.paidAfter ? `${p.reached} / ${p.paidAfter}` : "—"}</TableCell>
                        <TableCell align="right">{p.keptRate == null ? "—" : <Chip size="small" label={pct(p.keptRate)} color={p.keptRate >= 0.7 ? "success" : "warning"} />}</TableCell>
                        <TableCell align="right">{p.activeDays}</TableCell>
                        <TableCell>{p.last ? p.last.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Section>

          <PhoneActivity from={from} to={to} />

          {data.weeks.length > 0 && (
            <Section title="Follow-up calls per week" subtitle="Calls logged on the Follow-ups page, by person" sx={{ mb: 3 }}>
              <Box sx={{ height: 300 }}>
                <BarChart
                  dataset={data.weeks}
                  xAxis={[{ scaleType: "band", dataKey: "label" }]}
                  series={data.names.map((n, i) => ({ dataKey: n, label: n, stack: "calls", color: colors[i % colors.length] }))}
                  borderRadius={3}
                  margin={{ left: 8, right: 8, top: 16, bottom: 8 }}
                />
              </Box>
            </Section>
          )}

          <Alert severity="info" variant="outlined">
            How this is counted: calls and notes come from each client's communication log; payments from who recorded them;
            setups, reviews and link fixes from who clicked the button. Until Nov 19, 2026 calls from the Follow-ups page were
            saved without a name, so older periods show them as "saved without a name". Promise kept rates start with promises
            made from today on.
          </Alert>
        </>
      )}
    </Box>
  );
}
