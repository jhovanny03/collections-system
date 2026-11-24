// src/pages/InitialPayments.jsx
// Initial payments not completed: clients (and new MyCase cases) whose initial-payment
// invoice is not fully paid in MyCase. The hourly sync marks each case (initialState on
// mycaseCases, see functions/mycaseSync.js initialFlags); this page lists them.
import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Button, Card, Chip, FormControlLabel, InputAdornment, LinearProgress, Stack, Switch, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tabs, TextField, Tooltip, Typography, Link as MuiLink,
} from "@mui/material";
import SearchRounded from "@mui/icons-material/SearchRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import PhoneInTalkRounded from "@mui/icons-material/PhoneInTalkRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import { Link as RouterLink } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import db from "../firebase";
import { useClients } from "../data/ClientsProvider";
import { money, clientName } from "../billing/portfolio";
import { parseDate } from "../utils/dates";
import { PageHeader, StatCard, Tiles, Empty } from "../ui/kit";

const MYCASE = "https://law-firm-of-moumita-rahman-pllc.mycase.com/court_cases/";
const daysSince = (d) => (d ? Math.floor((Date.now() - d.getTime()) / 864e5) : null);

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
  const { byId, loading: clientsLoading } = useClients();
  const [cases, setCases] = useState(null);
  const [tab, setTab] = useState("client");
  const [search, setSearch] = useState("");
  const [showNotStarted, setShowNotStarted] = useState(false);

  useEffect(() => {
    const states = ["client", "started", "notStarted"];
    getDocs(query(collection(db, "mycaseCases"), where("initialState", "in", states)))
      .then((s) => setCases(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((e) => {
        console.error("Initial payments:", e);
        setCases([]);
      });
  }, []);

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
        caseType: c?.caseType || k.practiceArea || "",
        total: Number(k.initialTotal || 0),
        paid: Number(k.initialPaid || 0),
        due: Number(k.initialDue || 0),
        date,
        days: daysSince(date),
        stage: k.caseStage || "",
        source: c ? (c.invoiceRoles && Object.keys(c.invoiceRoles).length ? "Rebuilt from MyCase" : c.source === "mycase" ? "MyCase" : "Hand-entered") : "",
        status: c ? String(c.status || "active") : "",
      };
    });
  }, [cases, byId]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (r) => !q || r.name.toLowerCase().includes(q) || r.caseName.toLowerCase().includes(q);
    const by = (s) => rows.filter((r) => s.includes(r.state) && match(r)).sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
    return { client: by(["client"]), started: by(["started"]), notStarted: by(["notStarted"]) };
  }, [rows, search]);

  const sum = (l) => l.reduce((s, r) => s + r.due, 0);
  const newList = showNotStarted ? [...groups.started, ...groups.notStarted] : groups.started;
  const list = tab === "client" ? groups.client : newList;
  const loading = cases === null || clientsLoading;

  const exportCsv = () =>
    csv(`initial-payments-${tab}.csv`, ["Client", "Case", "Case type", "Initial", "Paid", "Still due", "Invoice date", "Days", "Source", "MyCase"],
      list.map((r) => [r.name, r.caseName, r.caseType, r.total, r.paid, r.due, r.date ? r.date.toISOString().slice(0, 10) : "", r.days ?? "", r.source, MYCASE + r.id]));

  return (
    <Box>
      <PageHeader title="Initial payments" subtitle="Initial payments that are not paid in full in MyCase: clients already in Collections, and new MyCase cases that started paying but did not finish." />
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Tiles min={210} sx={{ mb: 2.5 }}>
        <StatCard label="Clients in Collections" value={groups.client.length} sub={`${money(sum(groups.client))} of initial payments still due`} tone={groups.client.length ? "bad" : "good"} onClick={() => setTab("client")} />
        <StatCard label="New cases, started paying" value={groups.started.length} sub={`${money(sum(groups.started))} still due`} tone="warn" onClick={() => setTab("new")} />
        <StatCard label="New cases, nothing paid" value={groups.notStarted.length} sub={`${money(sum(groups.notStarted))} invoiced`} onClick={() => { setTab("new"); setShowNotStarted(true); }} help="Signed cases (not potential clients) whose first invoice has no payment yet." />
      </Tiles>

      <Card>
        <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} sx={{ px: 1, borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ flex: 1 }}>
            <Tab value="client" label={`Clients in Collections (${groups.client.length})`} />
            <Tab value="new" label={`New MyCase cases (${newList.length})`} />
          </Tabs>
          {tab === "new" && <FormControlLabel control={<Switch checked={showNotStarted} onChange={(e) => setShowNotStarted(e.target.checked)} />} label="Include nothing paid yet" sx={{ mx: 1 }} />}
          <TextField
            placeholder="Search a client or case"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ m: 1, minWidth: 220 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }}
          />
          <Button startIcon={<DownloadRounded />} onClick={exportCsv} disabled={!list.length} sx={{ mr: 1 }}>CSV</Button>
        </Stack>

        {!loading && list.length === 0 ? (
          <Empty title={search ? "No one matches" : "Nothing here"}>{tab === "client" ? "Every client in Collections has paid their initial payment in full." : null}</Empty>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{tab === "client" ? "Client" : "Case"}</TableCell>
                  <TableCell>Case type</TableCell>
                  <TableCell align="right">Initial</TableCell>
                  <TableCell align="right">Paid</TableCell>
                  <TableCell align="right">Still due</TableCell>
                  <TableCell>Invoiced</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {list.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ maxWidth: 360 }}>
                      {r.clientId ? (
                        <MuiLink component={RouterLink} to={`/client/${r.clientId}`} fontWeight={700} underline="hover">{r.name}</MuiLink>
                      ) : (
                        <Typography fontWeight={700} fontSize={14}>{r.name}</Typography>
                      )}
                      <Typography variant="caption" color="text.secondary" display="block" noWrap title={r.caseName}>
                        {r.source ? `${r.source} · ` : ""}{r.caseName}
                      </Typography>
                    </TableCell>
                    <TableCell>{r.caseType || "—"}</TableCell>
                    <TableCell align="right">{money(r.total)}</TableCell>
                    <TableCell align="right" sx={{ color: r.paid ? "success.main" : "text.disabled", fontWeight: r.paid ? 700 : 400 }}>{r.paid ? money(r.paid) : "—"}</TableCell>
                    <TableCell align="right"><Typography fontWeight={800} color="secondary.main" component="span">{money(r.due)}</Typography></TableCell>
                    <TableCell>
                      {r.date ? r.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                      {r.days != null && <Chip size="small" label={`${r.days} days`} color={r.days > 30 ? "error" : r.days > 7 ? "warning" : "default"} variant="outlined" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {r.clientId ? (
                        <Tooltip title="Log a call or note"><Button size="small" startIcon={<PhoneInTalkRounded fontSize="small" />} component={RouterLink} to={`/client/${r.clientId}?tab=notes`}>Log</Button></Tooltip>
                      ) : (
                        <Tooltip title="Set it up in Case Setup"><Button size="small" component={RouterLink} to="/case-setup">Case Setup</Button></Tooltip>
                      )}
                      <Tooltip title="Open in MyCase"><Button size="small" href={MYCASE + r.id} target="_blank" rel="noopener noreferrer" sx={{ minWidth: 0 }}><OpenInNewRounded fontSize="small" /></Button></Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
        Read from MyCase invoices. The initial-payment invoice is the one billing tagged "initial" (clients rebuilt from MyCase), the invoice for the client's initial amount (hand-entered clients), or the case's first invoice (new cases). Potential clients and closed cases are left out.
      </Typography>
    </Box>
  );
}
