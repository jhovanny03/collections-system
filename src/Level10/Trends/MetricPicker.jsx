// src/Level10/Trends/MetricPicker.jsx
import React from "react";
import { FormControl, InputLabel, Select, MenuItem, Box } from "@mui/material";

/**
 * Props:
 * - metric: string
 * - onChange(metricKey)
 * - options: [{ key, label }]
 */
export default function MetricPicker({ metric, onChange, options }) {
  return (
    <Box sx={{ minWidth: 260 }}>
      <FormControl fullWidth size="small">
        <InputLabel>Metric</InputLabel>
        <Select
          value={metric}
          label="Metric"
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((op) => (
            <MenuItem key={op.key} value={op.key}>
              {op.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
}