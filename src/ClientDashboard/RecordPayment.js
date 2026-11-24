// src/ClientDashboard/RecordPayment.js
import React, { useMemo, useState } from "react";
import {
  doc,
  updateDoc,
  collection,
  addDoc,
  deleteDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import db from "../firebase";
import { asDate, formatDate, todayYMD } from "../utils/dates";
import { isMultiPlan, sortedPlans, planViews } from "../billing/plans";
import { FEATURES } from "../config/features";

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
  Typography,
  MenuItem,
} from "@mui/material";

import CreditCardIcon from "@mui/icons-material/CreditCard";
import DeleteIcon from "@mui/icons-material/Delete";
import TodayIcon from "@mui/icons-material/Today";
import SaveIcon from "@mui/icons-material/Save";
import { getActor } from "../auth/actor";

// ===== Helpers =====
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);

const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

const labelFor = (d) =>
  `${d.toLocaleString("default", { month: "long" })} ${d.getFullYear()}`;

const toDate = (raw) =>
  raw?.seconds ? asDate(raw.seconds * 1000) : asDate(raw);

const getInstallmentAmountForDate = (date, schedule, fallbackAmount) => {
  for (const s of schedule) {
    const sStart = asDate(s.start);
    const sEnd = asDate(s.end);
    if (date >= sStart && date <= sEnd) return Number(s.amount);
  }
  return Number(fallbackAmount || 500);
};

const buildSkipSet = (client) =>
  new Set([...(client.skipMonths || []), ...(client.skippedMonths || [])].map(String));

// Build due-month buckets up to collectible cap
const buildDueMonthBuckets = (client) => {
  const rawStart = client?.firstInstallmentDate;
  if (!rawStart) return [];

  const invoiceBase = Number(
    client?.invoiceBaseTotal != null ? client.invoiceBaseTotal : client?.invoiceTotal || 0
  );

  const adjustments = Array.isArray(client?.invoiceAdjustments)
    ? client.invoiceAdjustments
    : [];

  const adjToBalanceTotal = adjustments.reduce((sum, a) => {
    const applyTo = String(a?.applyTo || "balance").toLowerCase();
    if (applyTo !== "balance") return sum;
    const amt = Number(a?.amount || 0);
    const dp = Number(a?.downPayment || 0);
    return sum + Math.max(0, amt - Math.max(0, dp));
  }, 0);

  const invoiceEffective = Math.max(0, invoiceBase + adjToBalanceTotal);
  const initialPayment = Number(client?.initialPaymentAmount || 0);
  const collectibleCap = Math.max(0, invoiceEffective - initialPayment);
  if (collectibleCap <= 0) return [];

  const anchorRaw = client?.expectedAnchor || rawStart;
  const anchorDate = toDate(anchorRaw);
  if (!(anchorDate instanceof Date) || isNaN(anchorDate)) return [];

  const firstDueDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 15);

  const schedule = (client?.installmentSchedule || [])
    .slice()
    .sort((a, b) => asDate(a.start) - asDate(b.start));

  const skipSet = buildSkipSet(client);

  const buckets = [];
  let cursor = asDate(firstDueDate);
  let expectedAccum = 0;
  let guard = 0;

  while (expectedAccum < collectibleCap && guard < 120) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const key = ymKey(monthStart);

    if (!skipSet.has(key)) {
      const expected = getInstallmentAmountForDate(
        new Date(cursor.getFullYear(), cursor.getMonth(), 15),
        schedule,
        client?.installmentAmount
      );

      if (expectedAccum + expected > collectibleCap) break;

      buckets.push({
        dueMonthKey: key,
        dueMonthLabel: labelFor(monthStart),
        expectedInstallmentAmount: Number(expected || 0),
        remaining: Number(expected || 0),
      });

      expectedAccum += Number(expected || 0);
    }

    cursor.setMonth(cursor.getMonth() + 1);
    guard++;
  }

  return buckets;
};

// Apply prior payments only in memory so we know which month balances remain open
const applyPriorPaymentsToBuckets = (client, buckets) => {
  const initialPaymentDate = client?.initialPaymentDate
    ? asDate(client.initialPaymentDate)
    : null;

  const priorPayments = (client?.payments || [])
    .filter((p) => {
      const d = asDate(p.date);
      if (isNaN(d)) return false;
      if (!initialPaymentDate) return true;
      return d > initialPaymentDate;
    })
    .map((p) => ({
      amount: Number(p.amount || 0),
      date: p.date,
    }))
    .filter((p) => p.amount > 0)
    .sort((a, b) => asDate(a.date) - asDate(b.date));

  for (const p of priorPayments) {
    let remaining = p.amount;

    for (const bucket of buckets) {
      if (remaining <= 0) break;
      if (bucket.remaining <= 0) continue;

      const used = Math.min(bucket.remaining, remaining);
      bucket.remaining -= used;
      remaining -= used;
    }
  }

  return buckets;
};

// Create allocation rows ONLY for the new payment
const buildAllocationRowsForNewPayment = ({
  client,
  paymentId,
  paymentDate,
  amountNum,
  recordedBy,
}) => {
  const buckets = buildDueMonthBuckets(client);
  if (!buckets.length) return [];

  applyPriorPaymentsToBuckets(client, buckets);

  let remainingNewPayment = Number(amountNum || 0);
  const allocationRows = [];

  for (const bucket of buckets) {
    if (remainingNewPayment <= 0) break;
    if (bucket.remaining <= 0) continue;

    const applied = Math.min(bucket.remaining, remainingNewPayment);
    const remainingForMonth = Math.max(0, bucket.remaining - applied);

    allocationRows.push({
      clientId: client?.id || "",
      clientName:
        `${client?.firstName || ""} ${client?.lastName || ""}`.trim() ||
        client?.name ||
        "Unknown Client",
      caseTitle: client?.caseTitle || "",

      paymentId,
      paymentDate,
      paymentDateTs: asDate(`${paymentDate}T00:00:00`),

      dueMonthKey: bucket.dueMonthKey,
      dueMonthLabel: bucket.dueMonthLabel,

      appliedAmount: applied,
      expectedInstallmentAmount: bucket.expectedInstallmentAmount,
      remainingForMonth,

      allocationStatus: remainingForMonth <= 0 ? "paid" : "partial",

      recordedBy,
      caseType: client?.caseType || "",
      caseStatus: client?.caseStatus || "",
      source: "manual",
      createdAt: new Date().toISOString(),
    });

    bucket.remaining = remainingForMonth;
    remainingNewPayment -= applied;
  }

  return allocationRows;
};

export default function RecordPayment({ client, setClient }) {
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [saving, setSaving] = useState(false);
  // Cases with several installment plans: which plan this payment is for.
  const multiPlan = isMultiPlan(client);
  const plans = sortedPlans(client);
  const [planInvoiceId, setPlanInvoiceId] = useState("");
  const selectedPlanId = multiPlan ? planInvoiceId || String(plans[0].invoiceId) : null;

  const [toast, setToast] = useState({ open: false, type: "success", msg: "" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState(null);

  const payments = useMemo(() => client?.payments || [], [client?.payments]);
  const paymentsForTable = useMemo(() => {
    return [...payments].sort((a, b) => asDate(b.date) - asDate(a.date));
  }, [payments]);

  const money = (n) =>
    `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  const handleRecordPayment = async () => {
    if (!paymentAmount || !paymentDate) {
      setToast({ open: true, type: "error", msg: "Enter amount and date." });
      return;
    }

    const amountNum = parseFloat(paymentAmount);
    if (Number.isNaN(amountNum) || amountNum <= 0) {
      setToast({
        open: true,
        type: "error",
        msg: "Amount must be greater than 0.",
      });
      return;
    }

    const recordedBy =
      getActor().name;

    setSaving(true);
    try {
      // 1) Write to payments ledger FIRST
      const ledgerPayment = {
        clientId: client?.id || "",
        clientName:
          `${client?.firstName || ""} ${client?.lastName || ""}`.trim() ||
          client?.name ||
          "Unknown Client",
        caseTitle: client?.caseTitle || "",
        caseType: client?.caseType || "",
        caseStatus: client?.caseStatus || "",

        amount: amountNum,
        paymentDate,
        paymentDateTs: asDate(`${paymentDate}T00:00:00`),

        recordedAt: new Date().toISOString(),
        recordedBy,
        source: "manual",
        ...(selectedPlanId ? { invoiceId: selectedPlanId } : {}),
      };

      const ledgerRef = await addDoc(collection(db, "payments"), ledgerPayment);
      const paymentId = ledgerRef.id;

      // 2) Keep your client.payments[] behavior exactly the same
      const newPayment = {
        paymentId,
        amount: amountNum,
        date: paymentDate,
        recordedAt: ledgerPayment.recordedAt,
        recordedBy,
        ...(selectedPlanId ? { invoiceId: selectedPlanId } : {}),
      };

      const updatedPayments = [...payments, newPayment];
      const updates = { payments: updatedPayments };

      // Clear payment promise if conditions met
      if (client.paymentPromise) {
        const promisedDate = asDate(client.paymentPromise.date);
        const actualDate = asDate(paymentDate);
        const promisedAmount = parseFloat(client.paymentPromise.amount);

        if (actualDate <= promisedDate && newPayment.amount >= promisedAmount) {
          updates.paymentPromise = null;
        }
      }

      const clientRef = doc(db, "clients", client.id);
      await updateDoc(clientRef, updates);

      // 3) Create allocation rows ONLY for this new payment
      try {
        // Allocate against the chosen plan's own months and payments.
        const target = selectedPlanId
          ? planViews(client).find((v) => v.planInvoiceId === selectedPlanId) || client
          : client;
        const allocationRows = buildAllocationRowsForNewPayment({
          client: target,
          paymentId,
          paymentDate,
          amountNum,
          recordedBy,
        }).map((row) => (selectedPlanId ? { ...row, planInvoiceId: selectedPlanId } : row));

        if (allocationRows.length) {
          await Promise.all(
            allocationRows.map((row) =>
              addDoc(collection(db, "paymentAllocations"), row)
            )
          );
        }
      } catch (allocationError) {
        console.error("Allocation creation failed:", allocationError);
      }

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
      const paymentToDelete = payments[deleteIndex];

      // 1) Remove from client record
      const updated = payments.filter((_, i) => i !== deleteIndex);
      const clientRef = doc(db, "clients", client.id);
      await updateDoc(clientRef, { payments: updated });
      setClient((prev) => ({ ...prev, payments: updated }));

      // 2) Delete raw payment doc
      if (paymentToDelete?.paymentId) {
        await deleteDoc(doc(db, "payments", paymentToDelete.paymentId));

        // 3) Delete all matching allocation docs
        const allocQ = query(
          collection(db, "paymentAllocations"),
          where("paymentId", "==", paymentToDelete.paymentId)
        );
        const allocSnap = await getDocs(allocQ);

        if (!allocSnap.empty) {
          await Promise.all(allocSnap.docs.map((d) => deleteDoc(d.ref)));
        }
      }

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
        title={FEATURES.manualPayments ? "Record Payment" : "Payments"}
        subheader={FEATURES.manualPayments
          ? "Add a payment and keep the promise status up to date"
          : "Synced from MyCase every hour"}
        sx={{ "& .MuiCardHeader-title": { fontWeight: 700 } }}
      />

      <CardContent>
        {!FEATURES.manualPayments && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Payments come from MyCase automatically. To record or correct a payment, do it in MyCase;
            refunds and bounced payments there are applied here too.
          </Alert>
        )}
        {/* Form */}
        {FEATURES.manualPayments && (<>
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
            onClick={() => setPaymentDate(todayYMD())}
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
              startAdornment: (
                <InputAdornment position="start">$</InputAdornment>
              ),
              inputProps: { step: "0.01", min: "0" },
            }}
          />

          {multiPlan && (
            <TextField
              select
              label="Plan"
              size="small"
              value={selectedPlanId}
              onChange={(e) => setPlanInvoiceId(e.target.value)}
              sx={{ minWidth: 220 }}
            >
              {plans.map((p, i) => (
                <MenuItem key={p.invoiceId} value={String(p.invoiceId)}>
                  Plan {i + 1} · invoice {p.invoiceNumber || p.invoiceId} · ${Number(p.monthlyAmount).toLocaleString()}/mo
                </MenuItem>
              ))}
            </TextField>
          )}

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
        </>)}

        {/* History */}
        {(payments?.length || 0) > 0 ? (
          <TableContainer component={Paper} sx={{ borderRadius: 2, maxHeight: 380 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Amount</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Processed By</TableCell>
                  {FEATURES.manualPayments && (
                    <TableCell sx={{ fontWeight: 700 }} align="center">
                      Actions
                    </TableCell>
                  )}
                </TableRow>
              </TableHead>

              <TableBody>
                {paymentsForTable.map((p, idx) => {
                  const originalIndex = payments.findIndex(
                    (orig) =>
                      orig.date === p.date &&
                      orig.amount === p.amount &&
                      orig.recordedAt === p.recordedAt
                  );

                  return (
                    <TableRow key={`${p.recordedAt}-${idx}`} hover>
                      <TableCell>
                        <Chip
                          size="small"
                          label={formatDate(p.date)}
                        />
                      </TableCell>

                      <TableCell>{money(p.amount)}</TableCell>

                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {p.recordedBy || "—"}
                        </Typography>
                      </TableCell>

                      {FEATURES.manualPayments && (
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
                      )}
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
          <Button
            color="error"
            variant="contained"
            onClick={confirmDelete}
            startIcon={<DeleteIcon />}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
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