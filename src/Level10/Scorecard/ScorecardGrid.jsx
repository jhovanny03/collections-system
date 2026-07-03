import React from "react";
import {
  Paper, Table, TableHead, TableBody, TableRow, TableCell,
  TextField, Tooltip, Chip
} from "@mui/material";

// Week label “Nov-03”
const prettyWeek = (weekKey) => {
  const d = new Date(weekKey);
  const m = d.toLocaleString("default", { month: "short" });
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}-${day}`;
};

export default function ScorecardGrid({ metrics, columns, data, onEdit, isEditor }) {
  // count missing manual fields to optionally display elsewhere (not required)
  const missing = React.useMemo(() => {
    let n = 0;
    for (const m of metrics.filter(x => x.type === "M")) {
      for (const wk of columns) {
        const v = data[wk]?.manualMetrics?.[m.id];
        if (v === undefined || v === null || v === "") n++;
      }
    }
    return n;
  }, [metrics, columns, data]);

  return (
    <Paper variant="outlined" sx={{ p: 0, borderRadius: 2, overflowX: "auto" }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700, minWidth: 260 }}>Metric</TableCell>
            <TableCell sx={{ fontWeight: 700, minWidth: 140 }}>Owner</TableCell>
            {columns.map((wk) => (
              <TableCell key={wk} sx={{ fontWeight: 700, minWidth: 120, textAlign: "right" }}>
                {prettyWeek(wk)}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {metrics.map((m) => (
            <TableRow key={m.id} hover>
              <TableCell>{m.label}</TableCell>
              <TableCell>
                <Chip size="small" label={m.owner} />
              </TableCell>

              {columns.map((wk) => {
                const autoVal = data[wk]?.metrics?.[m.id];
                const manualVal = data[wk]?.manualMetrics?.[m.id];

                // Manual → editable
                if (m.type === "M") {
                  return (
                    <TableCell key={wk} align="right">
                      <TextField
                        size="small"
                        type="text"
                        value={manualVal ?? ""}
                        onChange={(e) => {
                          if (!isEditor) return;
                          onEdit(wk, m.id, e.target.value);
                        }}
                        placeholder="—"
                        variant="standard"
                        fullWidth
                        InputProps={{
                          disableUnderline: !isEditor,
                          readOnly: !isEditor,
                        }}
                      />
                    </TableCell>
                  );
                }

                // Auto → read-only number or dash
                const val = (autoVal === undefined || autoVal === null) ? "—" : autoVal;
                return (
                  <TableCell key={wk} align="right">
                    {val}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
          {missing > 0 && (
            <TableRow>
              <TableCell colSpan={2 + columns.length}>
                <Tooltip title="Manual cells that are still empty this month">
                  <Chip color="warning" label={`Manual fields pending: ${missing}`} />
                </Tooltip>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Paper>
  );
}