import React from "react";
import {
  Box,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Tooltip,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";

export default function TrendsControls({
  weeksWindow,
  setWeeksWindow,
  windowOptions = [8, 12, 16, 24],
  onExport, // optional callback provided by parent
}) {
  return (
    <Box sx={{ mb: 1 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        alignItems={{ xs: "stretch", sm: "center" }}
        justifyContent="space-between"
      >
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="weeks-window-label">Weeks window</InputLabel>
          <Select
            labelId="weeks-window-label"
            label="Weeks window"
            value={weeksWindow}
            onChange={(e) => setWeeksWindow(Number(e.target.value))}
          >
            {windowOptions.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt} weeks
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Tooltip title="Export visible trends to CSV">
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={onExport}
            >
              Export CSV
            </Button>
          </span>
        </Tooltip>
      </Stack>
    </Box>
  );
}