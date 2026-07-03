import React from "react";
import { Box, Typography } from "@mui/material";

export default function SectionHeader({ title }) {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>{title}</Typography>
    </Box>
  );
}