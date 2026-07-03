// src/Level10/Scorecard/ScorecardRow.jsx
import React from "react";
import { TableRow, TableCell, Chip } from "@mui/material";
import ManualCellEditor from "./ManualCellEditor";

/**
 * Props:
 * - row: { label, key, type: 'auto'|'manual', value, suffix, numeric }
 * - path: { monthKey, weekKey }
 * - locked: boolean
 * - onManualSaved(metricKey, newValue)
 */
export default function ScorecardRow({ row, path, locked, onManualSaved }) {
  const typeChip =
    row.type === "manual" ? (
      <Chip label="Manual" size="small" color="warning" variant="outlined" />
    ) : (
      <Chip label="Auto" size="small" color="success" variant="outlined" />
    );

  return (
    <TableRow hover>
      <TableCell sx={{ fontWeight: 600 }}>{row.label}</TableCell>
      <TableCell width={120}>{typeChip}</TableCell>
      <TableCell width={260}>
        {row.type === "manual" ? (
          <ManualCellEditor
            value={row.value}
            metricKey={row.key}
            path={path}
            locked={locked}
            numeric={row.numeric !== false}
            suffix={row.suffix}
            onSaved={(nv) => onManualSaved?.(row.key, nv)}
          />
        ) : (
          <span>
            {renderAuto(row.value, row.suffix)}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

function renderAuto(v, suffix) {
  if (v == null || v === "") return "—";
  if (typeof v === "number" && suffix === "%") return `${v}%`;
  if (typeof v === "number" && suffix === "$")
    return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return v;
}