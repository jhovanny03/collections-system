// src/pages/InitialPayments.jsx
// Initial payments not completed: clients (and new MyCase cases) whose initial-payment
// invoice is not fully paid in MyCase. The hourly sync marks each case (initialState on
// mycaseCases, see functions/mycaseSync.js initialFlags); this page lists them.
// Layout ("progress tracker"): the intake pipeline on top (nothing paid → started paying →
// in Collections), each open initial as a progress bar with a tick per payment, and on the
// side the initial payments collected each month, who has waited longest, and open
// initials by who created the invoice in MyCase (sales or billing).
import React, { useEffect, useMemo, useState } from "react";
import { Box, Button, Card, Chip, IconButton, InputAdornment, LinearProgress, MenuItem, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import SearchRounded from "@mui/icons-material/SearchRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import PhoneRounded from "@mui/icons-material/PhoneRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import PersonRounded from "@mui/icons-material/PersonRounded";
import PlaylistAddCheckRounded from "@mui/icons-material/PlaylistAddCheckRounded";
import { Link as RouterLink } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import db from "../firebase";
import { useBook, useBookById } from "../data/BookProvider";
import { money, clientName } from "../billing/portfolio";
import { callLink, displayPhone } from "../billing/contact";
import { parseDate } from "../utils/dates";
import { FONT_HEADING } from "../theme/brand";
import { PageHeader, Empty } from "../ui/kit";
import { grow, growX } from "../Dashboard/homeCharts";
import { initials } from "../Clients/ClientPanel";

const MYCASE = "https://law-firm-of-moumita-rahman-pllc.mycase.com/court_cases/";
const daysSince = (d) => (d ? Math.floor((Date.now() - d.getTime()) / 864e5) : null);
const STATES = {
  notStarted: { label: "Invoiced, nothing paid", short: "new case, nothing paid", color: "#2F6DB5", word: "invoiced" },
  started: { label: "New cases, started paying", short: "new case", color: "#C9961A", word: "still due" },
  client: { label: "In Collections, initial open", short: "in Collections", color: "#D34E24", word: "still due" },
};
const CHIPS = [
  ["all", "All"], ["client", "In Collections"], ["started", "Started paying"], ["notStarted", "Nothing paid"], ["old", "90+ days"], ["removal", "Removal defense"],
];
const SORTS = { oldest: "Oldest first", due: "Most still due", newest: "Newest first" };

function ageColors(theme, d) {
  if (d == null) return [theme.palette.text.secondary, alpha(theme.palette.text.primary, 0.06)];
  if (d <= 7) return [theme.palette.success.main, alpha(theme.palette.success.main, 0.12)];
  if (d <= 30) return [theme.palette.warning.main, alpha(theme.palette.warning.main, 0.14)];
  if (d <= 90) return [theme.palette.secondary.main, alpha(theme.palette.secondary.main, 0.12)];
  return [theme.palette.error.main, alpha(theme.palette.error.main, 0.1)];
}

function csv(name, header, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const url = URL.createObjectURL(new Blob([[header, ...rows].map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function InitialPayments() {
  const theme = useTheme();
  // Prepared rows by client id (name, case type, phones, status, payment source).
  const byId = useBookById();
  const { ready, byMonth } = useBook();
  const [cases, setCases] = useState(null);
  const [payments, setPayments] = useState(new Map()); // initial invoice id -> [{ date, amount }]
  // Opens on clients already in Collections (the ones to work); the pipeline shows all.
  const [chip, setChip] = useState("client");
  const [sort, setSort] = useState("oldest");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const states = ["client", "started", "notStarted"];
    getDocs(query(collection(db, "mycaseCases"), where("initialState", "in", states)))
      .then((s) => setCases(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((e) => {
        console.error("Initial payments:", e);
        setCases([]);
      });
  }, []);

  // Payments on each open initial invoice (for the ticks on the bars), 30 invoices a query.
  useEffect(() => {
    if (!cases || !cases.length) return;
    const ids = [...new Set(cases.map((k) => k.initialInvoiceId).filter(Boolean).map(String))];
    const chunks = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    Promise.all(chunks.map((c) => getDocs(query(collection(db, "mycasePayments"), where("invoiceId", "in", c)))))
      .then((snaps) => {
        const m = new Map();
        for (const s of snaps) {
          for (const d of s.docs) {
            const p = d.data();
            if (p.status !== "success" || !(Number(p.amount) > 0)) continue;
            const list = m.get(String(p.invoiceId)) || [];
            list.push({ date: p.date, amount: Number(p.amount) });
            m.set(String(p.invoiceId), list);
          }
        }
        for (const list of m.values()) list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
        setPayments(m);
      })
      .catch((e) => console.warn("Initial payment ticks:", e.message));
  }, [cases]);

  const rows = useMemo(() => {
    if (!cases) return [];
    return cases.map((k) => {
      const c = k.trackedClientId && k.trackedClientId !== "multiple" ? byId.get(k.trackedClientId) : null;
      const date = parseDate(k.initialDate) || parseDate(k.openedDate);
      return {
        id: k.id,
        state: k.initialState,
        clientId: c?.id || null,
        name: c ? clientName(c) : (k.clientNames || [])[0] || k.name,
        caseName: k.name || "",
        // An additional service's initial payment (removal defense, derivative...).
        service: k.initialService || null,
        caseType: (c?.caseType && c.caseType !== "—" ? c.caseType : "") || k.practiceArea || "",
        // Removal defense (its own case, or the service added to a client): often sold
        // outside the intake team, so it is marked and can be filtered.
        removal: /removal\s*defen[cs]e/i.test(String(k.initialService || "")) || /^removal\s*defen[cs]e/i.test(String(c?.caseType || "")) || /^removal\s*defen[cs]e/i.test(String(k.practiceArea || "")),
        total: Number(k.initialTotal || 0),
        paid: Number(k.initialPaid || 0),
        due: Number(k.initialDue || 0),
        date,
        days: daysSince(date),
        stage: k.caseStage || "",
        source: c ? c.source : "",
        phone: c ? (c.phones || c.mycasePhones || [])[0] || "" : "",
        invoiceId: k.initialInvoiceId ? String(k.initialInvoiceId) : null,
        // Who created the initial invoice in MyCase (sales or billing), when the feed sends it.
        createdBy: k.initialCreatedBy || null,
      };
    });
  }, [cases, byId]);

  const groups = useMemo(() => {
    const out = {};
    for (const s of Object.keys(STATES)) {
      const l = rows.filter((r) => r.state === s);
      out[s] = { n: l.length, due: l.reduce((t, r) => t + r.due, 0), paid: l.reduce((t, r) => t + r.paid, 0) };
    }
    return out;
  }, [rows]);
  const maxN = Math.max(1, ...Object.values(groups).map((g) => g.n));

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter(
      (r) =>
        (chip === "all" || (chip === "old" ? (r.days ?? 0) > 90 : chip === "removal" ? r.removal : r.state === chip)) &&
        (!q || r.name.toLowerCase().includes(q) || r.caseName.toLowerCase().includes(q))
    );
    out.sort((a, b) => (sort === "due" ? b.due - a.due : sort === "newest" ? (a.days ?? 1e9) - (b.days ?? 1e9) : (b.days ?? -1) - (a.days ?? -1)));
    return out;
  }, [rows, chip, search, sort]);
  const loading = cases === null || !ready;

  // Follows the filter picked above the list.
  const longest = useMemo(() => list.slice().sort((a, b) => (b.days ?? -1) - (a.days ?? -1)).slice(0, 5), [list]);
  const byCreator = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (!r.createdBy) continue;
      const x = m.get(r.createdBy) || { n: 0, due: 0, nothing: 0 };
      x.n++;
      x.due += r.due;
      if (r.state === "notStarted") x.nothing++;
      m.set(r.createdBy, x);
    }
    return [...m.entries()].sort((a, b) => b[1].due - a[1].due);
  }, [rows]);
  const months = (byMonth || []).map((m) => ({ label: m.label, value: m.initial || 0 }));
  const monthMax = Math.max(1, ...months.map((m) => m.value));
  const thisMonth = months.length ? months[months.length - 1] : null;

  const exportCsv = () =>
    csv(`initial-payments-${chip}.csv`, ["Client", "Case", "Group", "Case type", "Service", "Initial", "Paid", "Still due", "Invoice date", "Days", "Invoice created by", "MyCase"],
      list.map((r) => [r.name, r.caseName, STATES[r.state]?.label, r.caseType, r.service || "Main case", r.total, r.paid, r.due, r.date ? r.date.toISOString().slice(0, 10) : "", r.days ?? "", r.createdBy || "", MYCASE + r.id]));

  return (
    <Box>
      <PageHeader
        title="Initial payments"
        subtitle="Every open initial invoice in MyCase, from signed to paid in full. The bar shows how much of the initial is in; each tick is a payment."
        actions={<Button startIcon={<DownloadRounded />} onClick={exportCsv} disabled={!list.length}>CSV ({list.length})</Button>}
      />
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* The pipeline */}
      <Card sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, mb: 2, overflow: "visible" }}>
        {Object.entries(STATES).map(([s, def], i) => (
          <Box key={s} component="button" type="button" onClick={() => setChip(chip === s ? "all" : s)}
            sx={{
              p: 2.25, pr: 3, textAlign: "left", font: "inherit", color: "inherit", border: 0, cursor: "pointer", position: "relative",
              bgcolor: chip === s ? alpha(def.color, 0.07) : "transparent", borderLeft: { md: i ? 1 : 0 }, borderTop: { xs: i ? 1 : 0, md: 0 }, borderColor: "divider",
              "&:hover": { bgcolor: alpha(def.color, 0.05) },
              "&::after": i < 2 ? { content: '"›"', display: { xs: "none", md: "grid" }, placeItems: "center", position: "absolute", right: -11, top: "50%", transform: "translateY(-50%)", width: 22, height: 22, borderRadius: "50%", bgcolor: "background.paper", border: 1, borderColor: "divider", color: "text.secondary", fontWeight: 800, zIndex: 2 } : undefined,
            }}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Box sx={{ width: 9, height: 9, borderRadius: 0.75, bgcolor: def.color }} />
              <Typography variant="body2" fontWeight={800} color="text.secondary">{def.label}</Typography>
            </Stack>
            <Typography sx={{ font: `700 30px ${FONT_HEADING}`, lineHeight: 1.2 }}>{loading ? "—" : groups[s].n}</Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              {money(groups[s].due)} {def.word}{groups[s].paid ? ` · ${money(groups[s].paid)} paid so far` : ""}
            </Typography>
            <Box sx={{ height: 6, borderRadius: 99, bgcolor: alpha(theme.palette.text.primary, 0.07), mt: 1.25, overflow: "hidden" }}>
              <Box sx={{ height: "100%", width: `${(groups[s].n / maxN) * 100}%`, bgcolor: def.color, borderRadius: 99, transformOrigin: "left", animation: `${growX} .8s cubic-bezier(.2,.8,.2,1) both`, animationDelay: `${i * 80}ms` }} />
            </Box>
          </Box>
        ))}
      </Card>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 330px" }, alignItems: "start" }}>
        {/* The open initials */}
        <Card sx={{ overflow: "hidden" }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ p: 1.75, borderBottom: 1, borderColor: "divider" }} alignItems={{ md: "center" }}>
            <TextField size="small" placeholder="Search a client or case" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 200 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }} />
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              {CHIPS.map(([k, l]) => (
                <Chip key={k} size="small" label={k === "removal" ? `${l} · ${rows.filter((r) => r.removal).length}` : l} onClick={() => setChip(k)} color={chip === k ? "primary" : "default"} variant={chip === k ? "filled" : "outlined"} sx={{ fontWeight: 800 }} />
              ))}
            </Stack>
            <TextField size="small" select value={sort} onChange={(e) => setSort(e.target.value)} sx={{ width: 150 }}>
              {Object.entries(SORTS).map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
            </TextField>
          </Stack>
          {!loading && list.length === 0 && <Empty title={search ? "No one matches" : "Nothing open here"} />}
          {list.map((r) => {
            const share = r.total > 0 ? Math.min(1, r.paid / r.total) : 0;
            const [ac, abg] = ageColors(theme, r.days);
            // Payments that make up what is paid now (refunded or reversed ones are left out).
            const ticks = [];
            let kept = 0;
            for (const p of (r.invoiceId && payments.get(r.invoiceId)) || []) {
              if (kept + p.amount > r.paid + 0.5) break;
              kept += p.amount;
              ticks.push(p);
            }
            let run = 0;
            return (
              <Box key={r.id} sx={{ display: "grid", gridTemplateColumns: { xs: "34px 1fr auto", md: "34px minmax(150px, 1.15fr) minmax(180px, 2fr) 110px auto" }, gap: { xs: 1.25, md: 1.75 }, alignItems: "center", px: 2, py: 1.5, borderBottom: 1, borderColor: "divider", "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.025) } }}>
                <Box sx={{ width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 12, bgcolor: alpha(theme.palette.primary.main, 0.1), color: "primary.main" }}>{initials(r.name)}</Box>
                <Box sx={{ minWidth: 0 }}>
                  {r.clientId ? (
                    <Typography variant="body2" fontWeight={800} noWrap component={RouterLink} to={`/client/${r.clientId}`} sx={{ color: "text.primary", textDecoration: "none", display: "block", "&:hover": { textDecoration: "underline" } }}>{r.name}</Typography>
                  ) : (
                    <Typography variant="body2" fontWeight={800} noWrap title={r.caseName}>{r.name}</Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" noWrap component="div" title={r.caseName}>
                    {r.removal && <Box component="span" sx={{ mr: 0.75, px: 0.75, py: "1px", borderRadius: 99, bgcolor: alpha("#7B4BC4", 0.12), color: "#7B4BC4", fontWeight: 800 }}>Removal defense</Box>}
                    {[r.caseType, r.service, STATES[r.state]?.short, r.createdBy ? `by ${r.createdBy}` : null].filter(Boolean).join(" · ")}
                  </Typography>
                </Box>
                <Box sx={{ gridColumn: { xs: "1 / -1", md: "auto" }, gridRow: { xs: 2, md: "auto" } }}>
                  <Box sx={{ position: "relative", height: 12, borderRadius: 99, bgcolor: alpha(theme.palette.text.primary, 0.07) }}>
                    <Box sx={{ position: "absolute", inset: "0 auto 0 0", width: `${share * 100}%`, borderRadius: 99, background: `linear-gradient(90deg, ${theme.palette.success.main}, ${alpha(theme.palette.success.main, 0.7)})`, transformOrigin: "left", animation: `${growX} .8s cubic-bezier(.2,.8,.2,1) both` }} />
                    {ticks.map((p, i) => {
                      run += p.amount;
                      const at = Math.min(100, (run / (r.total || 1)) * 100);
                      return at < 99.5 ? (
                        <Tooltip key={i} title={`${p.date}: +${money(p.amount)}`}>
                          <Box sx={{ position: "absolute", top: -3, left: `${at}%`, width: 3, height: 18, ml: "-1.5px", borderRadius: 2, bgcolor: "background.paper", boxShadow: `0 0 0 1px ${alpha(theme.palette.success.main, 0.5)}`, cursor: "help" }} />
                        </Tooltip>
                      ) : null;
                    })}
                  </Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.6 }}>
                    <Typography variant="caption" fontWeight={700} color="text.secondary">
                      <Box component="span" sx={{ color: r.paid ? "success.main" : "text.secondary", fontWeight: 800 }}>{money(r.paid)}</Box> paid of {money(r.total)}
                      {ticks.length ? ` · ${ticks.length} payment${ticks.length === 1 ? "" : "s"}` : ""}
                    </Typography>
                    <Typography variant="caption" fontWeight={800} color="text.secondary">{Math.round(share * 100)}%</Typography>
                  </Stack>
                </Box>
                <Box sx={{ textAlign: "right" }}>
                  <Typography sx={{ font: `700 17px ${FONT_HEADING}`, color: "secondary.main" }}>{money(r.due)}</Typography>
                  {r.days != null && (
                    <Tooltip title={r.date ? `Invoiced ${r.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}>
                      <Box component="span" sx={{ display: "inline-block", fontSize: 11.5, fontWeight: 800, px: 1, py: 0.2, borderRadius: 99, color: ac, bgcolor: abg, whiteSpace: "nowrap" }}>{r.days} days</Box>
                    </Tooltip>
                  )}
                </Box>
                <Stack direction="row" spacing={0.25} sx={{ display: { xs: "none", md: "flex" } }}>
                  {r.phone ? (
                    <Tooltip title={`Call ${displayPhone(r.phone)} with RingCentral`}><IconButton size="small" color="success" href={callLink(r.phone)}><PhoneRounded fontSize="small" /></IconButton></Tooltip>
                  ) : null}
                  <Tooltip title="Open the case's invoices in MyCase"><IconButton size="small" href={`${MYCASE}${r.id}/invoices`} target="_blank" rel="noopener noreferrer"><OpenInNewRounded fontSize="small" /></IconButton></Tooltip>
                  {r.clientId ? (
                    <Tooltip title="Profile (notes, promises)"><IconButton size="small" component={RouterLink} to={`/client/${r.clientId}?tab=notes`}><PersonRounded fontSize="small" /></IconButton></Tooltip>
                  ) : (
                    <Tooltip title="Set up in Case Setup"><IconButton size="small" component={RouterLink} to="/case-setup"><PlaylistAddCheckRounded fontSize="small" /></IconButton></Tooltip>
                  )}
                </Stack>
              </Box>
            );
          })}
        </Card>

        {/* Side */}
        <Stack spacing={2}>
          <Card sx={{ p: 2.25 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1.5 }}>
              <Typography variant="body2" fontWeight={800} color="text.secondary">Initial payments collected</Typography>
              {thisMonth && <Typography variant="caption" fontWeight={800} color="text.secondary">{money(thisMonth.value)} in {String(thisMonth.label).split(" ")[0]}</Typography>}
            </Stack>
            <Stack direction="row" spacing={0.6} alignItems="flex-end" sx={{ height: 120 }}>
              {months.map((m, i) => (
                <Tooltip key={m.label} title={`${m.label}: ${money(m.value)}`}>
                  <Stack alignItems="center" justifyContent="flex-end" spacing={0.5} sx={{ flex: 1, height: "100%" }}>
                    <Box sx={{ width: "100%", height: `${Math.max(3, (m.value / monthMax) * 85)}%`, borderRadius: "5px 5px 2px 2px", bgcolor: i === months.length - 1 ? "primary.main" : alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.4 : 0.2), transformOrigin: "bottom", animation: `${grow} .6s cubic-bezier(.2,.8,.2,1) both`, animationDelay: `${i * 30}ms` }} />
                    <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ fontSize: 9.5 }}>{String(m.label)[0]}</Typography>
                  </Stack>
                </Tooltip>
              ))}
            </Stack>
          </Card>

          <Card sx={{ p: 2.25 }}>
            <Typography variant="body2" fontWeight={800} color="text.secondary" sx={{ mb: 1 }}>Waiting the longest{chip !== "all" ? ` · ${CHIPS.find((c) => c[0] === chip)?.[1]}` : ""}</Typography>
            {longest.map((r, i) => (
              <Box key={r.id} sx={{ display: "grid", gridTemplateColumns: "1fr auto", py: 0.9, borderTop: i ? 1 : 0, borderColor: "divider" }}>
                <Typography variant="body2" fontWeight={800} noWrap>{r.name}</Typography>
                <Typography variant="body2" fontWeight={800} color="error.main">{r.days != null ? `${r.days} days` : "—"}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap>{money(r.due)} due · {STATES[r.state]?.short}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap>{r.createdBy || ""}</Typography>
              </Box>
            ))}
          </Card>

          <Card sx={{ p: 2.25 }}>
            <Typography variant="body2" fontWeight={800} color="text.secondary">By who created the invoice</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>The person who made the initial invoice in MyCase (sales or billing).</Typography>
            {byCreator.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                MyCase's invoice feed doesn't include who created each invoice yet. This list fills in by itself once the feed sends it.
              </Typography>
            ) : (
              byCreator.map(([name, x], i) => (
                <Box key={name} sx={{ display: "grid", gridTemplateColumns: "1fr auto", py: 0.9, borderTop: i ? 1 : 0, borderColor: "divider" }}>
                  <Typography variant="body2" fontWeight={800}>{name}</Typography>
                  <Typography variant="body2" fontWeight={800}>{money(x.due)}</Typography>
                  <Typography variant="caption" color="text.secondary">{x.n} open initial{x.n === 1 ? "" : "s"}{x.nothing ? ` · ${x.nothing} nothing paid` : ""}</Typography>
                </Box>
              ))
            )}
          </Card>
        </Stack>
      </Box>
    </Box>
  );
}
