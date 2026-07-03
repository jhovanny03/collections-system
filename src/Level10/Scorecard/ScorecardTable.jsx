// src/Level10/Scorecard/ScorecardTable.jsx
import React, { useState } from "react";
import {
  Table, TableHead, TableBody, TableRow, TableCell,
  TextField, Typography, Box
} from "@mui/material";
import { updateManualCell } from "../services/level10.api";
import { format } from "date-fns";

/**
 * Props:
 * - metricsDef: [{ id, label, type, unit? }]  // unit: "$" | "%" | "#" OR "currency" | "percent" | "count"
 * - ownerByMetric: { [metricId]: string }
 * - setOwnerByMetric: fn (updates owner mapping in parent)
 * - ownersEditMode: bool (when true, Owner cells become editable)
 * - columns: ['YYYY-MM-DD', ...]
 * - weeksMap: { [date]: { metrics, manual } }
 * - month: 'YYYY-MM'
 */
export default function ScorecardTable({
  metricsDef,
  ownerByMetric,
  setOwnerByMetric,
  ownersEditMode,
  columns,
  weeksMap,
  month,
}) {
  // --- local state for manual metric inline editing ---
  const [editingKey, setEditingKey] = useState(null); // format: `${date}|${metricId}`
  const [draftValue, setDraftValue] = useState("");   // current text input
  const [manualLocal, setManualLocal] = useState({}); // { "YYYY-MM-DD|metricId": number|null }

  const onStartEdit = (dateYmd, metricId, initial) => {
    const key = `${dateYmd}|${metricId}`;
    setEditingKey(key);
    setDraftValue(initial ?? "");
  };

  const onCancelEdit = () => {
    setEditingKey(null);
    setDraftValue("");
  };

  const commitManual = async ({ dateYmd, metricId, value }) => {
    const cleaned = value === "" ? null : Number(value);
    if (value !== "" && Number.isNaN(cleaned)) return;
    await updateManualCell({ month, dateYmd, metricId, value: cleaned });
    const key = `${dateYmd}|${metricId}`;
    setManualLocal((prev) => ({ ...prev, [key]: cleaned }));
    onCancelEdit();
  };

  const onOwnerChange = (metricId, val) => {
    setOwnerByMetric((prev) => ({ ...prev, [metricId]: val }));
  };

  const nice = (d) => {
    try {
      const [y, m, dd] = d.split("-").map(Number);
      const dt = new Date(y, m - 1, dd);
      return format(dt, "MMM dd");
    } catch {
      return d;
    }
  };

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700, minWidth: 260 }}>Metric</TableCell>
            <TableCell sx={{ fontWeight: 700, minWidth: 180 }}>Owner</TableCell>
            {columns.map((date) => (
              <TableCell key={date} align="right" sx={{ fontWeight: 700, minWidth: 120 }}>
                {nice(date)}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>

        <TableBody>
          {metricsDef.map((m) => (
            <TableRow key={m.id} hover>
              {/* Metric */}
              <TableCell sx={{ fontWeight: 600 }}>
                {m.label}
              </TableCell>

              {/* Owner (editable only when ownersEditMode is true) */}
              <TableCell sx={{ width: 220 }}>
                {ownersEditMode ? (
                  <TextField
                    size="small"
                    placeholder="Owner"
                    value={ownerByMetric?.[m.id] || ""}
                    onChange={(e) => onOwnerChange(m.id, e.target.value)}
                    fullWidth
                  />
                ) : (
                  <Typography variant="body2">
                    {ownerByMetric?.[m.id] || "—"}
                  </Typography>
                )}
              </TableCell>

              {/* Columns per meeting date */}
              {columns.map((date) => {
                const wk = weeksMap[date] || {};
                const autoVal = wk.metrics?.[m.id];
                const manualVal = wk.manual?.[m.id];

                const key = `${date}|${m.id}`;
                const localManual = manualLocal[key];
                const effectiveManual =
                  localManual !== undefined ? localManual : manualVal;

                const isManual = m.type === "M";
                const isEditing = editingKey === key;

                if (isManual) {
                  if (isEditing) {
                    return (
                      <TableCell key={date} align="right">
                        <TextField
                          size="small"
                          type="number"
                          autoFocus
                          value={draftValue}
                          onChange={(e) => setDraftValue(e.target.value)}
                          onBlur={() =>
                            commitManual({
                              dateYmd: date,
                              metricId: m.id,
                              value: draftValue,
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitManual({
                                dateYmd: date,
                                metricId: m.id,
                                value: draftValue,
                              });
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              onCancelEdit();
                            }
                          }}
                          placeholder="—"
                          inputProps={{ style: { textAlign: "right" }, step: "0.01" }}
                        />
                      </TableCell>
                    );
                  }

                  return (
                    <TableCell
                      key={date}
                      align="right"
                      sx={{
                        cursor: "pointer",
                        "&:hover": { bgcolor: "action.hover" },
                        whiteSpace: "nowrap",
                      }}
                      onClick={() =>
                        onStartEdit(date, m.id, effectiveManual ?? "")
                      }
                    >
                      <CellValue unit={m.unit} value={effectiveManual} placeholder="—" />
                    </TableCell>
                  );
                }

                // Auto metric (read-only)
                return (
                  <TableCell key={date} align="right">
                    <CellValue unit={m.unit} value={autoVal} placeholder="—" />
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

/** Renders a value with unit-aware formatting. Supports "$" | "%" | "#" and "currency" | "percent" | "count". */
function CellValue({ value, unit, placeholder = "—" }) {
  if (value == null || value === "") return <SpanMuted>{placeholder}</SpanMuted>;
  return <>{formatWithUnit(unit, value)}</>;
}

function SpanMuted({ children }) {
  return (
    <span style={{ color: "var(--mui-palette-text-secondary)" }}>{children}</span>
  );
}

/** Generic number formatting with unit handling (symbols or keywords). */
function formatWithUnit(unit, raw) {
  const v = Number(raw);
  if (Number.isNaN(v)) return String(raw);

  const u = (unit || "").toString().toLowerCase();

  // Treat "$" and "currency" the same
  if (u === "currency" || unit === "$") {
    // Show $ and thousand separators; 0 decimals for large numbers, 2 for small
    const opts =
      Math.abs(v) < 1000
        ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        : { maximumFractionDigits: 0 };
    return `$${v.toLocaleString(undefined, opts)}`;
  }

  // Treat "%" and "percent" the same
  if (u === "percent" || unit === "%") {
    // Accept 0–1 or 0–100; show with % sign
    const pct = Math.abs(v) <= 1 ? v * 100 : v;
    const opts = { maximumFractionDigits: pct < 100 ? 2 : 0 };
    return `${pct.toLocaleString(undefined, opts)}%`;
  }

  // Treat "#" and "count" the same
  if (u === "count" || unit === "#") {
    return v.toLocaleString();
  }

  // Fallback: smart digits
  return v.toLocaleString(undefined, {
    maximumFractionDigits: Math.abs(v) < 1000 ? 2 : 0,
  });
}