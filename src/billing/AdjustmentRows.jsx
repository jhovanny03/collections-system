// src/billing/AdjustmentRows.jsx
// Editable list of plan adjustments ("$350 the first month", "$1,000 for 6 months") with a
// plain-English preview of the resulting schedule. Used on Case Setup's Add plan form.
import React from "react";
import { Box, Button, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import { scheduleForPlan, describeSchedule } from "./plans";

export const emptyAdjustment = (startDate) => ({ amount: "", start: String(startDate || "").slice(0, 7), months: "", note: "" });

/** rows: [{ amount, start: "YYYY-MM", months, note }]; plan: { monthlyAmount, startDate, ... } for the preview. */
export default function AdjustmentRows({ rows = [], onChange, plan }) {
  const set = (i, field, value) => onChange(rows.map((r, k) => (k === i ? { ...r, [field]: value } : r)));
  const preview = Number(plan?.monthlyAmount) > 0 && plan?.startDate
    ? describeSchedule(scheduleForPlan({
      ...plan,
      adjustments: rows.filter((r) => Number(r.amount) > 0 && /^\d{4}-\d{2}$/.test(r.start))
        .map((r) => ({ ...r, amount: Number(r.amount), months: r.months === "" ? null : Number(r.months) })),
    }))
    : "";

  return (
    <Box sx={{ mt: 1.5 }}>
      {rows.map((r, i) => (
        <Stack key={i} direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }} sx={{ mb: 1 }}>
          <TextField size="small" label="Adjusted amount" type="number" value={r.amount} sx={{ maxWidth: { md: 150 } }}
            onChange={(e) => set(i, "amount", e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
          <TextField size="small" label="Starting" type="month" value={r.start} sx={{ maxWidth: { md: 170 } }}
            onChange={(e) => set(i, "start", e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" label="For how many months" type="number" value={r.months} sx={{ maxWidth: { md: 170 } }}
            placeholder="blank = from then on" InputLabelProps={{ shrink: true }}
            onChange={(e) => set(i, "months", e.target.value)} />
          <TextField size="small" label="Reason (optional)" value={r.note} sx={{ flex: 1 }}
            onChange={(e) => set(i, "note", e.target.value)} />
          <Button size="small" color="inherit" onClick={() => onChange(rows.filter((_, k) => k !== i))}>Remove</Button>
        </Stack>
      ))}
      <Button size="small" onClick={() => onChange([...rows, emptyAdjustment(plan?.startDate)])}>
        + Add adjustment
      </Button>
      {preview && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
          Schedule: {preview}
        </Typography>
      )}
    </Box>
  );
}
