// src/Level10/Scorecard/ManualCellEditor.jsx
import React, { useEffect, useRef, useState } from "react";
import { TextField, InputAdornment, CircularProgress, Box } from "@mui/material";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import db from "../../firebase";

/**
 * Props:
 * - value: current string/number to display
 * - metricKey: e.g. "numInAutopay"
 * - path: { monthKey, weekKey }  // e.g. { monthKey: '2025-11', weekKey: '2025-11-03' }
 * - locked: boolean (if week locked, disable)
 * - numeric: boolean (default true)
 * - suffix: string (optional, e.g. '%', '$')
 * - onSaved(newValue)
 */
export default function ManualCellEditor({
  value,
  metricKey,
  path,
  locked,
  numeric = true,
  suffix,
  onSaved,
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  useEffect(() => {
    setLocal(value ?? "");
  }, [value]);

  const commit = async () => {
    if (locked) return;
    const cleaned =
      numeric
        ? (local === "" ? null : Number(local))
        : (local ?? "");

    if (numeric && cleaned !== null && !Number.isFinite(cleaned)) return;

    setSaving(true);
    try {
      const ref = doc(db, "level10", path.monthKey, "weeks", path.weekKey);
      // ensure container exists and then update just manualMetrics.metricKey
      await setDoc(ref, { monthKey: path.monthKey, weekKey: path.weekKey }, { merge: true });
      await updateDoc(ref, { [`manualMetrics.${metricKey}`]: cleaned });
      setEditing(false);
      onSaved?.(cleaned);
    } finally {
      setSaving(false);
    }
  };

  if (locked) {
    return <Box sx={{ opacity: 0.6 }}>{renderValue(local, suffix)}</Box>;
  }

  return editing ? (
    <TextField
      size="small"
      inputRef={inputRef}
      type={numeric ? "number" : "text"}
      value={local ?? ""}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { setLocal(value ?? ""); setEditing(false); }
      }}
      InputProps={{
        endAdornment: saving ? (
          <InputAdornment position="end">
            <CircularProgress size={16} />
          </InputAdornment>
        ) : suffix ? (
          <InputAdornment position="end">{suffix}</InputAdornment>
        ) : null,
        inputProps: numeric ? { step: "0.01" } : {},
      }}
      sx={{ minWidth: 110 }}
    />
  ) : (
    <Box
      onClick={() => setEditing(true)}
      sx={{
        cursor: "text",
        px: 1,
        py: 0.5,
        borderRadius: 1,
        "&:hover": { bgcolor: "action.hover" },
      }}
      title="Click to edit"
    >
      {renderValue(local, suffix)}
    </Box>
  );
}

function renderValue(v, suffix) {
  if (v == null || v === "") return "—";
  if (typeof v === "number" && suffix === "%") return `${v}%`;
  if (typeof v === "number" && suffix === "$")
    return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return v;
}