import React, { useState } from "react";
import {
  Typography,
  Box,
  TextField,
  Button,
  IconButton,
  Modal,
  Alert,
  Snackbar,
  Slide,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import { doc, updateDoc } from "firebase/firestore";
import db from "../firebase";

export default function InstallmentSettings({ client, setClient }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const [editIndex, setEditIndex] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const openNewSchedule = () => {
    setAmount("");
    setStartDate("");
    setDuration("");
    setNote("");
    setEditIndex(null);
    setModalOpen(true);
    setError("");
  };

  const formatDate = (str) =>
    new Date(str).toLocaleDateString("default", {
      month: "long",
      year: "numeric",
    });

  const addMonths = (dateStr, months) => {
    const date = new Date(dateStr);
    date.setMonth(date.getMonth() + months);
    return date.toISOString().split("T")[0];
  };

  const handleSave = async () => {
    const parsedAmount = parseFloat(amount);
    const parsedDuration = parseInt(duration);

    if (!parsedAmount || !startDate || !parsedDuration) {
      setError("All fields are required.");
      return;
    }

    const newStart = startDate;
    const newEnd = addMonths(startDate, parsedDuration);

    let schedule = [...(client.installmentSchedule || [])];

    const newEntry = {
      amount: parsedAmount,
      start: newStart,
      end: newEnd,
      note: note.trim() || "",
    };

    if (editIndex !== null) {
      schedule[editIndex] = newEntry;
    } else {
      schedule.push(newEntry);
    }

    schedule.sort((a, b) => new Date(a.start) - new Date(b.start));

    const nowIso = new Date().toISOString();       // NEW (opcional: para “Last Client Today”)
    const clientRef = doc(db, "clients", client.id);
    await updateDoc(clientRef, {
      installmentSchedule: schedule,
      updatedAt: nowIso,                            // NEW
      lastChangeAt: nowIso,                         // NEW
      lastActivity: "edited",                       // NEW
    });

    setClient((prev) => ({ ...prev, installmentSchedule: schedule }));
    setModalOpen(false);
    setSuccess(true);
  };

  const handleEdit = (index) => {
    const item = client.installmentSchedule[index];
    setAmount(item.amount);
    setStartDate(item.start);
    setDuration(
      Math.max(
        1,
        Math.round(
          (new Date(item.end) - new Date(item.start)) /
            (1000 * 60 * 60 * 24 * 30)
        )
      )
    );
    setNote(item.note || "");
    setEditIndex(index);
    setModalOpen(true);
    setError("");
  };

  const handleDelete = async (index) => {
    if (!window.confirm("Are you sure you want to delete this entry?")) return;

    const updated = [...client.installmentSchedule];
    updated.splice(index, 1);

    const nowIso = new Date().toISOString();       // NEW
    const clientRef = doc(db, "clients", client.id);
    await updateDoc(clientRef, {
      installmentSchedule: updated,
      updatedAt: nowIso,                            // NEW
      lastChangeAt: nowIso,                         // NEW
      lastActivity: "edited",                       // NEW
    });

    setClient((prev) => ({ ...prev, installmentSchedule: updated }));
  };

  return (
    <Box mb={4}>
      <Typography variant="h6" fontWeight="bold" gutterBottom>
        Installment Settings
      </Typography>

      <List>
        {(client.installmentSchedule || []).map((item, index) => (
          <ListItem
            key={index}
            secondaryAction={
              <>
                <IconButton onClick={() => handleEdit(index)}>
                  <EditIcon />
                </IconButton>
                <IconButton onClick={() => handleDelete(index)}>
                  <DeleteIcon />
                </IconButton>
              </>
            }
          >
            <ListItemText
              primary={`$${item.amount.toLocaleString()} per month`}
              secondary={
                <>
                  {`From ${formatDate(item.start)} to ${formatDate(item.end)}`}
                  {item.note ? (
                    <>
                      <br />
                      <em>Note: {item.note}</em>
                    </>
                  ) : null}
                </>
              } 
            />
          </ListItem>
        ))}
      </List>

      <Button
        variant="contained"
        startIcon={<AddIcon />}
        onClick={openNewSchedule}
      >
        Add Installment Schedule
      </Button>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 340,
            bgcolor: "background.paper",
            borderRadius: 2,
            boxShadow: 24,
            p: 4,
          }}
        >
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            mb={2}
          >
            <Typography variant="h6">
              {editIndex !== null ? "Edit" : "New"} Installment Range
            </Typography>
            <IconButton onClick={() => setModalOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <TextField
            fullWidth
            type="number"
            label="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            type="date"
            label="Start Date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            type="number"
            label="# of Months"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            sx={{ mb: 3 }}
          />

          {/* NEW: campo de nota */}
          <TextField
            fullWidth
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={2}
            placeholder="Add a short note about this schedule…"
            sx={{ mb: 3 }}
          />

          <Button variant="contained" onClick={handleSave} fullWidth>
            Save
          </Button>
        </Box>
      </Modal>

      <Snackbar
        open={success}
        autoHideDuration={3000}
        onClose={() => setSuccess(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        TransitionComponent={(props) => <Slide {...props} direction="up" />}
      >
        <Alert
          onClose={() => setSuccess(false)}
          severity="success"
          sx={{ width: "100%" }}
        >
          ✅ Installment schedule updated!
        </Alert>
      </Snackbar>
    </Box>
  );
}
