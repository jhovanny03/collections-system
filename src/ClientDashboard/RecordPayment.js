// src/ClientDashboard/RecordPayment.js
import React, { useMemo, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import db from "../firebase";

// MUI
import {
  Card,
  CardHeader,
  CardContent,
  TextField,
  InputAdornment,
  Button,
  Stack,
  Box,
  Snackbar,
  Alert,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Tooltip,
} from "@mui/material";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import DeleteIcon from "@mui/icons-material/Delete";
import TodayIcon from "@mui/icons-material/Today";
import SaveIcon from "@mui/icons-material/Save";

export default function RecordPayment({ client, setClient }) {
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState({ open: false, type: "success", msg: "" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState(null);

  // Keep your history order as-is in Firestore; we only sort for display.
  const payments = client?.payments || [];
  const paymentsForTable = useMemo(() => {
    return [...payments].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [payments]);

  const money = (n) =>
    `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  const handleRecordPayment = async () => {
    if (!paymentAmount || !paymentDate) {
      setToast({ open: true, type: "error", msg: "Enter amount and date." });
      return;
    }

    const newPayment = {
      amount: parseFloat(paymentAmount),
      date: paymentDate,
      recordedAt: new Date().toISOString(),
    };

    if (Number.isNaN(newPayment.amount) || newPayment.amount <= 0) {
      setToast({ open: true, type: "error", msg: "Amount must be greater than 0." });
      return;
    }

    setSaving(true);
    try {
      const updatedPayments = [...payments, newPayment];

      const updates = { payments: updatedPayments };

      // ✅ Keep your existing promise-clearing logic
      if (client.paymentPromise) {
        const promisedDate = new Date(client.paymentPromise.date);
        const actualDate = new Date(paymentDate);
        const promisedAmount = parseFloat(client.paymentPromise.amount);
        if (actualDate <= promisedDate && newPayment.amount >= promisedAmount) {
          updates.paymentPromise = null;
        }
      }

      const clientRef = doc(db, "clients", client.id);
      await updateDoc(clientRef, updates);

      setClient((prev) => ({
        ...prev,
        payments: updatedPayments,
        ...(updates.paymentPromise === null ? { paymentPromise: null } : {}),
      }));

      setPaymentAmount("");
      setPaymentDate("");
      setToast({ open: true, type: "success", msg: "Payment recorded." });
    } catch (e) {
      console.error(e);
      setToast({ open: true, type: "error", msg: "Failed to record payment." });
    } finally {
      setSaving(false);
    }
  };

  const askDelete = (indexInOriginalArray) => {
    setDeleteIndex(indexInOriginalArray);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (deleteIndex == null) return;
    try {
      const updated = payments.filter((_, i) => i !== deleteIndex);
      const clientRef = doc(db, "clients", client.id);
      await updateDoc(clientRef, { payments: updated });
      setClient((prev) => ({ ...prev, payments: updated }));
      setToast({ open: true, type: "success", msg: "Payment deleted." });
    } catch (e) {
      console.error(e);
      setToast({ open: true, type: "error", msg: "Failed to delete payment." });
    } finally {
      setConfirmOpen(false);
      setDeleteIndex(null);
    }
  };

  const cancelDelete = () => {
    setConfirmOpen(false);
    setDeleteIndex(null);
  };

  return (
    <Card sx={{ borderRadius: 3, mb: 3 }}>
      <CardHeader
        avatar={<CreditCardIcon color="primary" />}
        title="Record Payment"
        subheader="Add a payment and keep the promise status up to date"
        sx={{ "& .MuiCardHeader-title": { fontWeight: 700 } }}
      />
      <CardContent>
        {/* Form */}
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", md: "center" }}
        >
          <TextField
            label="Payment Date"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 200 }}
            size="small"
          />
          <Button
            startIcon={<TodayIcon />}
            onClick={() => setPaymentDate(new Date().toISOString().slice(0, 10))}
            variant="outlined"
            size="small"
          >
            Today
          </Button>

          <TextField
            label="Amount"
            type="number"
            size="small"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            sx={{ minWidth: 200 }}
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
              inputProps: { step: "0.01", min: "0" },
            }}
          />

          <Box flexGrow={1} />

          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleRecordPayment}
            disabled={saving}
          >
            {saving ? "Saving…" : "Record Payment"}
          </Button>
        </Stack>

        <Divider sx={{ my: 2 }} />

        {/* History */}
        {(payments?.length || 0) > 0 ? (
          <TableContainer component={Paper} sx={{ borderRadius: 2, maxHeight: 380 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Amount</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paymentsForTable.map((p, idx) => {
                  // We sorted for display, but we need the original index to delete correctly.
                  const originalIndex = payments.findIndex(
                    (orig) => orig.date === p.date && orig.amount === p.amount && orig.recordedAt === p.recordedAt
                  );

                  return (
                    <TableRow key={`${p.recordedAt}-${idx}`} hover>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip size="small" label={new Date(p.date).toLocaleDateString()} />
                        </Stack>
                      </TableCell>
                      <TableCell>{money(p.amount)}</TableCell>
                      <TableCell align="center">
                        <Tooltip title="Delete payment">
                          <IconButton
                            color="error"
                            size="small"
                            onClick={() => askDelete(originalIndex)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box sx={{ py: 3, color: "text.secondary", textAlign: "center" }}>
            No payments recorded yet.
          </Box>
        )}
      </CardContent>

      {/* Confirm delete dialog */}
      <Dialog open={confirmOpen} onClose={cancelDelete} maxWidth="xs" fullWidth>
        <DialogTitle>Delete payment?</DialogTitle>
        <DialogContent dividers>
          This action cannot be undone. The payment will be removed from the client record.
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelDelete}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete} startIcon={<DeleteIcon />}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toasts */}
      <Snackbar
        open={toast.open}
        autoHideDuration={2500}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          severity={toast.type}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {toast.msg}
        </Alert>
      </Snackbar>
    </Card>
  );
}