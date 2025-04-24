// src/FollowUps/FollowUpScheduler.js
import React, { useState } from "react";
import { format, isBefore } from "date-fns";
import { TextField, IconButton, Tooltip } from "@mui/material";
import { Save as SaveIcon } from "@mui/icons-material";

const FollowUpScheduler = ({ client, updateFollowUpDate }) => {
  const [editMode, setEditMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    client.nextFollowUpDate ? new Date(client.nextFollowUpDate) : null
  );

  const handleSave = () => {
    if (selectedDate && !isNaN(selectedDate.getTime())) {
      updateFollowUpDate(client.id, selectedDate.toISOString());
      setEditMode(false);
    }
  };

  const today = new Date();
  const showWarning = selectedDate && isBefore(selectedDate, today);

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {editMode ? (
        <>
          <TextField
            type="date"
            size="small"
            value={selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""}
            onChange={(e) => {
              const [year, month, day] = e.target.value.split("-");
              setSelectedDate(
                new Date(Number(year), Number(month) - 1, Number(day))
              );
            }}
            InputLabelProps={{ shrink: true }}
          />
          <Tooltip title="Save Follow-Up Date">
            <IconButton onClick={handleSave}>
              <SaveIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
      ) : (
        <span
          style={{
            color: showWarning ? "red" : "inherit",
            cursor: "pointer",
            fontWeight: showWarning ? "bold" : "normal",
          }}
          onClick={() => setEditMode(true)}
        >
          {selectedDate ? format(selectedDate, "MMM d, yyyy") : "—"}
        </span>
      )}
    </div>
  );
};

export default FollowUpScheduler;
