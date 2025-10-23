// src/ClientDashboard/letters/warning/WarningActiveLetter.js
import React, { useMemo, useState } from "react";
import { Box, Button, TextField, Snackbar, Alert, Stack, Typography } from "@mui/material";
import { saveAs } from "file-saver";
import { getAuth } from "firebase/auth";

import { fetchTemplateBuffer } from "../_helpers/fetchTemplateBuffer";
import { generateFilledLetterBlob } from "../_helpers/generateFilledLetterBlob";
import { money, dateLong } from "../_helpers/formatters";
import { computeCurrentPastDue } from "../_helpers/billing";
import { saveLetterMetadata } from "../_helpers/history"; // optional but recommended

// Template stored in Firebase Storage
const TEMPLATE_STORAGE_PATH = "letterTemplates/WarningLetter_ActiveClient.docx";

export default function WarningActiveLetter({ client }) {
  const [form, setForm] = useState({
    clientAddress: "",
    clientPhone: "",
    retainerDate: "",
  });
  const [toast, setToast] = useState({ open: false, msg: "", sev: "info" });

  const today = useMemo(() => dateLong(new Date()), []);
  const agentName = useMemo(() => {
    const user = getAuth().currentUser;
    return user?.displayName || user?.email || "Agent";
  }, []);
  const totalPastDue = useMemo(
    () => computeCurrentPastDue(client),
    [client?.firstInstallmentDate, client?.payments, client?.installmentAmount]
  );

  const onChange = (e) => setForm((s) => ({ ...s, [e.target.name]: e.target.value }));

  const validate = () => {
    const missing = [];
    if (!client?.id) missing.push("Client ID");
    if (!client?.firstName || !client?.lastName) missing.push("Client Name");
    if (!form.clientAddress) missing.push("Client Address");
    if (!form.clientPhone) missing.push("Client Phone");
    if (!form.retainerDate) missing.push("Retainer Signed Date");

    if (missing.length) {
      setToast({ open: true, sev: "warning", msg: `Missing: ${missing.join(", ")}` });
      return false;
    }
    return true;
  };

  const handleGenerate = async () => {
    if (!validate()) return;

    try {
      // 1) Download template from Firebase Storage
      const templateBuffer = await fetchTemplateBuffer(TEMPLATE_STORAGE_PATH);

      // 2) Fill placeholders
      const values = {
        Date: today,
        ClientName: `${client.firstName} ${client.lastName}`,
        ClientAddress: form.clientAddress,
        ClientPhone: form.clientPhone,
        TotalAmountOwed: money(totalPastDue),
        RetainerDate: form.retainerDate,
        AgentName: agentName,
      };

      // 3) Fill template → Blob
      const blob = await generateFilledLetterBlob(templateBuffer, values);

      // 4) Download to user
      const filename = `${client.lastName}_WarningLetter_active_${new Date()
        .toISOString()
        .slice(0, 10)}.docx`;
      saveAs(blob, filename);

      // 5) Save Firestore metadata (optional but recommended)
      await saveLetterMetadata(client.id, {
        type: "Warning Letter",
        subType: "Active Client",
        filename,
        totalAmountOwed: Number(totalPastDue),
        agentName,
        templateStoragePath: TEMPLATE_STORAGE_PATH,
      });

      setToast({ open: true, sev: "success", msg: "Letter generated successfully." });
    } catch (err) {
      console.error("⚠️ Generation failed:", err);
      setToast({ open: true, sev: "error", msg: "Failed to generate letter." });
    }
  };

  return (
    <>
      <Stack spacing={2} sx={{ maxWidth: 640 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          Warning Letter — Active Client
        </Typography>

        <TextField
          name="clientAddress"
          label="Client Address"
          required
          value={form.clientAddress}
          onChange={onChange}
        />
        <TextField
          name="clientPhone"
          label="Client Phone"
          required
          value={form.clientPhone}
          onChange={onChange}
        />
        <TextField
          name="retainerDate"
          label="Retainer Signed Date"
          required
          placeholder="e.g., January 15, 2025"
          value={form.retainerDate}
          onChange={onChange}
        />

        {/* Preview system-filled fields */}
        <Box sx={{ fontSize: 14, opacity: 0.9 }}>
          <div><b>Date:</b> {today}</div>
          <div><b>Client:</b> {client?.firstName} {client?.lastName}</div>
          <div><b>Agent:</b> {agentName}</div>
          <div><b>Total Amount Owed:</b> {money(totalPastDue)}</div>
        </Box>

        <Button onClick={handleGenerate} variant="contained">
          GENERATE & DOWNLOAD
        </Button>
      </Stack>

      <Snackbar
        open={toast.open}
        autoHideDuration={3500}
        onClose={() => setToast((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={toast.sev}
          variant="filled"
          onClose={() => setToast((s) => ({ ...s, open: false }))}
          sx={{ width: "100%" }}
        >
          {toast.msg}
        </Alert>
      </Snackbar>
    </>
  );
}