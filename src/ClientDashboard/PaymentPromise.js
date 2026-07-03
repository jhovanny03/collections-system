// src/ClientDashboard/PaymentPromise.js
import React, { useState } from "react";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import db from "../firebase";

import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Stack,
  TextField,
  Button,
  Chip,
  Divider,
  Alert,
  Tooltip,
} from "@mui/material";
import EventIcon from "@mui/icons-material/Event";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import NoteAltIcon from "@mui/icons-material/NoteAlt";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Close";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import UpcomingIcon from "@mui/icons-material/Upcoming";

/** Brand colors (same as the rest of the app) */
const FEDERAL_BLUE = "#0b3a75";
const PERSIAN_GREEN = "#00a693";
const SYRACUSE_RED = "#d44500";

/** ──────────────────────────────────────────────────────────────
 *  Named export used by Agenda/Week/Month Day calendar views
 *  Keeps behavior identical to before refactor.
 *  - Saves/overwrites the single paymentPromise field
 *  - Appends a comms log entry
 *  - Throws on validation error
 *  ──────────────────────────────────────────────────────────── */
export async function savePaymentPromise(clientId, promiseDate, amount, notes) {
  if (!clientId) throw new Error("Missing client id");
  if (!promiseDate || !amount) throw new Error("Date and amount required");

  const updatedPromise = {
    date: promiseDate,
    amount: parseFloat(amount),
    notes: notes || "",
  };

  const auth = getAuth();
  const user = auth.currentUser;
  const who = user?.displayName || user?.email || "Anonymous";

  const logMessage = `Client promised to pay $${Number(
    updatedPromise.amount
  ).toLocaleString()} on ${updatedPromise.date}. Notes: ${
    updatedPromise.notes || "None"
  }`;

  const newLog = {
    message: logMessage,
    timestamp: new Date().toISOString(),
    user: who,
  };

  const clientRef = doc(db, "clients", clientId);
  await updateDoc(clientRef, {
    paymentPromise: updatedPromise,
    communicationLogs: arrayUnion(newLog),
  });

  return { updatedPromise, newLog };
}

/** ──────────────────────────────────────────────────────────────
 *  Default UI component (refreshed styling, same logic)
 *  ──────────────────────────────────────────────────────────── */
export default function PaymentPromise({ client, setClient }) {
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [promiseNotes, setPromiseNotes] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const onSave = async () => {
    if (!client?.id) return;
    try {
      const { updatedPromise, newLog } = await savePaymentPromise(
        client.id,
        promiseDate,
        promiseAmount,
        promiseNotes
      );

      setClient((prev) => ({
        ...prev,
        paymentPromise: updatedPromise,
        communicationLogs: [...(prev.communicationLogs || []), newLog],
      }));

      setPromiseDate("");
      setPromiseAmount("");
      setPromiseNotes("");
      setIsEditing(false);
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to save promise");
    }
  };

  const onDelete = async () => {
    if (!client?.id) return;
    if (!window.confirm("Delete this payment promise?")) return;
    const clientRef = doc(db, "clients", client.id);
    await updateDoc(clientRef, { paymentPromise: null });
    setClient((prev) => ({ ...prev, paymentPromise: null }));
  };

  const startEdit = () => {
    if (!client?.paymentPromise) return;
    setPromiseDate(client.paymentPromise.date || "");
    setPromiseAmount(client.paymentPromise.amount || "");
    setPromiseNotes(client.paymentPromise.notes || "");
    setIsEditing(true);
  };

  const isMissed = (() => {
    const d = client?.paymentPromise?.date;
    if (!d) return false;
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    return new Date(d) < todayMidnight;
  })();

  const isUpcoming =
    client?.paymentPromise?.date &&
    new Date(client.paymentPromise.date) >= new Date();

  const currentPromise = client?.paymentPromise;

  return (
    <Box sx={{ mb: 3 }}>
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1.5 }}
      >
        <Typography
          variant="h6"
          sx={{ fontWeight: 700, color: FEDERAL_BLUE, letterSpacing: 0.2 }}
        >
          Payment Promise
        </Typography>

        {currentPromise && (
          <Chip
            size="small"
            label={isMissed ? "Missed" : "Active"}
            color={isMissed ? "error" : "success"}
            variant={isMissed ? "filled" : "outlined"}
          />
        )}
      </Stack>

      {/* Missed promise alert */}
      {currentPromise && isMissed && (
        <Alert
          severity="error"
          icon={<WarningAmberIcon fontSize="small" />}
          sx={{
            mb: 2,
            borderLeft: `4px solid ${SYRACUSE_RED}`,
            boxShadow: "0 3px 10px rgba(0,0,0,0.06)",
          }}
        >
          Missed promise from{" "}
          <strong>{currentPromise.date}</strong> – $
          {Number(currentPromise.amount).toLocaleString()}
        </Alert>
      )}

      {/* Current promise card */}
      {currentPromise && (
        <Card
          variant="outlined"
          sx={{
            mb: 2,
            borderRadius: 2,
            borderLeft: `4px solid ${
              isMissed ? SYRACUSE_RED : PERSIAN_GREEN
            }`,
            backgroundColor: isMissed ? "#fff5f5" : "#f3fcf8",
          }}
        >
          <CardHeader
            title={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle1" fontWeight={700}>
                  Current Promise
                </Typography>
                {!isMissed && (
                  <Chip
                    size="small"
                    label="On file"
                    color="success"
                    variant="outlined"
                  />
                )}
              </Stack>
            }
            sx={{ pb: 0.5 }}
          />
          <CardContent sx={{ pt: 1.5 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1.5} flexWrap="wrap">
                <Stack direction="row" spacing={1} alignItems="center">
                  <EventIcon fontSize="small" color="action" />
                  <Typography variant="body2">
                    <strong>Date:</strong> {currentPromise.date}
                  </Typography>
                </Stack>

                <Stack direction="row" spacing={1} alignItems="center">
                  <AttachMoneyIcon fontSize="small" color="action" />
                  <Typography variant="body2">
                    <strong>Amount:</strong> $
                    {Number(currentPromise.amount).toLocaleString()}
                  </Typography>
                </Stack>
              </Stack>

              <Stack direction="row" spacing={1.2} alignItems="flex-start">
                <NoteAltIcon fontSize="small" color="action" />
                <Typography variant="body2">
                  <strong>Notes:</strong>{" "}
                  {currentPromise.notes || "None"}
                </Typography>
              </Stack>

              <Divider sx={{ my: 1 }} />

              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Tooltip title="Edit this promise">
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EditIcon fontSize="small" />}
                    onClick={startEdit}
                    sx={{ textTransform: "none", fontWeight: 600 }}
                  >
                    Edit
                  </Button>
                </Tooltip>
                <Tooltip title="Delete this promise">
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon fontSize="small" />}
                    onClick={onDelete}
                    sx={{ textTransform: "none", fontWeight: 600 }}
                  >
                    Delete
                  </Button>
                </Tooltip>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Form card */}
      <Card
        variant="outlined"
        sx={{
          borderRadius: 2,
          backgroundColor: "#ffffff",
          boxShadow: "0 4px 18px rgba(15,22,33,0.04)",
        }}
      >
        <CardHeader
          title={
            <Typography variant="subtitle1" fontWeight={700}>
              {isEditing ? "Edit Payment Promise" : "Create Payment Promise"}
            </Typography>
          }
          subheader={
            <Typography variant="body2" color="text.secondary">
              Track when a client has promised to pay and how much.
            </Typography>
          }
          sx={{ pb: 0 }}
        />
        <CardContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
            >
              <TextField
                label="Promise Date"
                type="date"
                value={promiseDate}
                onChange={(e) => setPromiseDate(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                size="small"
              />
              <TextField
                label="Amount"
                type="number"
                value={promiseAmount}
                onChange={(e) => setPromiseAmount(e.target.value)}
                fullWidth
                size="small"
              />
            </Stack>

            <TextField
              label="Notes"
              multiline
              minRows={3}
              value={promiseNotes}
              onChange={(e) => setPromiseNotes(e.target.value)}
              fullWidth
              size="small"
            />

            <Stack
              direction="row"
              spacing={1}
              justifyContent="flex-end"
              sx={{ pt: 1 }}
            >
              {isEditing && (
                <Button
                  variant="text"
                  startIcon={<CancelIcon fontSize="small" />}
                  onClick={() => {
                    setIsEditing(false);
                    setPromiseDate("");
                    setPromiseAmount("");
                    setPromiseNotes("");
                  }}
                  sx={{ textTransform: "none" }}
                >
                  Cancel
                </Button>
              )}
              <Button
                variant="contained"
                startIcon={<SaveIcon fontSize="small" />}
                onClick={onSave}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  bgcolor: PERSIAN_GREEN,
                  "&:hover": { bgcolor: "#00877c" },
                }}
              >
                {isEditing ? "Save Changes" : "Save Promise"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Upcoming banner */}
      {currentPromise && !isEditing && isUpcoming && !isMissed && (
        <Alert
          icon={<UpcomingIcon fontSize="small" />}
          severity="info"
          sx={{
            mt: 2,
            borderLeft: `4px solid ${FEDERAL_BLUE}`,
            backgroundColor: "#f4f7ff",
          }}
        >
          <Typography variant="body2">
            <strong>
              {new Date(currentPromise.date).toLocaleDateString()}
            </strong>{" "}
            – ${Number(currentPromise.amount).toLocaleString()} – still
            pending.
          </Typography>
        </Alert>
      )}
    </Box>
  );
}