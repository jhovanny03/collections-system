// src/Reports/AgingTrend.jsx
// Aging at the end of each of the last 12 months. Months saved by the nightly snapshot
// (agingSnapshots/{YYYY-MM}) are used as they are; earlier months are rebuilt from
// payment history.
import React, { useEffect, useMemo, useState } from "react";
import { Box, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { BarChart } from "@mui/x-charts/BarChart";
import { collection, getDocs } from "firebase/firestore";
import db from "../firebase";
import { useInsights } from "../data/BookProvider";
import { money, monthLabel } from "../billing/portfolio";
import { Section } from "../ui/kit";

const COLORS_LIGHT = ["#E0B03C", "#EE7A55", "#D34E24", "#A3191B"];
const COLORS_DARK = ["#E0B03C", "#F29A7A", "#EE7A55", "#EF6B6B"];

export default function AgingTrend() {
  const theme = useTheme();
  const colors = theme.palette.mode === "dark" ? COLORS_DARK : COLORS_LIGHT;
  // Prepared on the server with the other figures (src/data/BookProvider.jsx useInsights).
  const insights = useInsights();
  const history = insights ? insights.agingTrend : null;
  const [saved, setSaved] = useState({});


  useEffect(() => {
    getDocs(collection(db, "agingSnapshots"))
      .then((s) => setSaved(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))))
      .catch(() => setSaved({}));
  }, []);

  const data = useMemo(() => {
    if (!history) return [];
    const cur = history[history.length - 1]?.key;
    return history.map((m) => {
      // The current month is always live; past months prefer the saved month-end figure.
      const s = m.key !== cur ? saved[m.key] : null;
      const row = s ? { ...m, b0: s.b0, b30: s.b30, b60: s.b60, b90: s.b90, total: s.total, clients: s.clients, source: "saved" } : m;
      return { ...row, label: m.key === cur ? `${monthLabel(m.key)} (so far)` : monthLabel(m.key) };
    });
  }, [history, saved]);

  const first = data[0];
  const last = data[data.length - 2]; // last full month
  const change = first && last ? last.b90 - first.b90 : 0;

  return (
    <Section
      title="Aging trend, last 12 months"
      subtitle="What was owed at the end of each month, by age"
      action={
        last && (
          <Chip
            size="small"
            color={change > 0 ? "error" : "success"}
            variant="outlined"
            label={`90+ ${change > 0 ? "up" : "down"} ${money(Math.abs(change))} since ${monthLabel(first.key)}`}
          />
        )
      }
      sx={{ mb: 2.5 }}
    >
      {!history ? (
        <Box sx={{ py: 4 }}>
          <LinearProgress />
          <Typography variant="caption" color="text.secondary">Rebuilding a year of aging from payment history…</Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ height: 320 }}>
            <BarChart
              dataset={data}
              xAxis={[{ scaleType: "band", dataKey: "label" }]}
              yAxis={[{ valueFormatter: (v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`), width: 60 }]}
              series={[
                { dataKey: "b0", label: "0–30", stack: "a", color: colors[0], valueFormatter: (v) => money(v) },
                { dataKey: "b30", label: "31–60", stack: "a", color: colors[1], valueFormatter: (v) => money(v) },
                { dataKey: "b60", label: "61–90", stack: "a", color: colors[2], valueFormatter: (v) => money(v) },
                { dataKey: "b90", label: "90+", stack: "a", color: colors[3], valueFormatter: (v, c) => `${money(v)} · total ${money(data[c.dataIndex]?.total)}` },
              ]}
              borderRadius={3}
              margin={{ left: 8, right: 8, top: 16, bottom: 8 }}
            />
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Earlier months are rebuilt from payment history (clients closed since are left out). From now on each month's figure is saved at month end by a nightly job.
            </Typography>
          </Stack>
        </>
      )}
    </Section>
  );
}
