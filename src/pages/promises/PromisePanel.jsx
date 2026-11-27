// src/pages/promises/PromisePanel.jsx
// The selected promise: amount and date with a countdown, what was paid since it was made,
// the client's track record on earlier promises, and what to do after the call.
import React, { useEffect, useState } from "react";
import { Alert, Box, Button, Card, Chip, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { Link as RouterLink } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import PhoneRounded from "@mui/icons-material/PhoneRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import TaskAltRounded from "@mui/icons-material/TaskAltRounded";
import EventRepeatRounded from "@mui/icons-material/EventRepeatRounded";
import PhoneMissedRounded from "@mui/icons-material/PhoneMissedRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import CheckRounded from "@mui/icons-material/CheckRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import db from "../../firebase";
import { money } from "../../billing/portfolio";
import { callLink, displayPhone } from "../../billing/contact";
import { FONT_HEADING } from "../../theme/brand";
import { growX } from "../../Dashboard/homeCharts";
import { initials } from "../../Clients/ClientPanel";
import { savePaymentPromise } from "../../ClientDashboard/PaymentPromise";
import { updateClientCommunication } from "../../ClientFollowUps/followUps.service";
import { ymd } from "./PromiseCalendar";

export const GRACE_DAYS = 3;
const DAY = 864e5;
const STATUS = {
  today: { label: "Due today", color: "warning" },
  grace: { label: "Due, waiting", color: "warning" },
  upcoming: { label: "Upcoming", color: "info" },
  missed: { label: "Missed", color: "error" },
  kept: { label: "Kept", color: "success" },
};
export { STATUS };

const longDate = (d) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const shortDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

function countdown(p, today) {
  const days = Math.round((p.date - today) / DAY);
  if (p.status === "kept") return { text: "Kept", color: "success" };
  if (p.status === "today") return { text: "Due today", color: "warning" };
  if (p.status === "grace") {
    const left = GRACE_DAYS + days; // days < 0
    return { text: left > 0 ? `${left} day${left === 1 ? "" : "s"} of grace left` : "Last day of grace", color: "warning" };
  }
  if (p.status === "upcoming") return { text: days === 1 ? "Due tomorrow" : `Due in ${days} days`, color: "info" };
  return { text: `Missed ${-days} day${days === -1 ? "" : "s"} ago`, color: "error" };
}

function Box2({ children, sx }) {
  return <Box sx={{ p: 2.5, minWidth: 0, ...sx }}>{children}</Box>;
}

/**
 * p: { id, name, caseType, date, amount, notes, by, made, status, paid, owed, myCaseLink, phone, current }
 * record: earlier promises of this client [{ date, amount, status: kept|broken|open, paidAmount }]
 */
export default function PromisePanel({ p, record, today, editor, onSaved, notify }) {
  const theme = useTheme();
  const [mode, setMode] = useState(null); // null | "newdate"
  const [nd, setNd] = useState({ date: "", amount: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const key = p ? `${p.id}|${p.date ? ymd(p.date) : ""}` : "";
  useEffect(() => {
    setMode(null);
    setError("");
  }, [key]);

  if (!p) {
    return (
      <Card sx={{ p: 6, textAlign: "center" }}>
        <Typography color="text.secondary">Pick a promise on the left, or a day on the calendar.</Typography>
      </Card>
    );
  }

  const st = STATUS[p.status];
  const cd = countdown(p, today);
  const share = p.amount > 0 ? Math.min(1, (p.paid || 0) / p.amount) : 0;
  const countsUntil = new Date(p.date.getTime() + GRACE_DAYS * DAY);
  const earlier = (record || []).filter((h) => !(h.date && p.date && ymd(h.date) === ymd(p.date))).slice(0, 8);
  const keptN = earlier.filter((h) => h.status === "kept").length;
  const decided = earlier.filter((h) => h.status === "kept" || h.status === "broken");

  const run = async (fn, msg) => {
    setSaving(true);
    setError("");
    try {
      await fn();
      notify({ type: "success", msg });
      setMode(null);
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };
  const promiseWords = `the ${money(p.amount)} promised for ${shortDate(p.date)}`;
  const saysPaid = () => run(() => updateClientCommunication(p.id, { message: `[Follow-Ups • Reached Working] Client says they paid ${promiseWords}. Check MyCase.`, source: "promises" }), `Logged: ${p.name} says they paid`);
  const noAnswer = () => run(() => updateClientCommunication(p.id, { message: `[Follow-Ups • Attempted No Contact] Called about ${promiseWords}, no answer.`, source: "promises" }), `Logged: no answer · ${p.name}`);
  const remove = () => {
    if (!window.confirm(`Remove ${p.name}'s promise of ${money(p.amount)} for ${shortDate(p.date)}? It stays in the promise history.`)) return;
    run(async () => {
      await updateDoc(doc(db, "clients", p.id), { paymentPromise: null });
      await updateClientCommunication(p.id, { message: `Promise removed: ${promiseWords}.`, source: "promises" });
      onSaved(p.id, null);
    }, `Promise removed · ${p.name}`);
  };
  const saveNewDate = () => {
    if (!nd.date || !nd.amount) {
      setError("Enter the new date and amount.");
      return;
    }
    run(async () => {
      await savePaymentPromise(p.id, nd.date, nd.amount, nd.notes);
      onSaved(p.id, { date: nd.date, amount: Number(nd.amount), notes: nd.notes, createdAt: new Date().toISOString() });
    }, `New promise saved · ${p.name}`);
  };
  const openNewDate = () => {
    const t = new Date(today.getTime() + 7 * DAY);
    setNd({ date: ymd(t), amount: String(Math.max(0, p.amount - (p.paid || 0)) || p.amount), notes: "" });
    setMode("newdate");
  };

  return (
    <Card key={key} sx={{ overflow: "hidden", animation: "prIn .25s ease-out", "@keyframes prIn": { from: { opacity: 0, transform: "translateY(6px)" } } }}>
      {/* Header */}
      <Stack direction={{ xs: "column", xl: "row" }} spacing={2} sx={{ p: 2.5, pb: 2, borderBottom: 1, borderColor: "divider" }} alignItems={{ xl: "flex-start" }}>
        <Stack direction="row" spacing={2} sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ width: 52, height: 52, flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 18, bgcolor: alpha(theme.palette.primary.main, 0.12), color: "primary.main" }}>{initials(p.name)}</Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" component={RouterLink} to={`/client/${p.id}`} sx={{ color: "text.primary", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>{p.name}</Typography>
            <Typography variant="body2" color="text.secondary">{[p.caseType, p.owed > 0 ? `owes ${money(p.owed)} now` : "owes nothing now"].filter(Boolean).join(" · ")}</Typography>
            <Stack direction="row" spacing={0.75} sx={{ mt: 1 }}>
              <Chip size="small" label={st.label} color={st.color} variant={p.status === "upcoming" ? "outlined" : "filled"} />
              {!p.current && <Chip size="small" variant="outlined" label="Earlier promise" />}
            </Stack>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ flex: "none" }}>
          {p.phone ? (
            <Button variant="contained" color="success" startIcon={<PhoneRounded />} href={callLink(p.phone)}>{displayPhone(p.phone)}</Button>
          ) : (
            <Chip label="No phone in MyCase" variant="outlined" />
          )}
          {p.myCaseLink && <Button variant="outlined" endIcon={<OpenInNewRounded />} href={p.myCaseLink} target="_blank" rel="noopener noreferrer">MyCase</Button>}
          <Button variant="outlined" component={RouterLink} to={`/client/${p.id}?tab=notes`}>Profile</Button>
        </Stack>
      </Stack>

      {/* The promise, and what was paid */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.15fr 1fr" }, borderBottom: 1, borderColor: "divider" }}>
        <Box2>
          <Typography variant="caption" fontWeight={800} color="text.secondary">Promised</Typography>
          <Typography sx={{ font: `700 34px ${FONT_HEADING}`, lineHeight: 1.15 }}>{money(p.amount)}</Typography>
          <Typography fontWeight={800}>{longDate(p.date)}</Typography>
          <Chip size="small" color={cd.color} label={cd.text} sx={{ mt: 1, fontWeight: 800 }} />
          <Box sx={{ mt: 1.5, p: 1.25, pl: 1.5, borderLeft: 3, borderColor: "divider", bgcolor: alpha(theme.palette.primary.main, 0.03), borderRadius: "0 10px 10px 0" }}>
            <Typography variant="body2" color="text.secondary">{p.notes ? `“${p.notes}”` : "No notes."}</Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>{[p.by, p.made ? `made ${shortDate(p.made)}` : null].filter(Boolean).join(" · ")}</Typography>
          </Box>
        </Box2>
        <Box2 sx={{ borderLeft: { md: 1 }, borderTop: { xs: 1, md: 0 }, borderColor: "divider" }}>
          <Typography variant="caption" fontWeight={800} color="text.secondary">Paid since the promise</Typography>
          <Typography sx={{ font: `700 34px ${FONT_HEADING}`, lineHeight: 1.15, color: p.paid ? "success.main" : "text.disabled" }}>{money(p.paid || 0)}</Typography>
          <Box sx={{ height: 12, borderRadius: 99, bgcolor: alpha(theme.palette.text.primary, 0.07), overflow: "hidden", my: 1 }}>
            <Box sx={{ height: "100%", width: `${share * 100}%`, borderRadius: 99, bgcolor: "success.main", transformOrigin: "left", animation: `${growX} .8s cubic-bezier(.2,.8,.2,1) both` }} />
          </Box>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>{Math.round(share * 100)}% of the promise · counts until {shortDate(countsUntil)}</Typography>
          <Typography variant="caption" fontWeight={800} color="text.secondary" component="div" sx={{ mt: 2 }}>Track record</Typography>
          {decided.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No earlier promises on record.</Typography>
          ) : (
            <>
              <Stack direction="row" spacing={0.5} sx={{ my: 0.75 }}>
                {decided.map((h, i) => (
                  <Tooltip key={i} title={`${shortDate(h.date)} · ${money(h.amount)} · ${h.status === "kept" ? "kept" : "broken"}`}>
                    <Box sx={{ width: 22, height: 22, borderRadius: 1.75, display: "grid", placeItems: "center", color: "#fff", bgcolor: h.status === "kept" ? "success.main" : "error.main" }}>
                      {h.status === "kept" ? <CheckRounded sx={{ fontSize: 15 }} /> : <CloseRounded sx={{ fontSize: 15 }} />}
                    </Box>
                  </Tooltip>
                ))}
              </Stack>
              <Typography variant="caption" color="text.secondary" fontWeight={700}>Kept {keptN} of {decided.length} earlier promise{decided.length === 1 ? "" : "s"}</Typography>
            </>
          )}
        </Box2>
      </Box>

      {/* After the call */}
      {editor && p.current && p.status !== "kept" && (
        <Box sx={{ px: 2.5, py: 1.75, borderBottom: 1, borderColor: "divider", bgcolor: alpha(theme.palette.primary.main, 0.025) }}>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
            <Typography variant="body2" fontWeight={800} color="text.secondary" sx={{ mr: 0.5 }}>{p.status === "missed" ? "They missed it:" : "After the call:"}</Typography>
            <Button size="small" variant="outlined" startIcon={<TaskAltRounded />} disabled={saving} onClick={saysPaid}>Says they paid</Button>
            <Button size="small" variant={mode === "newdate" ? "contained" : "outlined"} startIcon={<EventRepeatRounded />} disabled={saving} onClick={() => (mode === "newdate" ? setMode(null) : openNewDate())}>New date / amount</Button>
            <Button size="small" variant="outlined" startIcon={<PhoneMissedRounded />} disabled={saving} onClick={noAnswer}>No answer</Button>
            <Button size="small" color="error" startIcon={<DeleteOutlineRounded />} disabled={saving} onClick={remove}>Remove promise</Button>
          </Stack>
          {mode === "newdate" && (
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ mt: 1.5 }}>
              <TextField size="small" type="date" label="They will pay on" InputLabelProps={{ shrink: true }} value={nd.date} onChange={(e) => setNd((x) => ({ ...x, date: e.target.value }))} />
              <TextField size="small" type="number" label="Amount" value={nd.amount} onChange={(e) => setNd((x) => ({ ...x, amount: e.target.value }))} sx={{ width: { md: 130 } }} />
              <TextField size="small" label="Notes" value={nd.notes} onChange={(e) => setNd((x) => ({ ...x, notes: e.target.value }))} sx={{ flex: 1 }} />
              <Button variant="contained" disabled={saving} onClick={saveNewDate}>{saving ? "Saving…" : "Save promise"}</Button>
            </Stack>
          )}
          {error && <Alert severity="error" sx={{ mt: 1.25 }}>{error}</Alert>}
        </Box>
      )}

      {/* Earlier promises */}
      <Box2>
        <Typography variant="body2" fontWeight={800} color="text.secondary" sx={{ mb: 1 }}>Earlier promises</Typography>
        {earlier.length === 0 ? (
          <Typography variant="body2" color="text.secondary">None on record (kept from Nov 19, 2026).</Typography>
        ) : (
          earlier.map((h, i) => (
            <Stack key={i} direction="row" alignItems="center" spacing={1.5} sx={{ py: 1, borderTop: i ? 1 : 0, borderColor: "divider" }}>
              <Typography variant="body2" color="text.secondary" sx={{ width: 90, flex: "none" }}>{shortDate(h.date)}</Typography>
              <Typography variant="body2" sx={{ flex: 1 }}><b>{money(h.amount)}</b>{h.paidAmount != null ? ` · paid ${money(h.paidAmount)}` : ""}</Typography>
              <Chip size="small" label={h.status === "kept" ? "Kept" : h.status === "broken" ? "Broken" : "Open"} color={h.status === "kept" ? "success" : h.status === "broken" ? "error" : "default"} variant={h.status === "open" ? "outlined" : "filled"} />
            </Stack>
          ))
        )}
      </Box2>
    </Card>
  );
}
