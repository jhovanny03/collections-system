import React from "react";
import { Box, Typography } from "@mui/material";

export default function EmptyState() {
  return (
    <Box sx={{ p: 4, textAlign: "center", color: "text.secondary" }}>
      <Typography>No metrics defined.</Typography>
    </Box>
  );
}