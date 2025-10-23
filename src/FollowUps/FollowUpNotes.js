import React, { useState } from "react";
import { TextField, IconButton, Tooltip } from "@mui/material";
import { Send as SendIcon } from "@mui/icons-material";
import { doc, updateDoc, arrayUnion, deleteField } from "firebase/firestore";
import db from "../firebase";
// Hook para manipular el calendario
import { useCalendar } from "./Calendar/CalendarContext";
import { scheduleNextFollowUp } from './FollowUpScheduler';


/**
 * Props:
 * - clientId: string
 * - onSave: () => void  // callback para refrescar la lista de follow-ups
 */
export default function FollowUpNotes({ client, clientId, clientName, nextFollowUpDate, onSave }) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const { events, addEvent, editEvent } = useCalendar();

  const handleSaveNote = async () => {
    if (!note.trim() || !clientId) return;
    setLoading(true);

    try {
      const now = new Date();
      const entry = {
        timestamp: now.toISOString(),
        user: "System",
        message: note.trim(),
      };

      // 1) Guardar en Firestore
      const clientRef = doc(db, "clients", clientId);
      await updateDoc(clientRef, {
        communicationLogs: arrayUnion(entry),
      });
           // MOD: añadimos deleteField para que nunca vuelva a reaparecer en Follow-Ups
      await updateDoc(clientRef, {
       communicationLogs: arrayUnion(entry),
       nextFollowUpDate: deleteField(),
     });

      // 2) Añadir evento de “contacto” al calendario
      const noteEv = {
        id: `${clientId}-note-${now.getTime()}`,
        title: `Follow-up Note: ${clientId}`,
        start: now,
        end: now,
        description: entry.message,
        color: "secondary",
      };
      addEvent(noteEv);
      console.log("[FollowUpNotes] addEvent fired:", noteEv);

      /*if (client.nextFollowUpDate) {
        const nextDate = client.nextFollowUpDate.seconds
          ? new Date(client.nextFollowUpDate.seconds * 1000)
          : new Date(client.nextFollowUpDate);
        const end = new Date(nextDate);
        end.setDate(end.getDate() + 1);*/

        if (nextFollowUpDate) {
        // fecha de inicio y fin
        const nextDate = nextFollowUpDate.seconds
          ? new Date(nextFollowUpDate.seconds * 1000)
          : new Date(nextFollowUpDate);
        const end = new Date(nextDate);
        end.setDate(end.getDate() + 1);

         const followUpEventId = `${clientId}-followup`;


        const followUpEv = {
          id: followUpEventId,
          title: `Next Follow-up: ${client.name}`,
          start: nextDate,
          end,
          description: entry.message,
          color: "primary",
          extendedProps: { clientId }
        };
        
        addEvent(followUpEv);
        
        console.log(
          "[FollowUpNotes] addEvent NextFollowUp fired:",
          followUpEv
        );

        const exists = events.find((ev) => ev.id === followUpEventId);
        if (exists) {
          editEvent(followUpEv);
        } else {
          addEvent(followUpEv);
        }
      

      }

      // 3) Refrescar la lista y limpiar el campo
      if (onSave) onSave();
      
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
        <IconButton
          onClick={handleSaveNote}
          disabled={loading || !note.trim()}
          color="primary"
        >
          <SendIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </div>
  );
}
