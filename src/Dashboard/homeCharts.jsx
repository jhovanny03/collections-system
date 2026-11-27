// src/Dashboard/homeCharts.jsx
// Small hand-drawn SVG charts for Home ("Pulse" layout): sparkline, ring, the month's pace
// line, due vs collected with the collection rate, aging, and the day-by-day calendar.
import React from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { keyframes } from "@emotion/react";
import { money, pct } from "../billing/portfolio";
import { FONT_HEADING } from "../theme/brand";

export const grow = keyframes`from { transform: scaleY(0); }`;
export const growX = keyframes`from { transform: scaleX(0); }`;
const ringIn = keyframes`from { stroke-dashoffset: var(--full); }`;

export const kfmt = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);

/** Smooth path through points (Catmull-Rom as Bezier); `base` closes it into an area. */
export function smoothPath(pts, base) {
  if (!pts.length) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  if (base != null) d += ` L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z`;
  return d;
}

const cumulative = (arr) => {
  const out = [];
  for (const v of arr) out.push((out.length ? out[out.length - 1] : 0) + Number(v || 0));
  return out;
};
let uid = 0;
const useId = (p) => React.useMemo(() => `${p}${++uid}`, [p]);

/** Trend line with a soft fill. */
export function Spark({ values, color, height = 34 }) {
  const id = useId("sp");
  if (!values || values.length < 2) return <Box sx={{ height }} />;
  const w = 120, h = height, max = Math.max(...values), min = Math.min(...values), r = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / r) * (h - 6)]);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden="true" style={{ display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={smoothPath(pts, h)} fill={`url(#${id})`} />
      <path d={smoothPath(pts)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Progress ring with the value in the middle. */
export function Ring({ value, size = 112, stroke = 11, color, track, label, sub }) {
  const theme = useTheme();
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, value || 0)));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ flex: "none" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <Box component="circle" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c.toFixed(1)} strokeDashoffset={off.toFixed(1)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ "--full": c.toFixed(1) }} sx={{ animation: `${ringIn} 1.1s cubic-bezier(.2,.8,.2,1)` }} />
      <text x="50%" y={sub ? "47%" : "53%"} textAnchor="middle" dominantBaseline="middle" style={{ font: `700 22px ${FONT_HEADING}`, fill: theme.palette.text.primary }}>{label}</text>
      {sub && <text x="50%" y="66%" textAnchor="middle" style={{ font: "700 10.5px 'Nunito Sans'", fill: theme.palette.text.secondary }}>{sub}</text>}
    </svg>
  );
}

/**
 * This month's plan money, added up day by day, against the same days last month. Drawn in
 * white for the navy "Collected this month" card.
 */
export function PaceArea({ daily, height = 130 }) {
  const id = useId("pa");
  if (!daily || !daily.days?.length) return <Box sx={{ height }} />;
  const [y, m] = daily.month.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  const W = 800, H = height;
  const a = cumulative(daily.days), b = cumulative((daily.lastDays || []).slice(0, n));
  const max = Math.max(a[a.length - 1] || 0, b[b.length - 1] || 0, 1) * 1.06;
  const pt = (arr) => arr.map((v, i) => [(i / (n - 1)) * W, H - (v / max) * (H - 10)]);
  const pa = pt(a), pb = pt(b), last = pa[pa.length - 1];
  const mon = (mm) => new Date(y, mm - 1, 1).toLocaleDateString("en-US", { month: "short" });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" height={H} width="100%" style={{ display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5EEAD4" stopOpacity=".45" />
          <stop offset="1" stopColor="#5EEAD4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={smoothPath(pb)} fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
      <path d={smoothPath(pa, H)} fill={`url(#${id})`} />
      <path d={smoothPath(pa)} fill="none" stroke="#fff" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      {last && <circle cx={last[0]} cy={last[1]} r="5" fill="#5EEAD4" stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      {a.map((v, i) => (
        <Tooltip key={i} followCursor title={<><b>{mon(m)} {i + 1}: {money(v)} so far</b><br />+{money(daily.days[i])} that day · {mon(m - 1)} {i + 1}: {money(b[i] || 0)}</>}>
          <rect x={(i / (n - 1)) * W - W / n / 2} y="0" width={W / n} height={H} fill="transparent" />
        </Tooltip>
      ))}
    </svg>
  );
}

/** Due vs collected bars for the last 12 months, with the collection rate as a line. */
export function DueCollectedChart({ months, colors }) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  if (!months?.length) return <Box sx={{ height: 270 }} />;
  const W = 720, H = 270, L = 46, B = 26, T = 14, n = months.length;
  const top = Math.max(...months.map((m) => Math.max(m.expected || 0, m.collected || 0)), 1);
  const step = top > 400000 ? 200000 : top > 100000 ? 50000 : 10000;
  // Bars use the lower part of the chart so the rate line has its own band on top.
  const max = Math.ceil((top * 1.4) / step) * step;
  const bw = (W - L) / n, y = (v) => T + (H - T - B) * (1 - v / max);
  const rates = months.map((m) => (m.expected ? m.collected / m.expected : null));
  const valid = rates.filter((r) => r != null);
  const rmin = Math.max(0, Math.min(...valid) - 0.05), rmax = Math.min(1, Math.max(...valid) + 0.02);
  const ry = (r) => T + 10 + (H - T - B) * 0.2 * (1 - (r - rmin) / (rmax - rmin || 1));
  const rp = months.map((m, i) => [L + bw * i + bw / 2, ry(rates[i] ?? rmin)]);
  const axis = { font: "600 11px 'Nunito Sans'", fill: theme.palette.text.secondary };
  const grid = [];
  for (let v = 0; v <= max; v += step) grid.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      <defs>
        <linearGradient id="dcNow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={dark ? "#AEB6FF" : "#3B4BFF"} />
          <stop offset="1" stopColor={colors[0]} />
        </linearGradient>
      </defs>
      {grid.map((v) => (
        <g key={v}>
          <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke={theme.palette.divider} strokeOpacity=".6" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" style={axis}>{kfmt(v)}</text>
        </g>
      ))}
      {months.map((m, i) => {
        const x = L + bw * i + bw * 0.16, w = bw * 0.32, isNow = i === n - 1;
        const bar = (val, xx, fill) => (
          <Box component="rect" x={xx} y={y(val)} width={w} height={Math.max(0, H - B - y(val))} rx="4" fill={fill}
            sx={{ transformBox: "fill-box", transformOrigin: "bottom", animation: `${grow} .7s cubic-bezier(.2,.8,.2,1) both`, animationDelay: `${i * 35}ms`, "&:hover": { filter: "brightness(1.1)" } }} />
        );
        return (
          <Tooltip key={m.key} followCursor title={<><b>{m.label}</b><br />Due {money(m.expected)} · {m.clients || 0} clients<br />Collected {money(m.collected)} ({pct(rates[i])})</>}>
            <g>
              {bar(m.expected, x, dark ? "#4A5080" : "#C9CDEB")}
              {bar(m.collected, x + w + 3, isNow ? "url(#dcNow)" : colors[0])}
              <text x={L + bw * i + bw / 2} y={H - 8} textAnchor="middle" style={axis}>{String(m.label).split(" ")[0]}</text>
            </g>
          </Tooltip>
        );
      })}
      <path d={smoothPath(rp)} fill="none" stroke={theme.palette.secondary.main} strokeWidth="2.5" />
      {rp.map(([x, yy], i) => (
        <Tooltip key={i} title={<><b>{months[i].label}: {pct(rates[i])}</b><br />collection rate</>}>
          <g>
            <circle cx={x} cy={yy} r={i === n - 1 ? 5 : 3.2} fill={theme.palette.background.paper} stroke={theme.palette.secondary.main} strokeWidth="2" />
            {(i === n - 1 || i === 0) && (
              <text x={x} y={yy - 9} textAnchor="middle" style={{ font: "800 10.5px 'Nunito Sans'", fill: theme.palette.secondary.main }}>{pct(rates[i])}</text>
            )}
          </g>
        </Tooltip>
      ))}
    </svg>
  );
}

export const agingColors = (theme) => [theme.palette.success.main, "#C9961A", theme.palette.secondary.main, theme.palette.error.main];

/** Aging: one stacked bar for the whole amount, then a row per bucket. */
export function AgingPanel({ buckets, total, clients }) {
  const theme = useTheme();
  const cols = agingColors(theme);
  const mx = Math.max(...buckets.map((b) => b.amount || 0), 1);
  const tot = total || buckets.reduce((s, b) => s + (b.amount || 0), 0) || 1;
  return (
    <Stack spacing={1.75}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Typography sx={{ font: `700 24px ${FONT_HEADING}` }}>{money(total)}</Typography>
        <Typography variant="body2" color="text.secondary">{(clients || 0).toLocaleString()} clients</Typography>
      </Stack>
      <Box sx={{ display: "flex", gap: "3px", height: 14, borderRadius: 99, overflow: "hidden" }}>
        {buckets.map((b, i) => (
          <Tooltip key={b.key} title={<><b>{b.label}: {money(b.amount)}</b><br />{b.clients} clients</>}>
            <Box sx={{ width: `${Math.max(3, ((b.amount || 0) / tot) * 100)}%`, bgcolor: cols[i], transformOrigin: "left", animation: `${growX} .8s cubic-bezier(.2,.8,.2,1) both`, animationDelay: `${i * 60}ms` }} />
          </Tooltip>
        ))}
      </Box>
      {buckets.map((b, i) => (
        <Box key={b.key} sx={{ display: "grid", gridTemplateColumns: "88px 1fr 96px", gap: 1.5, alignItems: "center" }}>
          <Tooltip title={b.help || ""}><Typography variant="body2" fontWeight={700}>{b.label}</Typography></Tooltip>
          <Box sx={{ height: 10, borderRadius: 99, bgcolor: alpha(theme.palette.text.primary, 0.07), overflow: "hidden" }}>
            <Box sx={{ height: "100%", width: `${((b.amount || 0) / mx) * 100}%`, bgcolor: cols[i], borderRadius: 99, transformOrigin: "left", animation: `${growX} .8s cubic-bezier(.2,.8,.2,1) both`, animationDelay: `${i * 60}ms` }} />
          </Box>
          <Box sx={{ textAlign: "right" }}>
            <Typography variant="body2" fontWeight={800}>{kfmt(b.amount || 0)}</Typography>
            <Typography variant="caption" color="text.secondary">{b.clients} clients</Typography>
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

/**
 * The month as a calendar: plan money received each day. Days are shaded by rank among the
 * days with money (the 15th is far bigger than any other day, so a straight scale would
 * leave every other day pale).
 */
export function MonthCalendar({ daily }) {
  const theme = useTheme();
  if (!daily || !daily.days) return null;
  const [y, m] = daily.month.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  const first = new Date(y, m - 1, 1).getDay();
  const today = daily.days.length;
  const paid = daily.days.filter((v) => v > 0).slice().sort((a, b) => a - b);
  const level = (v) => {
    if (!(v > 0) || !paid.length) return 0;
    const rank = paid.findIndex((x) => x >= v) / Math.max(1, paid.length - 1);
    return rank >= 0.75 ? 4 : rank >= 0.5 ? 3 : rank >= 0.25 ? 2 : 1;
  };
  const p = theme.palette.primary.main;
  const shades = [alpha(theme.palette.text.primary, 0.05), alpha(p, 0.16), alpha(p, 0.42), alpha(p, 0.72), p];
  const strongText = theme.palette.primary.contrastText;
  const mon = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(<span key={`b${i}`} />);
  for (let d = 1; d <= n; d++) {
    const v = daily.days[d - 1];
    if (v == null) {
      cells.push(
        <Box key={d} sx={{ aspectRatio: "1.25", borderRadius: 1.5, border: 1, borderStyle: "dashed", borderColor: "divider", p: "5px 7px", fontSize: 11, fontWeight: 800, color: "text.disabled" }}>{d}</Box>
      );
      continue;
    }
    const lv = level(v);
    cells.push(
      <Tooltip key={d} title={<><b>{mon} {d}: {money(v)}</b><br />payment-plan money</>}>
        <Box sx={{
          aspectRatio: "1.25", borderRadius: 1.5, p: "5px 7px", display: "flex", flexDirection: "column", justifyContent: "space-between",
          fontSize: 11, fontWeight: 800, bgcolor: shades[lv], color: lv >= 3 ? strongText : "text.secondary",
          outline: d === today ? `2px solid ${theme.palette.secondary.main}` : "none", outlineOffset: 1,
          transition: "transform .12s", "&:hover": { transform: "scale(1.06)" },
        }}>
          <span>{d}</span>
          <Box component="span" sx={{ alignSelf: "flex-end", fontSize: 10.5 }}>{v > 0 ? kfmt(v) : "—"}</Box>
        </Box>
      </Tooltip>
    );
  }
  return (
    <Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px" }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <Typography key={d} variant="caption" fontWeight={800} color="text.secondary" textAlign="center">{d}</Typography>
        ))}
        {cells}
      </Box>
      <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="flex-end" sx={{ mt: 1.25 }}>
        <Typography variant="caption" fontWeight={700} color="text.secondary">Less</Typography>
        {shades.slice(1).map((c) => <Box key={c} sx={{ width: 16, height: 10, borderRadius: 0.75, bgcolor: c }} />)}
        <Typography variant="caption" fontWeight={700} color="text.secondary">More</Typography>
      </Stack>
    </Box>
  );
}
