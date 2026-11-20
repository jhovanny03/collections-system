// src/ui/kit.jsx
// Shared page pieces so every screen reads the same way.
import React from "react";
import { Box, Card, CardActionArea, Stack, Typography, Tooltip, Skeleton } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import TrendingUpRounded from "@mui/icons-material/TrendingUpRounded";
import TrendingDownRounded from "@mui/icons-material/TrendingDownRounded";
import { Link } from "react-router-dom";

/** Page title, one-line explanation and actions on the right. */
export function PageHeader({ title, subtitle, actions, children }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "flex-end" }} justifyContent="space-between">
        <Box sx={{ minWidth: 0 }}>
          {title && <Typography variant="h4">{title}</Typography>}
          {subtitle && (
            <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5, maxWidth: 820 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions && <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>{actions}</Stack>}
      </Stack>
      {children}
    </Box>
  );
}

const TONES = { default: "primary", good: "success", warn: "warning", bad: "secondary", danger: "error" };

/**
 * A number that matters, with what it means underneath.
 * tone: default | good | warn | bad | danger. `to` makes the card a link.
 */
export function StatCard({ label, value, sub, help, tone = "default", trend, to, onClick, loading, icon }) {
  const theme = useTheme();
  const color = theme.palette[TONES[tone] || "primary"].main;
  const body = (
    <Box sx={{ p: 2.25, height: "100%", display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Stack direction="row" alignItems="center" spacing={0.75}>
        {icon && <Box sx={{ color, display: "flex", "& svg": { fontSize: 20 } }}>{icon}</Box>}
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, fontSize: 11 }}>
          {label}
        </Typography>
        {help && (
          <Tooltip title={help}>
            <InfoOutlined sx={{ fontSize: 15, color: "text.disabled" }} />
          </Tooltip>
        )}
      </Stack>
      {loading ? (
        <Skeleton width="60%" height={40} />
      ) : (
        <Typography sx={{ fontFamily: theme.typography.h4.fontFamily, fontWeight: 700, fontSize: { xs: 26, md: 30 }, lineHeight: 1.15, color: tone === "default" ? "text.primary" : color }}>
          {value}
        </Typography>
      )}
      {(sub || trend) && (
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: "auto" }}>
          {trend && (
            <Stack direction="row" spacing={0.25} alignItems="center" sx={{ color: trend.good ? "success.main" : "secondary.main", fontWeight: 800, fontSize: 13 }}>
              {trend.up ? <TrendingUpRounded fontSize="small" /> : <TrendingDownRounded fontSize="small" />}
              <span>{trend.label}</span>
            </Stack>
          )}
          {sub && (
            <Typography variant="body2" color="text.secondary">
              {sub}
            </Typography>
          )}
        </Stack>
      )}
    </Box>
  );
  return (
    <Card sx={{ height: "100%", borderTop: `3px solid ${alpha(color, tone === "default" ? 0.0 : 0.9)}` }}>
      {to || onClick ? (
        <CardActionArea component={to ? Link : "button"} to={to} onClick={onClick} sx={{ height: "100%", alignItems: "stretch" }}>
          {body}
        </CardActionArea>
      ) : (
        body
      )}
    </Card>
  );
}

/** A titled panel. */
export function Section({ title, subtitle, action, children, sx, pad = true }) {
  return (
    <Card sx={{ height: "100%", display: "flex", flexDirection: "column", ...sx }}>
      {(title || action) && (
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1} sx={{ px: 2.25, pt: 2, pb: subtitle ? 0.5 : 1 }}>
          <Box sx={{ minWidth: 0 }}>
            {title && <Typography variant="h6">{title}</Typography>}
            {subtitle && (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          {action}
        </Stack>
      )}
      <Box sx={{ px: pad ? 2.25 : 0, pb: pad ? 2.25 : 0, pt: 1, flex: 1, minWidth: 0 }}>{children}</Box>
    </Card>
  );
}

/** Responsive grid of equal tiles. */
export function Tiles({ min = 220, gap = 2, children, sx }) {
  return <Box sx={{ display: "grid", gap, gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`, ...sx }}>{children}</Box>;
}

/** Friendly empty state. */
export function Empty({ title = "Nothing here", children }) {
  return (
    <Box sx={{ py: 5, textAlign: "center", color: "text.secondary" }}>
      <Typography fontWeight={800} color="text.primary">
        {title}
      </Typography>
      {children && <Typography variant="body2" sx={{ mt: 0.5 }}>{children}</Typography>}
    </Box>
  );
}
