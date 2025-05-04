// src/FollowUps/FollowUpNotes.js
import React, { useState } from "react";
import { TextField, IconButton, Tooltip } from "@mui/material";
import { Send as SendIcon } from "@mui/icons-material";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import db from "../firebase";

const FollowUpNotes = ({ clientId }) => {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSaveNote = async () => {
    if (!note.trim()) return;
    if (!clientId) {
      console.error("clientId is missing. Cannot save follow-up note.");
      return;
    }

    setLoading(true);
    try {
      const now = new Date();
      const entry = {
        timestamp: now.toISOString(), // ✅ Fixed field name
        user: "System",
        message: note.trim(), // ✅ Fixed field name
      };

      const clientRef = doc(db, "clients", clientId);
      await updateDoc(clientRef, {
        communicationLogs: arrayUnion(entry),
      });

      setNote("");
    } catch (err) {
      console.error("Failed to save follow-up note:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <TextField
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add note..."
        size="small"
        disabled={loading}
        variant="outlined"
        fullWidth
      />
      <Tooltip title="Save Note">
        <IconButton onClick={handleSaveNote} disabled={loading || !note.trim()}>
          <SendIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </div>
  );
};

export default FollowUpNotes;
