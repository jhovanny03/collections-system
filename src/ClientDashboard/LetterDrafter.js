// src/ClientDashboard/LetterDrafter.js
import React, { useState } from "react";
import {
  Box,
  Paper,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
} from "@mui/material";

import WarningActiveLetter from "./letters/warning/WarningActiveLetter";

export default function LetterDrafter({ client }) {
  const [category, setCategory] = useState("");   // "warning" | "termination"
  const [variant, setVariant] = useState("");     // depends on category

  const resetVariant = (val) => {
    setCategory(val);
    setVariant("");
  };

  const renderModule = () => {
    if (category === "warning" && variant === "active") {
      return <WarningActiveLetter client={client} />;
    }
    // Stubs for future:
    // if (category === "warning" && variant === "filed") return <WarningFiledLetter client={client} />;
    // if (category === "termination" && variant === "noRefund") return <TerminationNoRefund client={client} />;
    // if (category === "termination" && variant === "withRefundFull") return <TerminationWithRefundFull client={client} />;
    // if (category === "termination" && variant === "withRefundPartial") return <TerminationWithRefundPartial client={client} />;
    return null;
  };

  return (
    <Paper sx={{ p: 3, borderRadius: 2 }}>
      <Typography variant="h6" fontWeight={700} gutterBottom>
        📝 Letter Drafter
      </Typography>

      <Box sx={{ display: "grid", gap: 2, maxWidth: 560 }}>
        <FormControl fullWidth>
          <InputLabel>Category</InputLabel>
          <Select
            label="Category"
            value={category}
            onChange={(e) => resetVariant(e.target.value)}
          >
            <MenuItem value="warning">Warning Letter</MenuItem>
            <MenuItem value="termination">Termination Letter</MenuItem>
          </Select>
        </FormControl>

        {category === "warning" && (
          <FormControl fullWidth>
            <InputLabel>Type</InputLabel>
            <Select
              label="Type"
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
            >
              <MenuItem value="active">Active Client</MenuItem>
              <MenuItem value="filed">Filed Client</MenuItem>
            </Select>
          </FormControl>
        )}

        {category === "termination" && (
          <FormControl fullWidth>
            <InputLabel>Template</InputLabel>
            <Select
              label="Template"
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
            >
              <MenuItem value="noRefund">No Refund</MenuItem>
              <MenuItem value="withRefundFull">With Refund — Full</MenuItem>
              <MenuItem value="withRefundPartial">With Refund — Partial</MenuItem>
            </Select>
          </FormControl>
        )}
      </Box>

      <Divider sx={{ my: 3 }} />

      {renderModule()}
    </Paper>
  );
}