// src/pages/dataQuality/CloseCheckTab.jsx
// Data quality, "Termination & closing": open clients that may be terminations, are on hold
// for unpaid payments, or should already be closed (rules: src/billing/closeCheck.js,
// computed with the prepared figures). Titles a rule cannot settle can be read by Claude,
// with the client's name taken out; the page shows exactly what will be sent first.
// Nothing changes on a client until a person clicks Close or Not now.
import React, { useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Link as MuiLink, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, TextField, Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { arrayUnion, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import db, { app } from "../../firebase";
import { getActor } from "../../auth/actor";
import { money } from "../../billing/portfolio";
import { REFUND_LIMIT } from "../../billing/closeCheck";
import { Section, Empty } from "../../ui/kit";

export const GROUPS = {
  termination: { label: "Possible termination", tone: "error", help: `The title says termination in process, MyCase shows more than $${REFUND_LIMIT.toLocaleString()} refunded, the notes mention termination, a refund or another lawyer, or Claude read the title as a termination. Confirm with the case team, then close the client here once the termination is done.` },
  close: { label: "Should be closed", tone: "warning", help: "The case is closed in MyCase, its stage is Closed, its title says CLOSED, or it is paid in full and approved, but the client is still open here, so it keeps counting in the figures." },
  hold: { label: "On hold for payment", tone: "info", help: "The title says on hold for outstanding payment, or the MyCase stage is Payment Hold. Usually the step before a termination: call them before the case team terminates." },
  unclear: { label: "Title to read", tone: "default", help: "The title has a word the rules cannot settle (withdrawal, dismissed, deceased, transfer...). Read it, or have Claude read it." },
};
const callTitles = (data) => httpsCallable(getFunctions(app), "checkCaseTitles", { timeout: 300000 })(data).then((r) => r.data);

export default function CloseCheckTab({ rows, editor }) {
  const [group, setGroup] = useState("termination");
  const [showDismissed, setShowDismissed] = useState(false);
  const [done, setDone] = useState({}); // id -> "closed" | "dismissed"
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(null); // row being closed
  const [reason, setReason] = useState("");
  const [ai, setAi] = useState(null); // { step: "loading" | "preview" | "sending" | "done", texts, skipped, result }
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);

  const flagged = useMemo(() => rows.filter((r) => r.closeCheck), [rows]);
  const live = flagged.filter((r) => !r.closeCheck.dismissed);
  const byGroup = useMemo(() => {
    const m = { termination: [], close: [], hold: [], unclear: [] };
    live.forEach((r) => m[r.closeCheck.group] && m[r.closeCheck.group].push(r));
    Object.values(m).forEach((l) => l.sort((a, b) => b.closeCheck.score - a.closeCheck.score || b.amountDue - a.amountDue));
    return m;
  }, [live]);
  const dismissed = flagged.filter((r) => r.closeCheck.dismissed);
  const list = showDismissed ? dismissed : byGroup[group];
  const shown = list.slice(page * perPage, page * perPage + perPage);
  const pick = (g) => {
    setGroup(g);
    setShowDismissed(false);
    setPage(0);
  };

  async function dismiss(r) {
    setBusy(r.id);
    setError("");
    try {
      const who = getActor();
      await updateDoc(doc(db, "clients", r.id), {
        "dataQuality.closeCheck": { decision: "dismissed", signature: r.closeCheck.signature, by: who.name, at: new Date().toISOString() },
      });
      setDone((d) => ({ ...d, [r.id]: "dismissed" }));
    } catch (e) {
      setError(`Could not save ${r.name}: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  async function closeClient() {
    const r = closing;
    setBusy(r.id);
    setError("");
    try {
      const who = getActor();
      const why = reason.trim() || GROUPS[r.closeCheck.group].label;
      // Closed by a person: the MyCase sync never reopens it on its own.
      await updateDoc(doc(db, "clients", r.id), {
        status: "closed", closedAt: serverTimestamp(), closedBy: who.name, closedReason: `Closed from Data quality: ${why}`,
        communicationLogs: arrayUnion({ message: `Client closed from Data quality (${why}). Signals: ${r.closeCheck.signals.map((s) => s.label).join("; ")}.`, timestamp: new Date().toISOString(), user: who.name }),
      });
      setDone((d) => ({ ...d, [r.id]: "closed" }));
      setClosing(null);
      setReason("");
    } catch (e) {
      setError(`Could not close ${r.name}: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  async function openAi() {
    setAi({ step: "loading" });
    try {
      const r = await callTitles({ run: false });
      setAi({ step: "preview", texts: r.texts || [], skipped: r.skipped || 0 });
    } catch (e) {
      setAi(null);
      setError(`Could not list the titles: ${e.message}`);
    }
  }
  async function sendAi() {
    setAi((a) => ({ ...a, step: "sending" }));
    try {
      const r = await callTitles({ run: true });
      setAi((a) => ({ ...a, step: "done", result: r }));
    } catch (e) {
      setAi((a) => ({ ...a, step: "preview" }));
      setError(e.message);
    }
  }

  const g = GROUPS[group];
  return (
    <Section
      title="Possible terminations and clients that should be closed"
      subtitle={showDismissed ? "Marked 'Not now'. They come back if something new shows up (a new refund, a new title...)." : g.help}
      pad={false}
      action={editor && (
        <Button size="small" variant={byGroup.unclear.length ? "contained" : "outlined"} onClick={openAi}>
          Read unclear titles with Claude{byGroup.unclear.length ? ` (${byGroup.unclear.length})` : ""}
        </Button>
      )}
    >
      <Stack direction="row" spacing={1} sx={{ px: 2.25, pt: 2 }} flexWrap="wrap" useFlexGap>
        {Object.entries(GROUPS).map(([k, v]) => (
          <Chip key={k} clickable color={!showDismissed && group === k ? v.tone : "default"} variant={!showDismissed && group === k ? "filled" : "outlined"} onClick={() => pick(k)}
            label={`${v.label} · ${byGroup[k].length}${k !== "unclear" ? ` · ${money(byGroup[k].reduce((s, r) => s + r.amountDue, 0))} owed` : ""}`} />
        ))}
        <Chip clickable variant={showDismissed ? "filled" : "outlined"} onClick={() => { setShowDismissed(true); setPage(0); }} label={`Not now · ${dismissed.length}`} />
      </Stack>
      {error && <Alert severity="error" sx={{ m: 2 }} onClose={() => setError("")}>{error}</Alert>}

      {list.length === 0 ? (
        <Empty title="No one here" />
      ) : (
        <>
          <TableContainer sx={{ mt: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Client and MyCase title</TableCell>
                  <TableCell>Why it shows</TableCell>
                  <TableCell align="right">Owed now</TableCell>
                  <TableCell align="right">Refunded</TableCell>
                  <TableCell align="right">Decision</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((r) => {
                  const cc = r.closeCheck;
                  const d = done[r.id];
                  return (
                    <TableRow key={r.id} hover sx={{ opacity: d ? 0.5 : 1, verticalAlign: "top" }}>
                      <TableCell sx={{ maxWidth: 360 }}>
                        <MuiLink component={RouterLink} to={`/client/${r.id}`} fontWeight={700} underline="hover">{r.name}</MuiLink>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ wordBreak: "break-word" }}>{cc.title || "No MyCase title"}</Typography>
                      </TableCell>
                      <TableCell sx={{ minWidth: 280 }}>
                        <Stack spacing={0.5}>
                          {cc.signals.map((s) => (
                            <Box key={s.key} sx={{ display: "flex", gap: 0.75, alignItems: "flex-start", fontSize: 13, color: s.strength >= 2 ? "text.primary" : "text.secondary" }}>
                              <Box sx={{ width: 7, height: 7, mt: "6px", borderRadius: "50%", flex: "none", bgcolor: s.kind === "close" ? "warning.main" : s.strength >= 3 ? "error.main" : s.strength === 2 ? "secondary.main" : "action.disabled" }} />
                              <span>{s.ai && <Chip size="small" label="AI" color="primary" variant="outlined" sx={{ height: 18, mr: 0.5, fontSize: 10, fontWeight: 800 }} />}{s.label}</span>
                            </Box>
                          ))}
                          {cc.unclear && <Typography variant="caption" color="text.secondary">Unclear wording: read the title, or have Claude read it.</Typography>}
                          {cc.dismissed && <Typography variant="caption" color="text.secondary">Not now · {cc.dismissed.by}{cc.dismissed.at ? `, ${String(cc.dismissed.at).slice(0, 10)}` : ""}</Typography>}
                        </Stack>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{r.amountDue > 0 ? money(r.amountDue) : "—"}</TableCell>
                      <TableCell align="right">{cc.refunds ? money(cc.refunds) : "—"}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        {d ? (
                          <Chip size="small" color={d === "closed" ? "success" : "default"} label={d === "closed" ? "Closed" : "Not now"} />
                        ) : editor ? (
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button size="small" variant="contained" color={cc.group === "close" ? "warning" : "primary"} disabled={busy === r.id} onClick={() => { setClosing(r); setReason(""); }}>Close client</Button>
                            {!cc.dismissed && <Button size="small" variant="outlined" disabled={busy === r.id} onClick={() => dismiss(r)}>Not now</Button>}
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
          <TablePagination component="div" count={list.length} page={page} onPageChange={(_, p) => setPage(p)} rowsPerPage={perPage}
            onRowsPerPageChange={(e) => { setPerPage(Number(e.target.value)); setPage(0); }} rowsPerPageOptions={[25, 50, 100]} />
        </>
      )}
      {Object.keys(done).length > 0 && (
        <Alert severity="success" variant="outlined" sx={{ m: 2 }}>
          {Object.keys(done).length} decided. They leave this list once the figures are updated (button at the top, or the next sync).
        </Alert>
      )}

      {/* Close a client */}
      <Dialog open={!!closing} onClose={() => !busy && setClosing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Close {closing && closing.name}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            The client stops counting as owing in Collections and no more payments are expected. A note is added to their log. You can reopen them from their profile; the MyCase sync never reopens a client closed by a person.
          </Typography>
          {closing && closing.amountDue > 0 && <Alert severity="warning" sx={{ mb: 1.5 }}>They show {money(closing.amountDue)} owed now: closing takes it off the follow-up lists and the figures.</Alert>}
          <TextField fullWidth size="small" label="Reason (optional)" placeholder={closing ? GROUPS[closing.closeCheck.group].label : ""} value={reason} onChange={(e) => setReason(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClosing(null)} disabled={!!busy}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={closeClient} disabled={!!busy}>{busy ? "Closing…" : "Close client"}</Button>
        </DialogActions>
      </Dialog>

      {/* Claude reads the unclear titles */}
      <Dialog open={!!ai} onClose={() => ai && ai.step !== "sending" && setAi(null)} maxWidth="md" fullWidth>
        <DialogTitle>Read unclear titles with Claude</DialogTitle>
        <DialogContent>
          {ai && ai.step === "loading" && <Stack alignItems="center" sx={{ py: 3 }}><CircularProgress size={28} /></Stack>}
          {ai && (ai.step === "preview" || ai.step === "sending") && (
            ai.texts.length === 0 ? (
              <Typography>No titles are waiting: every unclear title has been read, or none was found.{ai.skipped ? ` ${ai.skipped} title${ai.skipped === 1 ? "" : "s"} could not be cleaned of the client's name, so ${ai.skipped === 1 ? "it is" : "they are"} not sent.` : ""}</Typography>
            ) : (
              <>
                <Typography variant="body2" sx={{ mb: 1.5 }}>
                  Only these {ai.texts.length} title{ai.texts.length === 1 ? "" : "s"} go to Claude, exactly as shown: the client's name is replaced with [client] and nothing else from the record is sent (no balance, notes or ids). Claude answers termination, should be closed or not ending, with a short reason; the answer shows as one more signal and a person still decides.
                  {ai.skipped ? ` ${ai.skipped} title${ai.skipped === 1 ? "" : "s"} could not be cleaned of the name and will not be sent.` : ""}
                </Typography>
                <Box component="ol" sx={{ m: 0, pl: 3, maxHeight: 340, overflow: "auto", bgcolor: "action.hover", borderRadius: 2, py: 1, fontSize: 13 }}>
                  {ai.texts.map((t, i) => <li key={i}>{t}</li>)}
                </Box>
              </>
            )
          )}
          {ai && ai.step === "done" && (
            ai.result.status === "not-set-up" ? (
              <Alert severity="info">The AI is not set up: save the Anthropic key in %USERPROFILE%\.collections-secrets\anthropic.env and restart the local functions server.</Alert>
            ) : (
              <Alert severity="success">
                Claude read {ai.result.read} title{ai.result.read === 1 ? "" : "s"}: {ai.result.tags ? `${ai.result.tags.termination} termination, ${ai.result.tags.should_close} should be closed, ${ai.result.tags.not_ending} not ending` : ""}. The figures were updated; the list refreshes in a moment.
              </Alert>
            )
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAi(null)} disabled={ai && ai.step === "sending"}>{ai && ai.step === "done" ? "Close" : "Cancel"}</Button>
          {ai && (ai.step === "preview" || ai.step === "sending") && ai.texts.length > 0 && (
            <Button variant="contained" onClick={sendAi} disabled={ai.step === "sending"} startIcon={ai.step === "sending" ? <CircularProgress size={14} color="inherit" /> : null}>
              {ai.step === "sending" ? "Claude is reading…" : `Send ${ai.texts.length} title${ai.texts.length === 1 ? "" : "s"} to Claude`}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Section>
  );
}
