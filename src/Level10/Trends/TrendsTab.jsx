// src/Level10/Trends/TrendsTab.jsx
import React from "react";
import { Box } from "@mui/material";
import TrendsPanel from "./TrendsPanel";

/**
 * Thin wrapper so the analysis module can be mounted as its own tab/route
 * without touching the Scorecard internals. Pass through the same props
 * you already use for TrendsPanel.
 */
export default function TrendsTab({
  clients = [],
  monday,
  sunday,
  month,
  dueDay = 15,
  weeksWindow = 12,
}) {
  if (!Array.isArray(clients) || clients.length === 0) {
    // Render nothing until clients are available; keeps Level10 clean.
    return null;
  }

  return (
    <Box sx={{ mt: 2 }}>
      <TrendsPanel
        clients={clients}
        monday={monday}
        sunday={sunday}
        month={month}
        dueDay={dueDay}
        weeksWindow={weeksWindow}
      />
    </Box>
  );
}