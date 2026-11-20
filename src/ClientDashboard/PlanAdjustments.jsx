// src/ClientDashboard/PlanAdjustments.jsx
// Billing's adjustments to a MyCase installment plan, from the client page: "$350 this
// month", "$1,000 for 6 months", "$450 from March on". The plan's normal amount and start
// come from Case Setup; adjustments are layered on top and the schedule every report reads
// is rebuilt from them (src/billing/plans.js scheduleForPlan).
//
// Shown for every plan of a client created from MyCase, and for the extra plans of older
// clients (whose main plan is still edited in Installment Settings).
import React, { useMemo, useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, CardHeader, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, InputAdornment, Stack, TextField, Typography,
} from "@mui/material";
import TuneIcon from "@mui/icons-material/Tune";
import { doc, updateDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import db from "../firebase";
import {
  sortedPlans, managedPlanIds, planSchedule, describeSchedule, withAdjustment, withoutAdjustment, planUpdates,
} from "../billing/plans";
import { getActor } from "../auth/actor";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const monthLabel = (ym) => (ym ? new Date(`${ym}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "");
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

function adjustmentText(a) {
  const span = a.months ? `for ${a.months} month${a.months === 1 ? "" : "s"} from ${monthLabel(a.start)}` : `from ${monthLabel(a.start)} on`;
  return `${money(a.amount)} ${span}`;
}

function AddAdjustmentDialog({ plan, onClose, onSave }) {
  const [form, setForm] = useState({ amount: "", start: thisMonth(), months: "", note: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setError("");
    try {
      const user = getAuth().currentUser;
      const updated = withAdjustment(plan, { ...form, months: form.months === "" ? null : form.months, by: getActor().name });
      setSaving(true);
      await onSave(updated);
    } catch (e) {
      console.error(e);
      setError(e.message || "Could not save.");
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        Add adjustment
        <Typography variant="body2" color="text.secondary">
          Plan for MyCase invoice {plan.invoiceNumber || plan.invoiceId} · normally {money(plan.monthlyAmount)} a month
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2 }}>
          The adjusted amount is due for the months you choose; every other month stays at the
          normal amount. Leave "For how many months" blank to change it from that month on.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2}>
          <TextField size="small" label="Adjusted monthly amount" type="number" autoFocus value={form.amount} onChange={set("amount")}
            InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
          <TextField size="small" label="Starting" type="month" value={form.start} onChange={set("start")} InputLabelProps={{ shrink: true }} />
          <TextField size="small" label="For how many months" type="number" value={form.months} onChange={set("months")}
            placeholder="blank = from then on" InputLabelProps={{ shrink: true }} />
          <TextField size="small" label="Reason (optional)" value={form.note} onChange={set("note")} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function PlanAdjustments({ client, setClient }) {
  const [adding, setAdding] = useState(null); // plan
  const [error, setError] = useState("");
  const plans = useMemo(() => {
    const ids = new Set(managedPlanIds(client));
    return sortedPlans(client).filter((p) => ids.has(String(p.invoiceId)));
  }, [client]);
  if (!plans.length) return null;

  const saveFor = async (updatedPlan) => {
    const all = (client.plans || []).map((p) => (String(p.invoiceId) === String(updatedPlan.invoiceId) ? updatedPlan : p));
    const now = new Date().toISOString();
    const updates = { ...planUpdates(client, all), updatedAt: now, lastChangeAt: now, lastActivity: "edited" };
    await updateDoc(doc(db, "clients", client.id), updates);
    setClient((c) => ({ ...c, ...updates }));
  };

  const remove = async (plan, index) => {
    if (!window.confirm(`Remove this adjustment (${adjustmentText(plan.adjustments[index])})?`)) return;
    setError("");
    try {
      await saveFor(withoutAdjustment(plan, index));
    } catch (e) {
      console.error(e);
      setError("Could not remove the adjustment.");
    }
  };

  return (
    <Card sx={{ borderRadius: 3, mb: 3 }}>
      <CardHeader
        avatar={<TuneIcon color="primary" />}
        title="Payment plan & adjustments"
        subheader="The normal monthly amount was set on Case Setup. Adjust single months or a stretch of months here."
        sx={{ "& .MuiCardHeader-title": { fontWeight: 700 } }}
      />
      <CardContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2} divider={<Divider flexItem />}>
          {plans.map((plan) => (
            <Box key={plan.invoiceId}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                <Typography variant="subtitle2">MyCase invoice {plan.invoiceNumber || plan.invoiceId}</Typography>
                <Chip size="small" label={`${money(plan.monthlyAmount)} a month from ${monthLabel(String(plan.startDate).slice(0, 7))}`} />
                {Number(plan.total) > 0 && <Chip size="small" variant="outlined" label={`Plan total ${money(plan.total)}`} />}
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Schedule: {describeSchedule(planSchedule(plan))}
              </Typography>
              {(plan.adjustments || []).map((a, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="body2">
                    {adjustmentText(a)}
                    {a.note ? ` · ${a.note}` : ""}
                    <Typography component="span" variant="caption" color="text.secondary">
                      {a.by ? ` · ${a.by}` : ""}{a.at ? `, ${String(a.at).slice(0, 10)}` : ""}
                    </Typography>
                  </Typography>
                  <Button size="small" color="inherit" onClick={() => remove(plan, i)}>Remove</Button>
                </Stack>
              ))}
              <Button size="small" variant="outlined" sx={{ mt: 0.5 }} onClick={() => setAdding(plan)}>Add adjustment</Button>
            </Box>
          ))}
        </Stack>
      </CardContent>
      {adding && (
        <AddAdjustmentDialog plan={adding} onClose={() => setAdding(null)}
          onSave={async (updated) => { await saveFor(updated); setAdding(null); }} />
      )}
    </Card>
  );
}
