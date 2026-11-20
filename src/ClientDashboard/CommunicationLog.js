// src/ClientDashboard/CommunicationLog.js
// Notes & promises: one box to write a note (and, if the client promised to pay, the
// date and amount), and the client's full history below, newest first, each entry
// labelled by where it came from. Call summaries from RingCentral will land here too.
import React, { useMemo, useState } from "react";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import {
  Box, Button, Card, Checkbox, Chip, Collapse, FormControlLabel, InputAdornment, Stack, TextField, Typography,
} from "@mui/material";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import db from "../firebase";
import { asDate } from "../utils/dates";
import { getActor } from "../auth/actor";
import { useAuth } from "../auth/useAuth";
import { savePaymentPromise } from "./PaymentPromise";
import { Section } from "../ui/kit";

const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

/** Where an entry came from, from how it was written. */
function sourceOf(log) {
  const msg = String(log.message || "");
  if (log.source === "ringcentral") return { label: "Call summary", color: "info" };
  if (msg.startsWith("Client promised to pay")) return { label: "Promise", color: "primary" };
  if (msg.startsWith("[Follow-Ups") || log.source === "follow-ups") return { label: "Follow-up call", color: "secondary" };
  if (log.user === "MyCase sync") return { label: "MyCase", color: "success" };
  return { label: "Note", color: "default" };
}

export default function CommunicationLog({ client, setClient }) {
  const { isEditorOrHigher } = useAuth();
  const [text, setText] = useState("");
  const [isPromise, setIsPromise] = useState(false);
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { groups, order } = useMemo(() => {
    const logs = [...(client.communicationLogs || []), ...(client.communicationLog || [])]
      .filter((l) => l && l.timestamp)
      .sort((a, b) => asDate(b.timestamp) - asDate(a.timestamp));
    const g = {};
    for (const log of logs) {
      const d = asDate(log.timestamp);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      (g[key] = g[key] || []).push(log);
    }
    return { groups: g, order: Object.keys(g).sort().reverse() };
  }, [client.communicationLogs, client.communicationLog]);

  const [open, setOpen] = useState(() => (order[0] ? { [order[0]]: true } : {}));
  const total = order.reduce((n, k) => n + groups[k].length, 0);

  const canSave = text.trim() && (!isPromise || (promiseDate && Number(promiseAmount) > 0));

  const save = async () => {
    if (!canSave || !client?.id) return;
    setSaving(true);
    setError("");
    try {
      if (isPromise) {
        // Records the promise (with who and when) and adds it to the history.
        const { updatedPromise, newLog } = await savePaymentPromise(client.id, promiseDate, promiseAmount, text.trim());
        setClient((p) => ({ ...p, paymentPromise: updatedPromise, communicationLogs: [...(p.communicationLogs || []), newLog] }));
      } else {
        const who = getActor();
        const newLog = { message: text.trim(), timestamp: new Date().toISOString(), user: who.name, userEmail: who.email, source: "manual" };
        await updateDoc(doc(db, "clients", client.id), { communicationLogs: arrayUnion(newLog) });
        setClient((p) => ({ ...p, communicationLogs: [...(p.communicationLogs || []), newLog] }));
      }
      setText("");
      setIsPromise(false);
      setPromiseDate("");
      setPromiseAmount("");
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ mb: 3 }}>
      {isEditorOrHigher() && (
        <Section title="Add a note" subtitle="Calls, messages, anything worth remembering. Tick the box if the client promised to pay." sx={{ mb: 2 }}>
          <Stack spacing={1.5}>
            <TextField
              value={text}
              onChange={(e) => setText(e.target.value)}
              multiline
              minRows={3}
              fullWidth
              placeholder="Spoke with the client about the missed payment…"
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
              <FormControlLabel control={<Checkbox checked={isPromise} onChange={(e) => setIsPromise(e.target.checked)} />} label="The client promised to pay" />
              {isPromise && (
                <>
                  <TextField type="date" label="On" InputLabelProps={{ shrink: true }} value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} sx={{ width: 180 }} />
                  <TextField
                    type="number"
                    label="Amount"
                    value={promiseAmount}
                    onChange={(e) => setPromiseAmount(e.target.value)}
                    sx={{ width: 160 }}
                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                  />
                </>
              )}
              <Box sx={{ flex: 1 }} />
              <Button variant="contained" onClick={save} disabled={!canSave || saving}>
                {saving ? "Saving…" : isPromise ? "Save note & promise" : "Save note"}
              </Button>
            </Stack>
            {error && <Typography color="error" variant="body2">{error}</Typography>}
          </Stack>
        </Section>
      )}

      <Section title="History" subtitle={`${total} entr${total === 1 ? "y" : "ies"}: notes, follow-up calls, promises and MyCase updates`} pad={false}>
        {order.length === 0 && (
          <Typography color="text.secondary" sx={{ px: 2.25, pb: 2 }}>
            Nothing recorded yet.
          </Typography>
        )}
        {order.map((key) => (
          <Box key={key} sx={{ borderTop: 1, borderColor: "divider" }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.25, py: 1, cursor: "pointer" }} onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}>
              <Typography fontWeight={800} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                {open[key] ? <ExpandLessRounded fontSize="small" /> : <ExpandMoreRounded fontSize="small" />}
                {monthLabel(key)}
              </Typography>
              <Typography variant="caption" color="text.secondary">{groups[key].length}</Typography>
            </Stack>
            <Collapse in={!!open[key]} unmountOnExit>
              <Stack spacing={1} sx={{ px: 2.25, pb: 2 }}>
                {groups[key].map((log, i) => {
                  const src = sourceOf(log);
                  return (
                    <Card key={`${log.timestamp}-${i}`} variant="outlined" sx={{ px: 1.75, py: 1.25 }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                        <Chip size="small" label={src.label} color={src.color} variant={src.color === "default" ? "outlined" : "filled"} />
                        <Typography variant="caption" color="text.secondary">
                          {asDate(log.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </Typography>
                        <Box sx={{ flex: 1 }} />
                        <Typography variant="caption" fontWeight={700} color="text.secondary">{log.user}</Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{log.message}</Typography>
                    </Card>
                  );
                })}
              </Stack>
            </Collapse>
          </Box>
        ))}
      </Section>
    </Box>
  );
}
