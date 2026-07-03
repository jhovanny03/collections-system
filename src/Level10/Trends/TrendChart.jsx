// src/Level10/Trends/TrendChart.jsx
import React, { useMemo } from "react";
import { Card, CardContent, Typography, ToggleButton, ToggleButtonGroup, Box, Table, TableBody, TableCell, TableHead, TableRow, Divider, Stack } from "@mui/material";
import { BarChart } from "@mui/x-charts/BarChart";

/**
 * Props:
 * - frozenWeeks: [{ weekKey:'2025-11-03', values:{ ...auto + manual merged... } }]
 * - metricKey: string
 * - label: string
 * - suffix?: '$'|'%'|undefined
 */
export default function TrendChart({ frozenWeeks = [], metricKey, label, suffix }) {
  const [mode, setMode] = React.useState("table");

  const rows = useMemo(() => {
    const weeks = [...frozenWeeks].sort((a,b)=>a.weekKey.localeCompare(b.weekKey));
    return weeks.map(w => ({
      week: w.weekKey,
      value: pick(w.values?.[metricKey]),
    }));
  }, [frozenWeeks, metricKey]);

  const seriesData = rows.map(r => (typeof r.value === "number" ? r.value : null));
  const categories = rows.map(r => r.week.slice(5)); // show MM-DD

  return (
    <Card sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6" fontWeight={700}>{label} — Week-over-Week</Typography>
          <ToggleButtonGroup
            size="small"
            value={mode}
            exclusive
            onChange={(_, v)=> v && setMode(v)}
          >
            <ToggleButton value="table">Table</ToggleButton>
            <ToggleButton value="chart">Chart</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {mode === "table" ? (
          <Box>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Week (Mon)</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Value</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map(r=>(
                  <TableRow key={r.week}>
                    <TableCell>{r.week}</TableCell>
                    <TableCell>{format(r.value, suffix)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        ) : (
          <Box sx={{ height: 340 }}>
            <BarChart
              xAxis={[{ scaleType: "band", data: categories }]}
              series={[{ data: seriesData }]}
              height={320}
            />
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Quick deltas */}
        <Typography variant="body2" color="text.secondary">
          {rows.length >= 2
            ? `Δ last week: ${format(delta(rows.at(-2)?.value, rows.at(-1)?.value), suffix)}`
            : "Δ last week: —"}
        </Typography>
      </CardContent>
    </Card>
  );
}

function pick(v){ return v == null ? null : v; }
function delta(a,b){
  if (typeof a !== "number" || typeof b !== "number") return "—";
  const d = b - a;
  return d;
}
function format(v, suffix){
  if (v == null || v === "—") return "—";
  if (typeof v === "number" && suffix === "%") return `${v}%`;
  if (typeof v === "number" && suffix === "$")
    return `$${v.toLocaleString(undefined,{ maximumFractionDigits: 2 })}`;
  return String(v);
}