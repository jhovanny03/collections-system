import React, { useMemo, useState } from "react";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import db from "../firebase";

import {
  Card,
  CardHeader,
  CardContent,
  Box,
  Stack,
  Button,
  Typography,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Tooltip,
  Snackbar,
  Alert,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";

const ADJUSTMENT_TYPES = [
  { value: "DERIVATIVE_ADD_ON", label: "Derivative add-on" },
  { value: "REMOVAL_DEFENSE", label: "Removal Defense" },
  { value: "OTHER", label: "Other" },
];

// all adjustments created here affect installments/balance;
// downPayment is netted out (amount - downPayment) for the effective increase.
const DEFAULT_APPLY_TO = "balance";

const money = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const safeId = () =>
  (window.crypto?.randomUUID?.() ||
    `adj_${Date.now()}_${Math.floor(Math.random() * 1e6)}`);

export default function InvoiceAdjustments({ client, setClient }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(ADJUSTMENT_TYPES[0].value);
  const [amount, setAmount] = useState("");
  const [downPayment, setDownPayment] = useState("");
  const [note, setNote] = useState("");
  const [toast, setToast] = useState({ open: false, type: "success", msg: "" });
  const [deletingId, setDeletingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const userLabel = (() => {
    const user = getAuth().currentUser;
    return user?.displayName || user?.email || "System";
  })();

  const ref = client?.id ? doc(db, "clients", client.id) : null;

  const adjustments = useMemo(() => {
    const arr = Array.isArray(client?.invoiceAdjustments)
      ? client.invoiceAdjustments
      : [];
    return arr.slice().sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  }, [client]);

  if (!client?.id) return null;

  const resetForm = () => {
    setType(ADJUSTMENT_TYPES[0].value);
    setAmount("");
    setDownPayment("");
    setNote("");
  };

  const handleOpen = () => {
    resetForm();
    setOpen(true);
  };
  const handleClose = () => {
    if (saving) return;
    setOpen(false);
  };

  const parseMoney = (v) => {
    const n = parseFloat(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : NaN;
  };

  const handleCreate = async () => {
    const amt = parseMoney(amount);
    const dp = parseMoney(downPayment || 0);

    if (!Number.isFinite(amt) || amt <= 0) {
      setToast({ open: true, type: "error", msg: "Enter a valid positive adjustment amount." });
      return;
    }
    if (!Number.isFinite(dp) || dp < 0) {
      setToast({ open: true, type: "error", msg: "Down payment must be zero or more." });
      return;
    }
    if (dp > amt) {
      setToast({ open: true, type: "error", msg: "Down payment cannot exceed the adjustment amount." });
      return;
    }

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();

      // We DO NOT touch invoiceTotal (base) here.
      // We log the adjustment; BillingOverview will net it as (amount - downPayment).
      const newAdj = {
        id: safeId(),
        type,
        applyTo: DEFAULT_APPLY_TO, // "balance"
        amount: amt,
        downPayment: dp,          // informational + used to net from amount
        note: note?.trim() || "",
        createdAt: nowIso,
        createdBy: userLabel,
      };

      await updateDoc(ref, {
        invoiceAdjustments: arrayUnion(newAdj),
        invoiceUpdatedBy: userLabel,
        invoiceUpdatedAt: nowIso,
      });

      setClient((prev) => ({
        ...prev,
        invoiceAdjustments: [...(prev.invoiceAdjustments || []), newAdj],
        invoiceUpdatedBy: userLabel,
        invoiceUpdatedAt: nowIso,
      }));

      setOpen(false);
      setToast({ open: true, type: "success", msg: "Adjustment added." });
    } catch (e) {
      console.error(e);
      setToast({ open: true, type: "error", msg: "Failed to add adjustment." });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (adj) => {
    if (!adj?.id) return;
    if (!window.confirm("Delete this adjustment entry?")) return;

    setDeletingId(adj.id);
    try {
      const remaining = (client.invoiceAdjustments || []).filter((a) => a.id !== adj.id);
      await updateDoc(ref, {
        invoiceAdjustments: remaining,
      });
      setClient((prev) => ({
        ...prev,
        invoiceAdjustments: remaining,
      }));
      setToast({ open: true, type: "success", msg: "Adjustment deleted." });
    } catch (e) {
      console.error(e);
      setToast({ open: true, type: "error", msg: "Failed to delete adjustment." });
    } finally {
      setDeletingId(null);
    }
  };

  const netAdjToBalance = adjustments.reduce((sum, a) => {
    const applyTo = (a?.applyTo || "balance").toLowerCase();
    const amt = Number(a?.amount || 0);
    const dp = Number(a?.downPayment || 0);
    return applyTo === "balance" ? sum + (amt - dp) : sum;
  }, 0);

  return (
    <Card sx={{ borderRadius: 3, mb: 3 }}>
      <CardHeader
        avatar={<ReceiptLongIcon color="primary" />}
        title="Invoice Adjustments"
        subheader="Add or remove invoice-level adjustments. Down payments here reduce the net amount added to installments (amount − down payment)."
        sx={{ "& .MuiCardHeader-title": { fontWeight: 700 } }}
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpen}
            sx={{ textTransform: "none" }}
          >
            Add Adjustment
          </Button>
        }
      />

      <CardContent>
        {/* Summary row */}
        <Box
          sx={{
            p: 1.25,
            mb: 2,
            borderRadius: 2,
            border: "1px dashed",
            borderColor: "divider",
            display: "flex",
            gap: 2,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Chip
            label={`Base: ${money(Number(client?.invoiceTotal || 0))}`}
            variant="outlined"
            color="default"
            size="small"
          />
          <Chip
            label={`Adj. to Balance (net): ${money(netAdjToBalance)}`}
            variant="outlined"
            color={netAdjToBalance >= 0 ? "warning" : "success"}
            size="small"
          />
          <Chip
            label={`Effective: ${money(Number(client?.invoiceTotal || 0) + netAdjToBalance)}`}
            variant="outlined"
            color="primary"
            size="small"
          />
        </Box>

        {/* Log list */}
        {adjustments.length === 0 ? (
          <Typography color="text.secondary">No adjustments yet.</Typography>
        ) : (
          <Stack spacing={1.5}>
            {adjustments.map((adj) => {
              const net = Number(adj.amount || 0) - Number(adj.downPayment || 0);
              return (
                <Box
                  key={adj.id}
                  sx={{
                    p: 1.25,
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto auto auto",
                    gap: 1,
                    alignItems: "center",
                  }}
                >
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip
                        label={
                          ADJUSTMENT_TYPES.find((t) => t.value === adj.type)?.label ||
                          adj.type ||
                          "Adjustment"
                        }
                        size="small"
                        variant="outlined"
                        color="info"
                      />
                      <Chip
                        label={(adj.applyTo || "balance").toUpperCase()}
                        size="small"
                        variant="outlined"
                      />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {adj.createdAt ? new Date(adj.createdAt).toLocaleString() : "—"} • {adj.createdBy || "—"}
                    </Typography>
                    {adj.note && (
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {adj.note}
                      </Typography>
                    )}
                  </Box>

                  <Box sx={{ textAlign: "right" }}>
                    <Typography variant="caption" color="text.secondary">
                      Amount
                    </Typography>
                    <Typography fontWeight={600}>{money(adj.amount)}</Typography>
                  </Box>

                  <Box sx={{ textAlign: "right" }}>
                    <Typography variant="caption" color="text.secondary">
                      Down Payment
                    </Typography>
                    <Typography fontWeight={600}>{money(adj.downPayment || 0)}</Typography>
                  </Box>

                  <Box sx={{ textAlign: "right" }}>
                    <Typography variant="caption" color="text.secondary">
                      Net to Balance
                    </Typography>
                    <Chip
                      label={money(net)}
                      size="small"
                      color={net >= 0 ? "warning" : "success"}
                      variant="outlined"
                    />
                  </Box>

                  <Box sx={{ textAlign: "right" }}>
                    <Tooltip title="Delete adjustment">
                      <span>
                        <IconButton
                          color="error"
                          onClick={() => handleDelete(adj)}
                          disabled={deletingId === adj.id}
                          size="small"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </Box>
              );
            })}
          </Stack>
        )}
      </CardContent>

      {/* Modal form */}
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Add Invoice Adjustment</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              select
              label="Reason"
              value={type}
              onChange={(e) => setType(e.target.value)}
              fullWidth
            >
              {ADJUSTMENT_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              type="number"
              label="Adjustment Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              helperText="Total adjustment to the invoice."
              fullWidth
              inputProps={{ step: "0.01", min: "0" }}
            />

            <TextField
              type="number"
              label="Down Payment (optional)"
              value={downPayment}
              onChange={(e) => setDownPayment(e.target.value)}
              helperText="This reduces the net added to installments. Net = amount − down payment."
              fullWidth
              inputProps={{ step: "0.01", min: "0" }}
            />

            <TextField
              label="Internal note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />

            <Alert severity="info" variant="outlined">
              <Typography variant="body2">
                • <b>Base</b> invoice stays unchanged. <br />
                • <b>Effective</b> balance = base + Σ(amount − downPayment) for adjustments. <br />
                • This does **not** record a payment; it only changes the expected installments via the net amount.
              </Typography>
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving}>
            {saving ? "Saving…" : "Save Adjustment"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={2800}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          severity={toast.type}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {toast.msg}
        </Alert>
      </Snackbar>
    </Card>
  );
}