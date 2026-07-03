// src/ClientDashboard/CaseSwitcher.jsx
//
// Manages multiple cases (retainers) per client.
// - Tabs to switch between current active case and archived (closed) cases.
// - "Add New Case" button archives the current billing plan and starts a fresh one.
// - Archived cases are stored in client.cases[] as immutable snapshots.
// - All other dashboard components (RecordPayment, InvoiceSection, etc.) always
//   operate on the current active case (the flat fields on the client document).

import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import HistoryIcon from "@mui/icons-material/History";
import WorkIcon from "@mui/icons-material/Work";
import { doc, updateDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import db from "../firebase";
import BillingOverview from "./BillingOverview";

const CASE_TYPES = [
  "VAWA SPOUSE",
  "PARENT VAWA",
  "CHILD VAWA",
  "T VISA",
  "U VISA",
  "MARRIAGE AOS",
  "N400",
  "I751 REGULAR",
  "I751 ECB",
  "I90",
  "ASYLUM",
  "REMOVAL DEFENSE",
];

export default function CaseSwitcher({ client, setClient }) {
  const archivedCases = client.cases || [];
  // Most-recent archived case first in tabs (tab 1 = reversedCases[0]).
  const reversedCases = [...archivedCases].reverse();

  const [selectedTab, setSelectedTab] = useState(0);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [archiveLabel, setArchiveLabel] = useState("");
  const [newCaseType, setNewCaseType] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [saving, setSaving] = useState(false);

  const hasCurrentInvoice = !!client.invoiceTotal;
  const hasArchivedCases = archivedCases.length > 0;
  const showTabs = hasArchivedCases;

  // Case data displayed for the selected tab. null = current active case.
  const selectedCaseData = selectedTab === 0 ? null : reversedCases[selectedTab - 1];

  // Build a client-shaped object for BillingOverview when viewing an archived case.
  const billingClient = selectedCaseData
    ? {
        ...client,
        // Override billing fields with the archived case snapshot.
        invoiceTotal: selectedCaseData.invoiceTotal,
        initialPaymentAmount: selectedCaseData.initialPaymentAmount,
        initialPaymentDate: selectedCaseData.initialPaymentDate,
        firstInstallmentDate: selectedCaseData.firstInstallmentDate,
        installmentSchedule: selectedCaseData.installmentSchedule || [],
        payments: selectedCaseData.payments || [],
        skipMonths: selectedCaseData.skipMonths || [],
        expectedAnchor: selectedCaseData.expectedAnchor || null,
        invoiceAdjustments: selectedCaseData.invoiceAdjustments || [],
        caseType: selectedCaseData.caseType,
        // Archived cases always show as closed in BillingOverview.
        status: "closed",
      }
    : client;

  const openDialog = () => {
    setArchiveLabel(client.caseType || "Current Case");
    setNewCaseType("");
    setDialogError("");
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saving) return;
    setDialogOpen(false);
  };

  const handleArchiveAndOpenNew = async () => {
    if (!newCaseType.trim()) {
      setDialogError("Please select the new case / service type.");
      return;
    }

    setSaving(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      const by = user?.displayName || user?.email || "System";
      const now = new Date().toISOString();

      const archivedCase = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `case_${Date.now()}`,
        caseLabel: archiveLabel.trim() || client.caseType || "Case",
        caseType: client.caseType || "",

        // Full billing snapshot
        invoiceTotal: client.invoiceTotal ?? null,
        initialPaymentAmount: client.initialPaymentAmount ?? null,
        initialPaymentDate: client.initialPaymentDate ?? null,
        firstInstallmentDate: client.firstInstallmentDate ?? null,
        installmentSchedule: client.installmentSchedule || [],
        payments: client.payments || [],
        skipMonths: client.skipMonths || [],
        expectedAnchor: client.expectedAnchor ?? null,
        invoiceAdjustments: client.invoiceAdjustments || [],
        invoiceUpdatedBy: client.invoiceUpdatedBy ?? null,
        invoiceUpdatedAt: client.invoiceUpdatedAt ?? null,
        paymentPromise: client.paymentPromise ?? null,

        status: "paid_in_full",
        archivedAt: now,
        archivedBy: by,
      };

      const updatedCases = [...archivedCases, archivedCase];

      // Clear all current billing fields so the new case starts fresh.
      const newFields = {
        cases: updatedCases,
        caseType: newCaseType.trim(),
        invoiceTotal: null,
        initialPaymentAmount: null,
        initialPaymentDate: null,
        firstInstallmentDate: null,
        installmentSchedule: [],
        payments: [],
        skipMonths: [],
        expectedAnchor: null,
        invoiceAdjustments: [],
        invoiceUpdatedBy: null,
        invoiceUpdatedAt: null,
        paymentPromise: null,
      };

      const clientRef = doc(db, "clients", client.id);
      await updateDoc(clientRef, newFields);

      setClient((prev) => ({ ...prev, ...newFields }));
      setDialogOpen(false);
      setSelectedTab(0);
    } catch (e) {
      console.error(e);
      setDialogError("Failed to archive the case. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ mb: 2 }}>
      {/* ── Header row: tabs (if any) + Add New Case button ── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1,
          mb: 1,
        }}
      >
        {showTabs ? (
          <Tabs
            value={selectedTab}
            onChange={(_, v) => setSelectedTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ flexGrow: 1 }}
          >
            {/* Current / active case */}
            <Tab
              value={0}
              icon={<WorkIcon sx={{ fontSize: 16 }} />}
              iconPosition="start"
              label={
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <span>{client.caseType || "Current Case"}</span>
                  <Chip
                    label="Active"
                    color="success"
                    size="small"
                    sx={{ height: 16, fontSize: "0.65rem", pointerEvents: "none" }}
                  />
                </Stack>
              }
            />

            {/* Archived cases — most-recent first */}
            {reversedCases.map((c, i) => (
              <Tab
                key={c.id}
                value={i + 1}
                icon={<HistoryIcon sx={{ fontSize: 16 }} />}
                iconPosition="start"
                label={
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <span>{c.caseLabel || c.caseType || `Case ${archivedCases.length - i}`}</span>
                    <Chip
                      label="Paid in Full"
                      color="success"
                      size="small"
                      sx={{ height: 16, fontSize: "0.65rem", pointerEvents: "none" }}
                    />
                  </Stack>
                }
              />
            ))}
          </Tabs>
        ) : (
          <Typography variant="subtitle1" fontWeight={700} sx={{ pl: 0.5 }}>
            {client.caseType ? `Current Case: ${client.caseType}` : "Billing Overview"}
          </Typography>
        )}

        {hasCurrentInvoice && (
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={openDialog}
            size="small"
            sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
          >
            Add New Case
          </Button>
        )}
      </Box>

      {/* Info banner when viewing an archived case */}
      {selectedCaseData && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Viewing completed case:{" "}
          <strong>{selectedCaseData.caseLabel || selectedCaseData.caseType}</strong>
          {selectedCaseData.archivedAt
            ? ` — paid in full ${new Date(selectedCaseData.archivedAt).toLocaleDateString()}`
            : ""}
          . This is read-only. The invoice, payment, and settings sections below
          apply to the <strong>current active case</strong>.
        </Alert>
      )}

      {/* BillingOverview for the selected case (current or archived) */}
      <BillingOverview client={billingClient} />

      {/* ── Archive + New Case Dialog ── */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Mark Case as Paid in Full &amp; Start New Retainer</DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 0.5 }}>
            {dialogError && <Alert severity="error">{dialogError}</Alert>}

            <Alert severity="info" variant="outlined">
              The current billing plan, payments, and invoice will be saved as a{" "}
              <strong>Paid in Full</strong> case in the client's history. A fresh invoice
              can then be set up for the new retainer.
            </Alert>

            <TextField
              label="Label for the case being archived"
              value={archiveLabel}
              onChange={(e) => setArchiveLabel(e.target.value)}
              helperText="How this case will appear in the Case History tabs."
              fullWidth
            />

            <Divider>
              <Chip label="New Case" size="small" />
            </Divider>

            <TextField
              select
              label="New case / service type *"
              value={newCaseType}
              onChange={(e) => {
                setNewCaseType(e.target.value);
                setDialogError("");
              }}
              helperText="Select the service the client is retaining you for."
              fullWidth
              required
            >
              {CASE_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={closeDialog} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleArchiveAndOpenNew}
            disabled={saving}
          >
            {saving ? "Saving…" : "Mark Paid in Full & Start New Case"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
