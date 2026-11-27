// src/ClientFollowUps/FollowUpPanel.jsx
// The right side of the Follow-ups call queue: the selected client, what they missed, and
// the call log (outcome, reason, note, next date, promise) saved the same way as before.
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, Chip, InputAdornment, MenuItem, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { Link as RouterLink } from "react-router-dom";
import { arrayUnion, doc, onSnapshot } from "firebase/firestore";
import PhoneRounded from "@mui/icons-material/PhoneRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import PaidRounded from "@mui/icons-material/PaidRounded";
import EventRounded from "@mui/icons-material/EventRounded";
import StickyNote2Rounded from "@mui/icons-material/StickyNote2Rounded";
import PhoneCallbackRounded from "@mui/icons-material/PhoneCallbackRounded";
import PhoneMissedRounded from "@mui/icons-material/PhoneMissedRounded";
import ForumRounded from "@mui/icons-material/ForumRounded";
import HandshakeRounded from "@mui/icons-material/HandshakeRounded";
import SavingsRounded from "@mui/icons-material/SavingsRounded";
import TaskAltRounded from "@mui/icons-material/TaskAltRounded";
import db from "../firebase";
import { getActor } from "../auth/actor";
import { ago, callLink, displayPhone } from "../billing/contact";
import { withMyCasePayments } from "../billing/mycaseOverlay";
import { FONT_HEADING } from "../theme/brand";
import { historyOf, initials } from "../Clients/ClientPanel";
import { savePaymentPromise } from "../ClientDashboard/PaymentPromise";
import { updateCohortItem, updateClientCommunication } from "./followUps.service";
import { FOLLOW_UP_STATUS } from "./followUps.types";
import { NON_PAY_REASONS, STATUS, money, reasonLabel, shortDate } from "./followUps.ui";
import { BANDS } from "../billing/callPriority";

// What happened on the call (keys 1–5).
const OUTCOMES = [
  { status: FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT, label: "No answer", Icon: PhoneMissedRounded },
  { status: FOLLOW_UP_STATUS.REACHED_WORKING, label: "Contacted", Icon: ForumRounded },
  { status: FOLLOW_UP_STATUS.PROMISE, label: "Promised", Icon: HandshakeRounded },
  { status: FOLLOW_UP_STATUS.PARTIAL_PAYMENT, label: "Partial", Icon: SavingsRounded },
  { status: FOLLOW_UP_STATUS.RESOLVED, label: "Resolved", Icon: TaskAltRounded },
];

function Stat({ label, value, sub, color }) {
  return (
    <Box sx={{ px: 2.5, py: 1.75, minWidth: 0 }}>
      <Typography variant="caption" fontWeight={800} color="text.secondary">{label}</Typography>
      <Typography sx={{ font: `700 21px ${FONT_HEADING}`, color, lineHeight: 1.25 }} noWrap>{value}</Typography>
      <Typography variant="caption" color="text.secondary" fontWeight={700} noWrap component="div">{sub}</Typography>
    </Box>
  );
}

export default function FollowUpPanel({ row, client, cohortId, onSaved, onNextDate, onNext, notify }) {
  const theme = useTheme();
  const [doc_, setDoc] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [promise, setPromise] = useState({ amount: "", date: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rowId = row?.id;
  useEffect(() => {
    setDoc(null);
    setOutcome(null);
    setNote("");
    setError("");
    setPromise({ amount: "", date: "" });
    if (!rowId) return undefined;
    return onSnapshot(doc(db, "clients", rowId), (s) => setDoc(s.exists() ? { id: s.id, ...s.data() } : null), () => setDoc(null));
  }, [rowId]);
  useEffect(() => {
    setReason(row?.nonPayReason || "");
    setCustom(row?.nonPayReasonCustom || "");
  }, [rowId]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only when another client is picked

  // 1–5 pick the outcome (ignored while typing).
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.closest?.("[role=dialog],[role=listbox],[role=menu]"))) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const i = "12345".indexOf(e.key);
      if (i >= 0 && rowId) setOutcome((o) => (o === OUTCOMES[i].status ? null : OUTCOMES[i].status));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rowId]);

  const history = useMemo(() => {
    const out = doc_ ? historyOf(withMyCasePayments(doc_)) : [];
    if (row?.history?.length && !doc_) {
      for (const h of row.history) out.push({ at: new Date(h.at), kind: "followup", title: STATUS[h.status]?.label || h.status, text: h.note, by: h.by });
    }
    return out.slice(0, 7);
  }, [doc_, row]);

  if (!row) {
    return (
      <Card sx={{ p: 6, textAlign: "center" }}>
        <Typography color="text.secondary">Pick a client on the left.</Typography>
      </Card>
    );
  }

  const phone = client?.phones?.[0] || client?.mycasePhones?.[0];
  const st = STATUS[row.status] || STATUS[FOLLOW_UP_STATUS.PENDING];
  const owes = Number(row.section === "behind" ? row.pastDueTotal : row.amountDueCurrentMonth) || 0;
  const calls = (row.attemptCount || 0) + (row.rcCalls || 0);
  const lc = client?.lastContact;
  const lcAt = lc?.at ? new Date(lc.at) : null;
  const chosen = OUTCOMES.find((o) => o.status === outcome);
  const paid = !!row.resolvedReason;

  const save = async () => {
    if (!chosen) return;
    if (chosen.status === FOLLOW_UP_STATUS.PROMISE && (!promise.amount || !promise.date)) {
      setError("Enter the promised amount and date.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const timestamp = new Date().toISOString();
      const who = getActor();
      const text = note.trim() || chosen.label;
      const reasonCustom = reason === "OTHER" ? custom.trim() : "";
      await updateClientCommunication(row.id, { message: `[Follow-Ups • ${chosen.status.replace(/-/g, " ")}] ${text}`, timestamp, source: "follow-ups" });
      const update = {
        status: chosen.status, attemptCount: (row.attemptCount || 0) + 1, lastContactAt: timestamp, lastContactSummary: text.slice(0, 140),
        nonPayReason: reason || null, nonPayReasonCustom: reasonCustom, lastContactBy: who.name, lastContactByEmail: who.email,
      };
      // One entry per call: the Team page counts calls, outcomes and who made them.
      await updateCohortItem(cohortId, row.id, { clientName: row.clientName, section: row.section, ...update, history: arrayUnion({ at: timestamp, by: who.name, byEmail: who.email, status: chosen.status, reason: reason || null, note: text.slice(0, 280) }) });
      if (chosen.status === FOLLOW_UP_STATUS.PROMISE) await savePaymentPromise(row.id, promise.date, promise.amount, note.trim());
      onSaved(row, update);
      if (chosen.status === FOLLOW_UP_STATUS.RESOLVED) window.open(`/client/${row.id}?recordPayment=1`, "_blank", "noopener,noreferrer");
      notify({ type: "success", msg: `Saved: ${chosen.label} · ${row.clientName}` });
      onNext();
    } catch (e) {
      setError(e.message || "Could not save the call.");
    } finally {
      setSaving(false);
    }
  };

  const evStyle = {
    call: [theme.palette.success.main, PhoneCallbackRounded],
    followup: [theme.palette.info.main, PhoneRounded],
    promise: [theme.palette.warning.main, EventRounded],
    payment: [theme.palette.primary.main, PaidRounded],
    note: [theme.palette.text.secondary, StickyNote2Rounded],
  };

  return (
    <Card key={row.id} sx={{ overflow: "hidden", animation: "fuIn .25s ease-out", "@keyframes fuIn": { from: { opacity: 0, transform: "translateY(6px)" } } }}>
      {/* Header */}
      <Stack direction={{ xs: "column", xl: "row" }} spacing={2} sx={{ p: 2.5, pb: 2, borderBottom: 1, borderColor: "divider" }} alignItems={{ xl: "flex-start" }}>
        <Stack direction="row" spacing={2} sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ width: 52, height: 52, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 18, bgcolor: alpha(theme.palette.primary.main, 0.12), color: "primary.main" }}>{initials(row.clientName)}</Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" component={RouterLink} to={`/client/${row.id}`} sx={{ color: "text.primary", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>{row.clientName}</Typography>
            <Typography variant="body2" color="text.secondary">
              {[client?.caseType && client.caseType !== "—" ? client.caseType : null, paid ? (row.resolvedReason === "paid" ? `paid ${shortDate(row.paidDate)}` : "no longer due") : row.planEnded ? "plan ended, still owes" : row.section === "current" ? "was current, missed this month" : `${row.monthsBehind} months behind`].filter(Boolean).join(" · ")}
            </Typography>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              <Chip size="small" label={paid ? "Paid" : st.label} color={paid ? "success" : st.color} variant={st.color === "default" && !paid ? "outlined" : "filled"} />
              {reasonLabel(row) && <Chip size="small" variant="outlined" label={reasonLabel(row)} />}
              {row.nextFollowUpAt && <Chip size="small" variant="outlined" icon={<EventRounded />} label={`Next: ${shortDate(row.nextFollowUpAt)}`} />}
              {client?.promise?.date && <Chip size="small" color="warning" variant="outlined" label={`Promised ${money(client.promise.amount)} on ${String(client.promise.date).slice(0, 10)}`} />}
            </Stack>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ flex: "none" }}>
          {phone ? (
            <Button variant="contained" color="success" startIcon={<PhoneRounded />} href={callLink(phone)} title="Call with RingCentral (C)">{displayPhone(phone)}</Button>
          ) : (
            <Chip label="No phone in MyCase" variant="outlined" />
          )}
          {row.myCaseLink && <Button variant="outlined" endIcon={<OpenInNewRounded />} href={row.myCaseLink} target="_blank" rel="noopener noreferrer">MyCase</Button>}
          <Button variant="outlined" component={RouterLink} to={`/client/${row.id}`}>Profile</Button>
        </Stack>
      </Stack>

      {/* Numbers */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, borderBottom: 1, borderColor: "divider", "& > div + div": { borderLeft: { md: 1 }, borderColor: { md: "divider" } } }}>
        <Stat label={row.section === "behind" ? "Owes" : "Missed"} value={money(owes)} sub={row.section === "behind" ? "all past due" : "this month's installment"} color={paid ? "success.main" : "secondary.main"} />
        <Stat label="Balance left" value={client ? money(client.balance) : "—"} sub={client?.lastPayment ? `last paid ${money(client.lastPayment.amount)} · ${shortDate(client.lastPayment.date)}` : "no payment yet"} />
        <Stat label="Calls this month" value={calls} sub={row.lastContactBy ? `last by ${row.lastContactBy}` : calls ? "from RingCentral" : "none yet"} />
        <Stat label="Last contact" value={lcAt ? ago(lcAt) : "Never"} sub={lc?.by ? `${lc.by}${lc.source === "ringcentral" ? " · RingCentral" : ""}` : " "} color={!lcAt || Date.now() - lcAt.getTime() > 30 * 864e5 ? "error.main" : undefined} />
      </Box>

      {/* Likely to pay, and when to call (src/billing/callPriority.js) */}
      {client?.callPriority && !paid && (() => {
        const cp = client.callPriority;
        const band = BANDS.find((b) => b.key === cp.band) || BANDS[1];
        const bc = { high: theme.palette.success.main, medium: theme.palette.warning.main, low: theme.palette.error.main }[cp.band];
        return (
          <Box sx={{ px: 2.5, py: 1.75, borderBottom: 1, borderColor: "divider", display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1.3fr 1fr" } }}>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Typography variant="body2" fontWeight={800} color="text.secondary">Likely to pay this month</Typography>
                <Box component="span" sx={{ fontSize: 12, fontWeight: 800, px: 1, py: 0.25, borderRadius: 99, color: bc, bgcolor: alpha(bc, 0.12) }}>{band.label}</Box>
                {band.paidRate != null && (
                  <Tooltip title="How often clients with a score like this paid that month's installment on the September and October follow-up lists.">
                    <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ cursor: "help" }}>{Math.round(band.paidRate * 100)}% of clients like this paid</Typography>
                  </Tooltip>
                )}
              </Stack>
              <Stack spacing={0.4} sx={{ mt: 1 }}>
                {(cp.reasons || []).map((r, i) => (
                  <Typography key={i} variant="body2" sx={{ display: "flex", gap: 0.75, alignItems: "baseline" }}>
                    <Box component="span" sx={{ fontWeight: 800, color: r.good === true ? "success.main" : r.good === false ? "error.main" : "text.secondary" }}>{r.good === true ? "✓" : r.good === false ? "✕" : "•"}</Box>
                    {r.text}
                  </Typography>
                ))}
              </Stack>
            </Box>
            {cp.best && (
              <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(theme.palette.primary.main, 0.05) }}>
                <Typography variant="caption" fontWeight={800} color="text.secondary">Best time to call</Typography>
                {cp.best.own ? (
                  <>
                    <Typography sx={{ font: `700 19px ${FONT_HEADING}` }}>{cp.best.day ? `${cp.best.day}s, ` : ""}{cp.best.slot}</Typography>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>They were {cp.best.basis}</Typography>
                  </>
                ) : (
                  <>
                    <Typography sx={{ font: `700 16px ${FONT_HEADING}`, color: "text.secondary" }}>Not enough call history yet</Typography>
                    <Typography variant="caption" color="text.secondary" fontWeight={700} component="div">
                      {cp.best.tries ? `${cp.best.tries} call${cp.best.tries === 1 ? "" : "s"} so far, ${cp.best.answered || 0} answered` : "No RingCentral calls with them yet"}: a best time shows once they've answered 2 calls.
                    </Typography>
                  </>
                )}
              </Box>
            )}
          </Box>
        );
      })()}

      {/* Log this call */}
      <Box sx={{ p: 2.5, borderBottom: 1, borderColor: "divider", bgcolor: alpha(theme.palette.primary.main, 0.025) }}>
        <Typography variant="body2" fontWeight={800} color="text.secondary" sx={{ mb: 1.25 }}>Log this call</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(3, 1fr)", md: "repeat(5, 1fr)" }, gap: 1, mb: 1.5 }}>
          {OUTCOMES.map((o, i) => {
            const on = outcome === o.status;
            return (
              <Box key={o.status} component="button" type="button" onClick={() => setOutcome(on ? null : o.status)}
                sx={{
                  border: 1.5, borderColor: on ? "primary.main" : "divider", borderRadius: 3, py: 1.25, px: 1, cursor: "pointer", font: "inherit", fontWeight: 800, fontSize: 13,
                  bgcolor: on ? "primary.main" : "background.paper", color: on ? "primary.contrastText" : "text.primary", transition: ".12s",
                  "&:hover": { borderColor: "primary.main", transform: "translateY(-1px)" }, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.25,
                }}>
                <o.Icon sx={{ fontSize: 20 }} />
                <span>{o.label}</span>
                <Box component="span" sx={{ fontSize: 10.5, opacity: 0.55 }}>{i + 1}</Box>
              </Box>
            );
          })}
        </Box>
        <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", md: "1fr 1.4fr 170px" } }}>
          <TextField size="small" select label="Why not paying?" value={reason} onChange={(e) => setReason(e.target.value)}>
            <MenuItem value="">—</MenuItem>
            {NON_PAY_REASONS.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Note" placeholder="Left a voicemail, spoke with the client…" value={note} onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && chosen && !saving) save(); }} />
          <TextField size="small" type="date" label="Next follow-up" InputLabelProps={{ shrink: true }} value={String(row.nextFollowUpAt || "").slice(0, 10)} onChange={(e) => onNextDate(row, e.target.value)} />
          {reason === "OTHER" && <TextField size="small" label="Reason" value={custom} onChange={(e) => setCustom(e.target.value)} />}
          {chosen?.status === FOLLOW_UP_STATUS.PROMISE && (
            <>
              <TextField size="small" type="number" label="Promised amount" value={promise.amount} onChange={(e) => setPromise((p) => ({ ...p, amount: e.target.value }))} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
              <TextField size="small" type="date" label="They will pay on" InputLabelProps={{ shrink: true }} value={promise.date} onChange={(e) => setPromise((p) => ({ ...p, date: e.target.value }))} />
            </>
          )}
        </Box>
        {error && <Alert severity="error" sx={{ mt: 1.25 }}>{error}</Alert>}
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>
            {chosen?.status === FOLLOW_UP_STATUS.RESOLVED ? "Opens the profile to record the payment." : "Saved to the client's history and the Team page."}
          </Typography>
          <Button variant="contained" disabled={!chosen || saving} onClick={save}>{saving ? "Saving…" : "Save & next client →"}</Button>
        </Stack>
      </Box>

      {/* History */}
      <Box sx={{ p: 2.5 }}>
        <Typography variant="body2" fontWeight={800} color="text.secondary" sx={{ mb: 1.5 }}>History</Typography>
        {history.length === 0 && <Typography variant="body2" color="text.secondary">{doc_ ? "Nothing yet." : "Loading…"}</Typography>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, columnGap: 3 }}>
          {history.map((e, i) => {
            const [c, Icon] = evStyle[e.kind] || evStyle.note;
            return (
              <Box key={i} sx={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 1.25, pb: 1.5 }}>
                <Box sx={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: alpha(c, 0.14), color: c }}><Icon sx={{ fontSize: 14 }} /></Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={800} sx={{ textTransform: e.kind === "followup" ? "capitalize" : "none" }}>{e.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{[e.by, e.at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: e.at.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })].filter(Boolean).join(" · ")}</Typography>
                  {e.text && (
                    <Tooltip title={e.text.length > 120 ? e.text : ""}>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.text}</Typography>
                    </Tooltip>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Card>
  );
}
