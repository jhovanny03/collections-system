// src/pages/LinkProblems.jsx
// Case Setup, "Link problems" tab: Collections records the MyCase sync cannot match to
// exactly one case (built by the sync: functions/linkIssues.js).
//   - No MyCase case link: their payments never sync. The case is suggested from what the
//     link points at (contact page, invoice, payment plan) or from the case title.
//   - Several records on one case: usually a duplicate; billing keeps one for MyCase.
import React, { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Link, Paper, Stack, Typography } from "@mui/material";
import { collection, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Link as RouterLink } from "react-router-dom";
import db, { app } from "../firebase";

const MYCASE = "https://law-firm-of-moumita-rahman-pllc.mycase.com/court_cases/";
const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function LinkProblems() {
  const [issues, setIssues] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState({});
  const [notes, setNotes] = useState({});

  useEffect(() => onSnapshot(
    collection(db, "mycaseLinkIssues"),
    (snap) => setIssues(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => { console.error(e); setError("Could not load link problems."); setIssues([]); }
  ), []);

  const call = async (key, fn, payload, done) => {
    setBusy((b) => ({ ...b, [key]: true }));
    setNotes((n) => ({ ...n, [key]: "" }));
    try {
      await httpsCallable(getFunctions(app), fn)(payload);
      setNotes((n) => ({ ...n, [key]: done }));
    } catch (e) {
      console.error(e);
      setNotes((n) => ({ ...n, [key]: e.message || "Could not save." }));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  if (issues === null) return <CircularProgress />;
  const unlinked = issues.filter((i) => i.type === "unlinked")
    .sort((a, b) => (b.candidates?.length === 1) - (a.candidates?.length === 1) || a.clientName.localeCompare(b.clientName));
  const shared = issues.filter((i) => i.type === "shared");

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!unlinked.length && !shared.length && <Alert severity="success">Every open record is matched to exactly one MyCase case.</Alert>}

      {shared.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Several records on one case ({shared.length})</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            The sync cannot tell which record gets this case&apos;s payments, so they are held on MyCase Review.
            Keep the one for MyCase: the others stay in Collections as they are, but no longer get MyCase payments.
          </Typography>
          <Stack spacing={1.5}>
            {shared.map((s) => (
              <Paper key={s.id} variant="outlined" sx={{ p: 1.5 }}>
                <Typography variant="subtitle2">
                  {s.caseName || `Case ${s.caseId}`}{" "}
                  <Link variant="caption" href={MYCASE + s.caseId} target="_blank" rel="noopener noreferrer">Open in MyCase</Link>
                </Typography>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mt: 1 }}>
                  {s.clients.map((c) => {
                    const key = `${s.id}_${c.clientId}`;
                    return (
                      <Paper key={c.clientId} variant="outlined" sx={{ p: 1.5, flex: 1 }}>
                        <Link component={RouterLink} to={`/client/${c.clientId}`} variant="body2" sx={{ fontWeight: 600 }}>{c.clientName}</Link>
                        <Typography variant="caption" color="text.secondary" display="block">{c.caseTitle}</Typography>
                        <Typography variant="caption" display="block">
                          {c.status} · {c.caseStatus || "—"} · total {money(c.invoiceTotal)} · {c.payments} payment{c.payments === 1 ? "" : "s"} ({money(c.paid)})
                          {c.lastPayment ? ` · last ${c.lastPayment}` : ""}{c.createdAt ? ` · created ${String(c.createdAt).slice(0, 10)}` : ""}
                        </Typography>
                        <Button size="small" variant="outlined" sx={{ mt: 1 }} disabled={!!busy[key]}
                          onClick={() => call(key, "keepMyCaseRecord", { caseId: s.caseId, clientId: c.clientId }, "Kept for MyCase.")}>
                          Keep this one for MyCase
                        </Button>
                        {notes[key] && <Typography variant="caption" color="warning.main" display="block">{notes[key]}</Typography>}
                      </Paper>
                    );
                  })}
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Box>
      )}

      {unlinked.length > 0 && (
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>No MyCase case link ({unlinked.length})</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Their MyCase link is not a case page (often the client&apos;s contact page), so their MyCase payments never
            come in. Check the suggested case and link it; the record then moves to &quot;Existing clients to tag&quot;
            so its payment history is rebuilt from MyCase.
          </Typography>
          <Stack spacing={1.5}>
            {unlinked.map((u) => (
              <Paper key={u.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Link component={RouterLink} to={`/client/${u.clientId}`} variant="body2" sx={{ fontWeight: 600 }}>{u.clientName}</Link>
                    <Typography variant="caption" color="text.secondary" display="block">{u.caseTitle || "(no case title)"}</Typography>
                    <Typography variant="caption" display="block">{u.status} · {u.caseStatus || "—"}{u.caseType ? ` · ${u.caseType}` : ""}</Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ wordBreak: "break-all" }}>
                      Current link: {u.link || "(empty)"}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1.4 }}>
                    {!u.candidates?.length && (
                      <Typography variant="body2" color="text.secondary">
                        No case could be found from the link or title. Find the case in MyCase and paste its link on Edit Client.
                      </Typography>
                    )}
                    {(u.candidates || []).map((k) => {
                      const key = `${u.id}_${k.caseId}`;
                      return (
                        <Box key={k.caseId} sx={{ mb: 1 }}>
                          <Typography variant="body2" component="div">
                            {k.name}{" "}
                            <Chip size="small" label={k.status || "?"} color={k.status === "closed" ? "default" : "success"} sx={{ height: 18 }} />
                          </Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {k.reason}{k.openedDate ? ` · opened ${k.openedDate}` : ""}{k.caseStage ? ` · stage: ${k.caseStage}` : ""}
                          </Typography>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Button size="small" variant="outlined" disabled={!!busy[key]}
                              onClick={() => call(key, "linkMyCaseClient", { clientId: u.clientId, caseId: k.caseId }, "Linked.")}>
                              Link to this case
                            </Button>
                            <Link variant="caption" href={MYCASE + k.caseId} target="_blank" rel="noopener noreferrer">Open in MyCase</Link>
                          </Stack>
                          {notes[key] && <Typography variant="caption" color="warning.main" display="block">{notes[key]}</Typography>}
                        </Box>
                      );
                    })}
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );
}
