import React from "react";
import { Grid, Card, CardContent, Typography, Stack, Box, useTheme, alpha } from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import PaidIcon from "@mui/icons-material/Paid";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import PercentIcon from "@mui/icons-material/Percent";

const money = (n) => `$${Number(n || 0).toLocaleString()}`;

export default function CollectionsSummary({ totals }) {
  const theme = useTheme();

  const items = [
    { label: "Expected (Range)", value: money(totals?.expected), icon: <AssignmentTurnedInIcon /> },
    { label: "Actual Collected", value: money(totals?.actual), icon: <PaidIcon /> },
    { label: "Variance", value: money(totals?.variance), icon: <TrendingUpIcon /> },
    { label: "Collection Rate", value: `${totals?.ratePct ?? 0}%`, icon: <PercentIcon /> },
  ];

  return (
    <Grid container spacing={2}>
      {items.map((it) => (
        <Grid item xs={12} sm={6} md={3} key={it.label}>
          <Card
            sx={{
              borderRadius: 3,
              overflow: "hidden",
              background:
                it.label === "Collection Rate"
                  ? `linear-gradient(180deg, ${alpha(theme.palette.success.main, 0.1)}, transparent)`
                  : `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.06)}, transparent)`,
            }}
          >
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box sx={{ color: "text.secondary", fontSize: 12, fontWeight: 600 }}>
                  {it.label}
                </Box>
                <Box sx={{ color: "primary.main" }}>{it.icon}</Box>
              </Stack>
              <Typography variant="h5" fontWeight={800} sx={{ mt: 0.5 }}>
                {it.value}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}