// InvoiceSection.js
import React, { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import db from "./firebase";
import {
  Button,
  TextField,
  Typography,
  Box,
  Snackbar,
  Alert,
  Slide,
  Card,
  CardContent,
} from "@mui/material";
import { motion } from "framer-motion";

export default function InvoiceSection({ client, setClient }) {
  const [invoiceInput, setInvoiceInput] = useState("");
  const [initialPaymentInput, setInitialPaymentInput] = useState("");
  const [initialPaymentDate, setInitialPaymentDate] = useState("");
  const [firstInstallmentDate, setFirstInstallmentDate] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ---- Date helpers ----
  const parseLocalYMD = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const parseDateFlexible = (value) => {
    if (!value) return null;
    if (typeof value === "object" && value.seconds) {
      return new Date(value.seconds * 1000);
    }
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return parseLocalYMD(value);
    }
    return new Date(value);
  };

  const formatDate = (value) => {
    const date = parseDateFlexible(value);
    if (!date || isNaN(date)) return "N/A";
    return date.toLocaleDateString("default", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatMoney = (amount) =>
    `$${Number(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
    })}`;

  const handleSaveInvoiceAndInitialPayment = async () => {
    const invoice = parseFloat(invoiceInput);
    const initial = parseFloat(initialPaymentInput);

    if (
      !invoiceInput ||
      !initialPaymentInput ||
      !initialPaymentDate ||
      !firstInstallmentDate ||
      isNaN(invoice) ||
      isNaN(initial) ||
      invoice <= 0 ||
      initial <= 0
    ) {
      setError(
        "Please fill in all fields and ensure values are greater than zero."
      );
      return;
    }

    const auth = getAuth();
    const user = auth.currentUser;
    const username = user?.displayName || user?.email || "Anonymous";
    const whenIso = new Date().toISOString();

    const clientRef = doc(db, "clients", client.id);

    // Build/replace the initial payment record
    const prevPayments = Array.isArray(client.payments) ? [...client.payments] : [];

    // Prefer to find a payment explicitly marked as initial
    let idx = prevPayments.findIndex((p) => p?.kind === "initial");

    // Fallback: find a payment with the client's current initialPaymentDate (old records)
    if (idx === -1 && client.initialPaymentDate) {
      idx = prevPayments.findIndex((p) => p?.date === client.initialPaymentDate);
    }

    const updatedInitialPayment = {
      amount: initial,
      date: initialPaymentDate,   // YYYY-MM-DD
      recordedAt: whenIso,
      kind: "initial",            // <-- marker so we can reliably find it later
    };

    let nextPayments;
    if (idx >= 0) {
      // Replace existing initial payment
      nextPayments = [...prevPayments];
      nextPayments[idx] = { ...prevPayments[idx], ...updatedInitialPayment };
    } else {
      // Add a new initial payment
      nextPayments = [...prevPayments, updatedInitialPayment];
    }

    try {
      await updateDoc(clientRef, {
        invoiceTotal: invoice,
        initialPaymentAmount: initial,
        initialPaymentDate,
        firstInstallmentDate,
        payments: nextPayments,            // <-- replace entire array (edit-safe)
        invoiceUpdatedBy: username,
        invoiceUpdatedAt: whenIso,
      });

      setClient((prev) => ({
        ...prev,
        invoiceTotal: invoice,
        initialPaymentAmount: initial,
        initialPaymentDate,
        firstInstallmentDate,
        invoiceUpdatedBy: username,
        invoiceUpdatedAt: whenIso,
        payments: nextPayments,
      }));

      setInvoiceInput("");
      setInitialPaymentInput("");
      setInitialPaymentDate("");
      setFirstInstallmentDate("");
      setDrawerOpen(false);
      setError("");
      setSuccess(true);
    } catch (e) {
      console.error(e);
      setError("Failed to save. Please try again.");
    }
  };

  const handleDeleteInvoice = async () => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this invoice and initial payment info?"
    );
    if (!confirmDelete) return;

    const clientRef = doc(db, "clients", client.id);

    // Also remove the initial payment from payments
    const prevPayments = Array.isArray(client.payments) ? client.payments : [];
    const filtered = prevPayments.filter(
      (p) =>
        // remove explicit 'initial'
        p?.kind !== "initial" &&
        // and also remove any payment that matches the stored initialPaymentDate (legacy)
        p?.date !== client.initialPaymentDate
    );

    try {
      await updateDoc(clientRef, {
        invoiceTotal: null,
        initialPaymentAmount: null,
        initialPaymentDate: null,
        firstInstallmentDate: null,
        invoiceUpdatedBy: null,
        invoiceUpdatedAt: null,
        payments: filtered, // <-- keep the rest; initial payment removed
      });

      setClient((prev) => ({
        ...prev,
        invoiceTotal: null,
        initialPaymentAmount: null,
        initialPaymentDate: null,
        firstInstallmentDate: null,
        invoiceUpdatedBy: null,
        invoiceUpdatedAt: null,
        payments: filtered,
      }));

      setDrawerOpen(false);
      setSuccess(true);
    } catch (e) {
      console.error(e);
      setError("Failed to delete invoice. Please try again.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ marginBottom: "2rem" }}
    >
      <Card elevation={3} sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            📋 Setup Invoice and Initial Payment
          </Typography>

          {!client.invoiceTotal ? (
            <Typography color="text.secondary" mb={2}>
              No invoice information saved.
            </Typography>
          ) : (
            <Box
              sx={{
                backgroundColor: "#f8f9fa",
                p: 2,
                borderRadius: 2,
                mb: 2,
              }}
            >
              <Typography>
                <strong>Invoice Total:</strong> {formatMoney(client.invoiceTotal)}
              </Typography>
              <Typography>
                <strong>Initial Payment Amount:</strong>{" "}
                {formatMoney(client.initialPaymentAmount)}
              </Typography>
              <Typography>
                <strong>Initial Payment Date:</strong>{" "}
                {formatDate(client.initialPaymentDate)}
              </Typography>
              <Typography>
                <strong>Installments Start On:</strong>{" "}
                {formatDate(client.firstInstallmentDate)}
              </Typography>
              <Typography>
                <strong>Last Edited By:</strong>{" "}
                {client.invoiceUpdatedBy || "Unknown"}
              </Typography>
              <Typography>
                <strong>Last Updated At:</strong>{" "}
                {formatDate(client.invoiceUpdatedAt)}
              </Typography>
            </Box>
          )}

          <Box display="flex" gap={2}>
            <Button
              variant="contained"
              color="primary"
              onClick={() => setDrawerOpen(true)}
            >
              ✏️ {client.invoiceTotal ? "Edit Invoice" : "Add Invoice"}
            </Button>
            {client.invoiceTotal && (
              <Button
                variant="outlined"
                color="error"
                onClick={handleDeleteInvoice}
              >
                🗑️ Delete Invoice
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Modal */}
      {drawerOpen && (
        <Box
          position="fixed"
          top={0}
          left={0}
          width="100%"
          height="100%"
          display="flex"
          justifyContent="center"
          alignItems="center"
          bgcolor="rgba(0, 0, 0, 0.5)"
          zIndex={1300}
          onClick={() => setDrawerOpen(false)}
        >
          <Box
            onClick={(e) => e.stopPropagation()}
            bgcolor="white"
            borderRadius={2}
            p={4}
            width="100%"
            maxWidth="420px"
            boxShadow={6}
          >
            <Typography variant="h6" mb={2}>
              📝 {client.invoiceTotal ? "Edit Invoice" : "New Invoice"}
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <TextField
              fullWidth
              type="number"
              label="Invoice Total"
              value={invoiceInput}
              onChange={(e) => setInvoiceInput(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              type="number"
              label="Initial Payment"
              value={initialPaymentInput}
              onChange={(e) => setInitialPaymentInput(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              type="date"
              label="Initial Payment Date"
              value={initialPaymentDate}
              onChange={(e) => setInitialPaymentDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              type="date"
              label="First Installment Date"
              value={firstInstallmentDate}
              onChange={(e) => setFirstInstallmentDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2 }}
            />

            <Box display="flex" gap={1} mt={1}>
              <Button
                variant="outlined"
                color="inherit"
                onClick={() => setDrawerOpen(false)}
                fullWidth
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                color="success"
                fullWidth
                onClick={handleSaveInvoiceAndInitialPayment}
              >
                Save
              </Button>
            </Box>
          </Box>
        </Box>
      )}

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
          ✅ Changes saved successfully!
        </Alert>
      </Snackbar>
    </motion.div>
  );
}