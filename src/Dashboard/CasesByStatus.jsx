// src/Dashboard/CasesByStatus.jsx
import React, { useEffect, useMemo, useState } from "react";
import DashboardCard from "./DashboardCard";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import {
  Box,
  Stack,
  Typography,
  Chip,
  LinearProgress,
  useTheme,
  Divider,
} from "@mui/material";

export default function CasesByStatus({ clients: clientsProp }) {
  const theme = useTheme();

  // If clients not passed, load from Firestore (same pattern you’ve used)
  const [clients, setClients] = useState(
    Array.isArray(clientsProp) ? clientsProp : null
  );
  useEffect(() => {
    if (Array.isArray(clientsProp)) setClients(clientsProp);
  }, [clientsProp]);

  useEffect(() => {
    if (clients !== null) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "clients"));
        setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("🔥 Error loading clients for CasesByStatus:", e);
        setClients([]);
      }
    })();
  }, [clients]);

  // Build counts -> sorted array
  const rows = useMemo(() => {
    if (!Array.isArray(clients)) return [];
    const m = new Map();
    for (const c of clients) {
      const key = String(c.caseStatus || "UNKNOWN").toUpperCase();
      m.set(key, (m.get(key) || 0) + 1);
    }
    return Array.from(m.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [clients]);

  const total = rows.reduce((s, r) => s + r.count, 0);
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

  // Color palette per row (cycles through theme accents)
  const palette = [
    theme.palette.primary.main,
    theme.palette.warning.main,
    theme.palette.success.main,
    theme.palette.info.main,
    theme.palette.error.main,
    theme.palette.secondary.main,
  ];

  return (
    <DashboardCard title="Cases by Status">
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No cases found.
        </Typography>
      ) : (
        <>
          {/* Totals line */}
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 1 }}
          >
            <Chip
              label={`Total: ${total}`}
              size="small"
              sx={{ bgcolor: "background.default", border: "1px solid", borderColor: "divider" }}
            />
          </Stack>

          {/* Ranked bar list */}
          <Stack spacing={1.25}>
            {rows.map((r, i) => {
              const percent = pct(r.count);
              const barColor = palette[i % palette.length];
              return (
                <Box key={r.status}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ mb: 0.25 }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {r.status}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {r.count} ({percent}%)
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={percent}
                    sx={{
                      height: 10,
                      borderRadius: 999,
                      "& .MuiLinearProgress-bar": {
                        backgroundColor: barColor,
                        borderRadius: 999,
                      },
                      backgroundColor: theme.palette.action.hover,
                    }}
                  />
                </Box>
              );
            })}
          </Stack>

          <Divider sx={{ my: 1.5 }} />

          {/* Compact legend chips (optional but helpful when there are many) */}
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {rows.map((r, i) => (
              <Chip
                key={`legend-${r.status}`}
                size="small"
                label={`${r.status}: ${r.count} (${pct(r.count)}%)`}
                sx={{
                  bgcolor: "background.default",
                  border: "1px solid",
                  borderColor: "divider",
                  color: "text.primary",
                  "& .MuiChip-avatar": { bgcolor: palette[i % palette.length] },
                }}
              />
            ))}
          </Stack>
        </>
      )}
    </DashboardCard>
  );
}