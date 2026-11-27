// src/Clients/ClientPanel.jsx
// The right side of the Clients work queue: the selected client's money, the last 12 months
// of installments, contact history, and a quick way to log the call without leaving the list.
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, Chip, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { Link as RouterLink } from "react-router-dom";
import { arrayUnion, doc, getDoc, onSnapshot } from "firebase/firestore";
import PhoneRounded from "@mui/icons-material/PhoneRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import PaidRounded from "@mui/icons-material/PaidRounded";
import EventRounded from "@mui/icons-material/EventRounded";
import StickyNote2Rounded from "@mui/icons-material/StickyNote2Rounded";
import PhoneCallbackRounded from "@mui/icons-material/PhoneCallbackRounded";
import db from "../firebase";
import { money, pct } from "../billing/portfolio";
import { planLedger } from "../billing/ledger";
import { planViews } from "../billing/plans";
import { withMyCasePayments } from "../billing/mycaseOverlay";
import { ago, callLink, displayPhone } from "../billing/contact";
import { parseDate } from "../utils/dates";
import { FONT_HEADING } from "../theme/brand";
import { grow, growX } from "../Dashboard/homeCharts";
import { getActor } from "../auth/actor";
import { getCohortIdFromAnchor, updateClientCommunication, updateCohortItem } from "../ClientFollowUps/followUps.service";
import { FOLLOW_UP_STATUS } from "../ClientFollowUps/followUps.types";
import { savePaymentPromise } from "../ClientDashboard/PaymentPromise";

const pad2 = (n) => String(n).padStart(2, "0");
const ymOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
export const initials = (name) => String(name || "").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

// Call outcomes, saved the same way as the Follow-ups page so they count everywhere.
const OUTCOMES = [
  { key: "reached", label: "Reached", status: FOLLOW_UP_STATUS.REACHED_WORKING },
  { key: "noanswer", label: "No answer", status: FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT },
  { key: "voicemail", label: "Left voicemail", status: FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT, prefix: "Left voicemail." },
  { key: "promise", label: "Promised to pay", status: FOLLOW_UP_STATUS.PROMISE },
  { key: "wrong", label: "Wrong number", status: FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT, prefix: "Wrong number." },
];

/** Installments due and paid in each of the last 12 months, all plans combined. */
function lastTwelve(client, now = new Date()) {
  const keys = [];
  for (let i = 11; i >= 0; i--) keys.push(ymOf(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  const map = new Map(keys.map((k) => [k, { ym: k, amount: 0, paid: 0 }]));
  let paidTotal = 0, balance = 0, monthly = 0, lastDue = "";
  for (const v of planViews(client)) {
    let led;
    try {
      led = planLedger(v, now);
    } catch (e) {
      continue;
    }
    paidTotal += led.paidTotal;
    for (const m of led.months) if (m.ym > lastDue) lastDue = m.ym;
    balance += led.balance;
    for (const m of led.months) {
      const slot = map.get(m.ym);
      if (slot) {
        slot.amount += m.amount;
        slot.paid += m.paid;
      }
    }
    const nowSlot = led.months.find((m) => m.ym === ymOf(now));
    monthly += nowSlot ? nowSlot.amount : Number(v.installmentAmount || 0);
  }
  return { months: keys.map((k) => map.get(k)), paidTotal, balance, monthly, lastDue };
}

/** Notes, calls, promises and payments, newest first. */
export function historyOf(client) {
  const out = [];
  const seen = new Set();
  for (const log of [...(client.communicationLogs || []), ...(client.communicationLog || [])]) {
    const at = parseDate(log.timestamp);
    const key = `${log.timestamp}|${log.message}`;
    if (!at || seen.has(key)) continue;
    seen.add(key);
    const msg = String(log.message || "");
    const kind = /^Call \(RingCentral\)/.test(msg) ? "call" : /^\[Follow-Ups/.test(msg) ? "followup" : /promised to pay/i.test(msg) ? "promise" : "note";
    let title = msg, text = "";
    const m = msg.match(/^\[Follow-Ups\s*•\s*([^\]]+)\]\s*(.*)$/s);
    if (m) {
      title = m[1].replace(/-/g, " ");
      text = m[2];
    } else if (kind === "call") {
      title = msg.replace(/^Call \(RingCentral\):\s*/, "Call: ");
    } else if (msg.length > 90) {
      title = kind === "promise" ? "Promise to pay" : "Note";
      text = msg;
    }
    out.push({ at, kind, title, text, by: log.user || "" });
  }
  for (const p of client.payments || []) {
    const at = parseDate(p.date);
    if (!at || !(Number(p.amount) > 0) || p.status === "cancelled") continue;
    out.push({ at, kind: "payment", title: `Paid ${money(p.amount)}${p.kind === "initial" ? " (initial)" : ""}`, by: String(p.paymentId || "").startsWith("mycase_") || p.source === "mycase" ? "MyCase" : p.recordedBy || "" });
  }
  return out.sort((a, b) => b.at - a.at);
}

function Stat({ label, value, sub, color }) {
  return (
    <Box sx={{ px: 2.5, py: 1.75, minWidth: 0 }}>
      <Typography variant="caption" fontWeight={800} color="text.secondary">{label}</Typography>
      <Typography sx={{ font: `700 22px ${FONT_HEADING}`, color, lineHeight: 1.25 }} noWrap>{value}</Typography>
      <Typography variant="caption" color="text.secondary" fontWeight={700}>{sub}</Typography>
    </Box>
  );
}

export default function ClientPanel({ row, status, editor, admin, onEdit, onDelete, onLogged, notify }) {
  const theme = useTheme();
  const [client, setClient] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [note, setNote] = useState("");
  const [promise, setPromise] = useState({ amount: "", date: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Keyed on the id: the prepared rows refresh in the background and must not reset a note being typed.
  const rowId = row?.id;
  useEffect(() => {
    setClient(null);
    setOutcome(null);
    setNote("");
    setError("");
    if (!rowId) return undefined;
    return onSnapshot(doc(db, "clients", rowId), (s) => setClient(s.exists() ? { id: s.id, ...s.data() } : null), () => setClient(null));
  }, [rowId]);

  const view = useMemo(() => (client ? withMyCasePayments(client) : null), [client]);
  const twelve = useMemo(() => (view ? lastTwelve(view) : null), [view]);
  const history = useMemo(() => (view ? historyOf(view).slice(0, 8) : []), [view]);

  if (!row) {
    return (
      <Card sx={{ p: 6, textAlign: "center" }}>
        <Typography color="text.secondary">Pick a client on the left.</Typography>
      </Card>
    );
  }

  const phone = row.phones?.[0];
  const planCount = (client?.plans || []).length;
  const nowYm = ymOf(new Date());
  const pastThe15th = new Date().getDate() >= 15;
  const maxAmt = Math.max(1, ...(twelve?.months || []).map((m) => m.amount));
  const planTotal = twelve ? twelve.paidTotal + twelve.balance : 0;
  const paidShare = planTotal > 0 ? twelve.paidTotal / planTotal : 0;
  const chosen = OUTCOMES.find((o) => o.key === outcome);

  const save = async () => {
    if (!chosen) return;
    if (chosen.key === "promise" && (!promise.amount || !promise.date)) {
      setError("Enter the promised amount and date.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const timestamp = new Date().toISOString();
      const text = [chosen.prefix, note.trim()].filter(Boolean).join(" ") || chosen.label;
      await updateClientCommunication(row.id, { message: `[Follow-Ups • ${chosen.status.replace(/-/g, " ")}] ${text}`, timestamp, source: "clients" });
      // Keep this month's Follow-ups list in step when the client is on it (never adds them).
      const cohortId = getCohortIdFromAnchor(new Date());
      const item = await getDoc(doc(db, "followUpsCohorts", cohortId, "items", row.id));
      if (item.exists()) {
        const who = getActor();
        await updateCohortItem(cohortId, row.id, {
          status: chosen.status, attemptCount: (item.data().attemptCount || 0) + 1, lastContactAt: timestamp, lastContactSummary: text.slice(0, 140),
          lastContactBy: who.name, lastContactByEmail: who.email,
          history: arrayUnion({ at: timestamp, by: who.name, byEmail: who.email, status: chosen.status, reason: null, note: text.slice(0, 280) }),
        });
      }
      if (chosen.key === "promise") await savePaymentPromise(row.id, promise.date, promise.amount, note.trim());
      onLogged && onLogged(row.id, new Date(timestamp));
      notify && notify({ type: "success", msg: `Saved: ${chosen.label} · ${row.name}` });
      setOutcome(null);
      setNote("");
      setPromise({ amount: "", date: "" });
    } catch (e) {
      setError(e.message || "Could not save.");
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
    <Card key={row.id} sx={{ overflow: "hidden", animation: "panelIn .25s ease-out", "@keyframes panelIn": { from: { opacity: 0, transform: "translateY(6px)" } } }}>
      {/* Header */}
      <Stack direction={{ xs: "column", xl: "row" }} spacing={2} sx={{ p: 2.5, pb: 2, borderBottom: 1, borderColor: "divider" }} alignItems={{ xl: "flex-start" }}>
        <Stack direction="row" spacing={2} sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ width: 52, height: 52, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 18, bgcolor: alpha(theme.palette.primary.main, 0.12), color: "primary.main" }}>{initials(row.name)}</Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" component={RouterLink} to={`/client/${row.id}`} sx={{ color: "text.primary", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>{row.name}</Typography>
            <Typography variant="body2" color="text.secondary" noWrap title={row.caseTitle}>{row.caseTitle || "—"}</Typography>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              {status}
              {row.caseType && row.caseType !== "—" && <Chip size="small" variant="outlined" label={row.caseType} />}
              {row.mycaseStage && <Chip size="small" variant="outlined" color="info" label={`MyCase: ${row.mycaseStage}`} />}
              {row.caseStatus && <Chip size="small" variant="outlined" label={`Case: ${row.caseStatus}`} />}
              {planCount > 1 && <Chip size="small" variant="outlined" label={`${planCount} plans`} />}
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
          <Button variant="outlined" component={RouterLink} to={`/client/${row.id}`}>Open profile</Button>
          {editor && <Tooltip title="Edit name and case"><IconButton onClick={() => onEdit(row.id)}><EditRounded fontSize="small" /></IconButton></Tooltip>}
          {admin && <Tooltip title="Delete client (admins)"><IconButton color="error" onClick={() => onDelete(row)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>}
        </Stack>
      </Stack>

      {/* Money */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, borderBottom: 1, borderColor: "divider", "& > div + div": { borderLeft: { md: 1 }, borderColor: { md: "divider" } } }}>
        <Stat label="Owed now" value={money(row.amountDue)} sub={row.amountDue > 0 ? `${row.missedMonths} installment${row.missedMonths === 1 ? "" : "s"}${row.planEnded ? " · plan ended" : ""}` : "up to date"} color={row.amountDue > 0 ? "secondary.main" : "success.main"} />
        <Stat label="Balance left" value={money(row.balance)} sub={planTotal > 0 ? `of ${money(planTotal)}` : "—"} />
        <Stat label="Monthly" value={twelve && twelve.monthly > 0 ? money(twelve.monthly) : "—"} sub="due the 15th" />
        <Stat label="Last payment" value={row.lastPayment ? money(row.lastPayment.amount) : "—"} sub={row.lastPayment?.date || "never"} />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.3fr 1fr" } }}>
        {/* Last 12 months */}
        <Box sx={{ p: 2.5 }}>
          <Typography variant="body2" fontWeight={800} color="text.secondary" sx={{ mb: 1.5 }}>Last 12 months</Typography>
          {!twelve ? (
            <Box sx={{ height: 140 }} />
          ) : (
            <Stack direction="row" spacing={0.75} alignItems="flex-end" sx={{ height: 140 }}>
              {twelve.months.map((m, i) => {
                const due = m.ym < nowYm || (m.ym === nowYm && pastThe15th);
                const short = m.amount - m.paid > 0.005;
                const h = m.amount > 0 ? Math.max(10, (m.amount / maxAmt) * 100) : 4;
                const label = new Date(`${m.ym}-15T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
                const tip = m.amount <= 0 ? `${label}: no installment` : short ? `${label}: paid ${money(m.paid)} of ${money(m.amount)}${due ? "" : " (not due yet)"}` : `${label}: paid ${money(m.amount)}`;
                return (
                  <Tooltip key={m.ym} title={tip}>
                    <Stack alignItems="center" justifyContent="flex-end" spacing={0.5} sx={{ flex: 1, height: "100%" }}>
                      <Box sx={{
                        width: "100%", height: `${h}%`, borderRadius: "6px 6px 3px 3px", position: "relative", overflow: "hidden",
                        transformOrigin: "bottom", animation: `${grow} .6s cubic-bezier(.2,.8,.2,1) both`, animationDelay: `${i * 30}ms`,
                        bgcolor: m.amount <= 0 ? alpha(theme.palette.text.primary, 0.08) : short && due ? alpha(theme.palette.secondary.main, 0.1) : short ? alpha(theme.palette.text.primary, 0.06) : "success.main",
                        border: m.amount > 0 && short ? `1.5px dashed ${due ? theme.palette.secondary.main : theme.palette.divider}` : "none",
                      }}>
                        {short && m.paid > 0 && <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${(m.paid / m.amount) * 100}%`, bgcolor: "success.main" }} />}
                      </Box>
                      <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ fontSize: 10.5 }}>{label[0]}</Typography>
                    </Stack>
                  </Tooltip>
                );
              })}
            </Stack>
          )}
          {twelve && twelve.lastDue && twelve.lastDue < nowYm && twelve.balance > 0 && (
            <Typography variant="caption" color="error.main" fontWeight={700} sx={{ display: "block", mt: 1 }}>
              The plan's last installment was {new Date(`${twelve.lastDue}-15T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}: everything left is owed now.
            </Typography>
          )}
          <Box sx={{ mt: 2.25 }}>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
              <Typography variant="body2" fontWeight={700}>Plan paid</Typography>
              <Typography variant="body2" fontWeight={700} color="text.secondary">{planTotal > 0 ? `${pct(paidShare)} · ${money(twelve.paidTotal)} of ${money(planTotal)}` : "No plan yet"}</Typography>
            </Stack>
            <Box sx={{ height: 9, borderRadius: 99, bgcolor: alpha(theme.palette.text.primary, 0.07), overflow: "hidden" }}>
              <Box sx={{ height: "100%", width: `${paidShare * 100}%`, borderRadius: 99, bgcolor: row.planEnded ? "error.main" : "primary.main", transformOrigin: "left", animation: `${growX} .8s cubic-bezier(.2,.8,.2,1) both` }} />
            </Box>
            {row.promise?.date && (
              <Chip size="small" color="warning" variant="outlined" icon={<EventRounded />} sx={{ mt: 1.5 }} label={`Promised ${money(row.promise.amount)} on ${String(row.promise.date).slice(0, 10)}`} />
            )}
          </Box>
        </Box>

        {/* Contact history */}
        <Box sx={{ p: 2.5, borderLeft: { md: 1 }, borderTop: { xs: 1, md: 0 }, borderColor: "divider" }}>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 1.5 }}>
            <Typography variant="body2" fontWeight={800} color="text.secondary">History</Typography>
            <Typography variant="caption" fontWeight={700} color="text.secondary">
              {row.lastContact ? `Last contact ${ago(row.lastContact.at instanceof Date ? row.lastContact.at : new Date(row.lastContact.at))}` : "Never contacted"}
            </Typography>
          </Stack>
          {history.length === 0 && <Typography variant="body2" color="text.secondary">{client ? "Nothing yet." : "Loading…"}</Typography>}
          {history.map((e, i) => {
            const [c, Icon] = evStyle[e.kind] || evStyle.note;
            return (
              <Box key={i} sx={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 1.25, pb: 1.5, position: "relative", "&::before": i < history.length - 1 ? { content: '""', position: "absolute", left: 12, top: 28, bottom: 0, width: 2, bgcolor: "divider" } : undefined }}>
                <Box sx={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: alpha(c, 0.14), color: c }}><Icon sx={{ fontSize: 14 }} /></Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={800} sx={{ textTransform: e.kind === "followup" ? "capitalize" : "none" }}>{e.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{[e.by, e.at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: e.at.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })].filter(Boolean).join(" · ")}</Typography>
                  {e.text && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.text}</Typography>}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Log the call */}
      {editor && (
        <Box sx={{ px: 2.5, py: 1.75, borderTop: 1, borderColor: "divider", bgcolor: alpha(theme.palette.primary.main, 0.025) }}>
          <Stack direction={{ xs: "column", xl: "row" }} spacing={1.25} alignItems={{ xl: "center" }}>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              {OUTCOMES.map((o) => (
                <Chip key={o.key} label={o.label} onClick={() => setOutcome(outcome === o.key ? null : o.key)} color={outcome === o.key ? "primary" : "default"} variant={outcome === o.key ? "filled" : "outlined"} sx={{ fontWeight: 800 }} />
              ))}
            </Stack>
            <TextField size="small" placeholder={chosen ? "Add a note about this call (optional)" : "Pick what happened, then add a note"} value={note} onChange={(e) => setNote(e.target.value)} sx={{ flex: 1, minWidth: 200 }}
              onKeyDown={(e) => { if (e.key === "Enter" && chosen && !saving) save(); }} />
            {chosen?.key === "promise" && (
              <Stack direction="row" spacing={1}>
                <TextField size="small" type="number" label="Amount" value={promise.amount} onChange={(e) => setPromise((p) => ({ ...p, amount: e.target.value }))} sx={{ width: 110 }} />
                <TextField size="small" type="date" label="Date" InputLabelProps={{ shrink: true }} value={promise.date} onChange={(e) => setPromise((p) => ({ ...p, date: e.target.value }))} sx={{ width: 160 }} />
              </Stack>
            )}
            <Button variant="contained" disabled={!chosen || saving} onClick={save} sx={{ alignSelf: { xs: "flex-end", xl: "auto" }, px: 3 }}>{saving ? "Saving…" : "Save"}</Button>
          </Stack>
          {error && <Alert severity="error" sx={{ mt: 1.25 }}>{error}</Alert>}
        </Box>
      )}
    </Card>
  );
}
