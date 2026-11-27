// src/pages/promises/PromiseCalendar.jsx
// The month as a calendar for Promised payments: each day shows the amount promised and a
// dot per promise colored by how it went. Clicking a day filters the promise list.
import React from "react";
import { Box, Button, Card, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import { money } from "../../billing/portfolio";
import { FONT_HEADING } from "../../theme/brand";

const pad2 = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const kfmt = (n) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k` : `$${Math.round(n)}`);

export const dotColor = (theme, status) =>
  ({ kept: theme.palette.success.main, missed: theme.palette.error.main, today: "#C9961A", grace: "#C9961A", upcoming: theme.palette.info.main }[status] || theme.palette.text.disabled);

/** entries: [{ key, dateKey: "YYYY-MM-DD", amount, status, name }] for any month. */
export default function PromiseCalendar({ month, setMonth, entries, day, setDay, todayKey }) {
  const theme = useTheme();
  const y = month.getFullYear(), m = month.getMonth();
  const first = new Date(y, m, 1).getDay();
  const n = new Date(y, m + 1, 0).getDate();
  const byDay = new Map();
  for (const e of entries) {
    if (!e.dateKey.startsWith(`${y}-${pad2(m + 1)}`)) continue;
    const list = byDay.get(e.dateKey) || [];
    list.push(e);
    byDay.set(e.dateKey, list);
  }
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(<Box key={`b${i}`} />);
  for (let d = 1; d <= n; d++) {
    const key = `${y}-${pad2(m + 1)}-${pad2(d)}`;
    const list = byDay.get(key) || [];
    const total = list.reduce((t, e) => t + e.amount, 0);
    const isToday = key === todayKey;
    const on = day === key;
    const cell = (
      <Box
        key={key}
        component={list.length ? "button" : "div"}
        type={list.length ? "button" : undefined}
        onClick={list.length ? () => setDay(on ? "" : key) : undefined}
        sx={{
          height: 60, p: "4px 6px", borderRadius: 2, border: 1, font: "inherit", textAlign: "left",
          borderColor: on ? "primary.main" : isToday ? alpha(theme.palette.secondary.main, 0.45) : "divider",
          boxShadow: on ? `0 0 0 2px ${theme.palette.primary.main}` : "none",
          bgcolor: isToday ? alpha(theme.palette.secondary.main, 0.06) : list.length ? "background.paper" : "transparent",
          display: "flex", flexDirection: "column", justifyContent: "space-between", cursor: list.length ? "pointer" : "default",
          transition: "border-color .12s", "&:hover": list.length ? { borderColor: "primary.main" } : undefined, color: "text.primary",
        }}
      >
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="caption" fontWeight={800} color={isToday ? "secondary.main" : "text.secondary"} sx={{ lineHeight: 1.2 }}>{d}</Typography>
          {list.length > 1 && <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ lineHeight: 1.2 }}>{list.length}</Typography>}
        </Stack>
        {total > 0 && <Typography sx={{ font: `700 13px ${FONT_HEADING}`, lineHeight: 1 }}>{kfmt(total)}</Typography>}
        <Stack direction="row" spacing="3px" sx={{ minHeight: 7, overflow: "hidden" }}>
          {list.slice(0, 8).map((e) => <Box key={e.key} sx={{ width: 7, height: 7, flex: "none", borderRadius: "50%", bgcolor: dotColor(theme, e.status) }} />)}
        </Stack>
      </Box>
    );
    cells.push(
      list.length ? (
        <Tooltip key={key} title={<>{list.slice(0, 6).map((e) => <div key={e.key}>{money(e.amount)} · {e.name}</div>)}{list.length > 6 ? <div>+{list.length - 6} more</div> : null}</>}>{cell}</Tooltip>
      ) : cell
    );
  }
  return (
    <Card sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.25 }}>
        <Typography variant="h6">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</Typography>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <IconButton size="small" onClick={() => setMonth(new Date(y, m - 1, 1))} aria-label="Previous month"><ChevronLeftRounded /></IconButton>
          <Button size="small" variant="outlined" onClick={() => { const t = new Date(); setMonth(new Date(t.getFullYear(), t.getMonth(), 1)); setDay(todayKey); }}>Today</Button>
          <IconButton size="small" onClick={() => setMonth(new Date(y, m + 1, 1))} aria-label="Next month"><ChevronRightRounded /></IconButton>
        </Stack>
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "5px" }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <Typography key={d} variant="caption" fontWeight={800} color="text.secondary" textAlign="center">{d}</Typography>
        ))}
        {cells}
      </Box>
      <Stack direction="row" spacing={1.75} useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
        {[["kept", "Kept"], ["missed", "Missed"], ["today", "Due today / waiting"], ["upcoming", "Upcoming"]].map(([s, l]) => (
          <Stack key={s} direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: dotColor(theme, s) }} />
            <Typography variant="caption" fontWeight={700} color="text.secondary">{l}</Typography>
          </Stack>
        ))}
      </Stack>
    </Card>
  );
}
