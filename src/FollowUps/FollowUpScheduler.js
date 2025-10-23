import React, { useState } from "react";
import { format, isBefore } from "date-fns";
import { TextField, IconButton, Tooltip } from "@mui/material";
import { Save as SaveIcon } from "@mui/icons-material";
// Hook para manipular el calendario
import { useCalendar } from "./Calendar/CalendarContext";
import { useTheme } from "@mui/material/styles";

const FollowUpScheduler = ({ client, updateFollowUpDate }) => {
  const { addEvent } = useCalendar();
  const theme = useTheme();
  const [editMode, setEditMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    client.nextFollowUpDate ? new Date(client.nextFollowUpDate) : null
  );

   const getFollowUpColor = (count) => {
    if (count === 0) return theme.palette.primary.light;   // 1er seguimiento
    if (count === 1) return theme.palette.primary.main;    // 2º seguimiento
    if (count === 2) return theme.palette.primary.dark;    // 3er seguimiento
    if (count === 3) return theme.palette.warning.main;    // 4º seguimiento
    return theme.palette.error.main;                       // ≥5º seguimiento
  };

   const getFollowUpColorName = (count) => {
   if (count === 0) return '1st Attempt';
   if (count === 1) return '2nd Attempt';
   if (count === 2) return '3rd Attempt';
   if (count === 3) return '4th Attempt';
   return '5th Attempt';
};

  const handleSave = () => {
    if (selectedDate && !isNaN(selectedDate.getTime())) {
      // 1) Persistir en Firestore (ejecutado en el padre)
      updateFollowUpDate(client.id, selectedDate.toISOString());

      const followUpCount = Array.isArray(client.communicationLogs)
        ? client.communicationLogs.length
        : 0;

      // 2) Disparar evento en Calendar

      const start = selectedDate;
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      // ——— Mismo cálculo de amountDue que en FollowUps.js ———
      const monthly = Number(client.installmentAmount || 500);
      const payments = Array.isArray(client.payments) ? client.payments : [];
      const firstRaw = client.firstInstallmentDate;
      const firstDate = firstRaw.seconds
        ? new Date(firstRaw.seconds * 1000)
        : new Date(firstRaw);
      const validPayments = payments
        .map(p => ({ ...p, date: new Date(p.date) }))
        .filter(p => !isNaN(p.date) && p.date >= firstDate);
      const totalPaid = validPayments.reduce((sum, p) => sum + p.amount, 0);
      const monthsSinceStart =
        (new Date().getFullYear() - firstDate.getFullYear()) * 12 +
        (new Date().getMonth() - firstDate.getMonth()) +
        1;
      const paidMonths = Math.floor(totalPaid / monthly);
      const missedMonths = Math.max(0, monthsSinceStart - paidMonths);
      const amountDue = missedMonths * monthly;
      // ——————————————————————————
      
      const newEv = {
        id: `${client.id}-followup-${selectedDate.getTime()}`,
        title: `Follow-up: ${client.name}`,
        start,
        end,
        description: `Next follow-up scheduled with ${client.name}`,
        color: getFollowUpColor(followUpCount),
        colorName: getFollowUpColorName(followUpCount),
        amountDue,
      };

      addEvent(newEv);
      console.log("[FollowUpScheduler] addEvent fired:", newEv);

      // 3) Salir de modo edición
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
