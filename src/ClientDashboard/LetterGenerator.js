import React, { useState } from "react";
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Snackbar,
  Alert as MuiAlert,
} from "@mui/material";
import { generateFilledLetter } from "./generateFilledLetter";
import WarningLetterGenerator from "./WarningLetterGenerator";

const LetterGenerator = ({ client }) => {
  const [formData, setFormData] = useState({
    clientAddress: "",
    clientCityStateZip: "",
    clientPhone: "",
    clientEmail: "",
    retainerDate: "",
    missedDates: "",
    warningDate: "",
    amountPaid: "",
    hoursWorked: "",
    valueOfWork: "",
    expenses: "",
    refundAmount: "",
    amountOwed: "",
  });

  const [letterType, setLetterType] = useState("");
  const [subType, setSubType] = useState("");
  const [refundLevel, setRefundLevel] = useState("");
  const [open, setOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "warning",
  });

  const formatDateLong = (date) =>
    new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const formatMoney = (value) =>
    `$${parseFloat(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 0,
    })}`;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const showSnackbar = (message, severity = "warning") => {
    setSnackbar({ open: true, message, severity });
  };

  const getTemplateFile = () => {
    if (letterType === "termination") {
      if (subType === "noRefund")
        return "/templates/TerminationLetterTemplate.docx";
      if (subType === "withRefund" && refundLevel === "partial")
        return "/templates/TerminationLetter_PartialRefund.docx";
      if (subType === "withRefund" && refundLevel === "full")
        return "/templates/TerminationLetter_FullRefund.docx";
    }
    return null;
  };

  const validateFields = () => {
    const required = [
      "clientAddress",
      "clientCityStateZip",
      "clientPhone",
      "clientEmail",
      "retainerDate",
      "amountPaid",
      "hoursWorked",
      "valueOfWork",
      "expenses",
      "refundAmount",
    ];

    if (subType === "noRefund") {
      required.push("missedDates", "warningDate", "amountOwed");
    }

    const missing = required.filter((key) => !formData[key]);
    if (missing.length > 0) {
      showSnackbar(
        `Please complete all required fields: ${missing.join(", ")}`,
        "warning"
      );
      return false;
    }
    return true;
  };

  const handleGenerateDocx = async () => {
    if (!validateFields()) return;

    try {
      const templatePath = getTemplateFile();
      if (!templatePath) throw new Error("No template selected");

      const response = await fetch(templatePath);
      const templateBuffer = await response.arrayBuffer();

      const values = {
        clientName: `${client.firstName} ${client.lastName}`,
        caseType: client.caseType || "[Case Type]",
        clientAddress: formData.clientAddress,
        clientCityStateZip: formData.clientCityStateZip,
        clientPhone: formData.clientPhone,
        clientEmail: formData.clientEmail,
        retainerDate: formData.retainerDate,
        today: formatDateLong(new Date()),
        missedDates: formData.missedDates,
        warningDate: formData.warningDate,
        amountPaid: formatMoney(formData.amountPaid),
        hoursWorked: formData.hoursWorked,
        valueOfWork: formatMoney(formData.valueOfWork),
        expenses: formatMoney(formData.expenses),
        refundAmount: formatMoney(formData.refundAmount),
        amountOwed: formatMoney(formData.amountOwed),
      };

      const filename = `${client.lastName}_${letterType}_Letter_${subType}_${
        refundLevel || "none"
      }.docx`;
      await generateFilledLetter(templateBuffer, values, filename);
      showSnackbar("Letter generated successfully!", "success");
      handleClose();
    } catch (err) {
      console.error("Error loading template or generating letter:", err);
      showSnackbar("There was an error generating the letter.", "error");
    }
  };

  const handleClose = () => {
    setOpen(false);
    setSubType("");
    setRefundLevel("");
  };

  const shouldShowTerminationModal =
    letterType === "termination" &&
    (subType === "noRefund" ||
      (subType === "withRefund" &&
        (refundLevel === "partial" || refundLevel === "full")));

  return (
    <Paper sx={{ p: 3, mt: 4, borderRadius: "12px" }}>
      <Typography variant="h6" fontWeight={600} gutterBottom>
        📝 Letter Drafting
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <FormControl fullWidth>
          <InputLabel>Letter Type</InputLabel>
          <Select
            value={letterType}
            label="Letter Type"
            onChange={(e) => {
              setLetterType(e.target.value);
              setSubType("");
              setRefundLevel("");
              setOpen(false);
            }}
          >
            <MenuItem value="termination">Termination Letters</MenuItem>
            <MenuItem value="warning">Warning Letter</MenuItem>
          </Select>
        </FormControl>

        {letterType === "termination" && (
          <>
            <FormControl fullWidth>
              <InputLabel>Template</InputLabel>
              <Select
                value={subType}
                label="Template"
                onChange={(e) => {
                  setSubType(e.target.value);
                  setRefundLevel("");
                  if (e.target.value === "noRefund") setOpen(true);
                }}
              >
                <MenuItem value="noRefund">No Refund</MenuItem>
                <MenuItem value="withRefund">With Refund</MenuItem>
              </Select>
            </FormControl>

            {subType === "withRefund" && (
              <FormControl fullWidth>
                <InputLabel>Refund Type</InputLabel>
                <Select
                  value={refundLevel}
                  label="Refund Type"
                  onChange={(e) => {
                    setRefundLevel(e.target.value);
                    setOpen(true);
                  }}
                >
                  <MenuItem value="partial">Partial Refund</MenuItem>
                  <MenuItem value="full">Full Refund</MenuItem>
                </Select>
              </FormControl>
            )}
          </>
        )}
      </Box>

      {/* Termination Modal */}
      <Dialog
        open={shouldShowTerminationModal}
        onClose={handleClose}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          Termination Letter -{" "}
          {subType === "noRefund"
            ? "No Refund"
            : refundLevel === "partial"
            ? "Partial Refund"
            : "Full Refund"}
        </DialogTitle>
        <DialogContent>
          <Box
            component="form"
            noValidate
            autoComplete="off"
            sx={{ display: "grid", gap: 2, mt: 1 }}
          >
            <TextField
              name="clientAddress"
              label="Client Address"
              fullWidth
              onChange={handleChange}
            />
            <TextField
              name="clientCityStateZip"
              label="City, State ZIP"
              fullWidth
              onChange={handleChange}
            />
            <TextField
              name="clientPhone"
              label="Phone"
              fullWidth
              onChange={handleChange}
            />
            <TextField
              name="clientEmail"
              label="Email"
              fullWidth
              onChange={handleChange}
            />
            <TextField
              name="retainerDate"
              label="Retainer Signed Date"
              fullWidth
              onChange={handleChange}
            />
            {subType === "noRefund" && (
              <TextField
                name="missedDates"
                label="Missed Payment Dates (comma separated)"
                fullWidth
                onChange={handleChange}
              />
            )}
            {subType === "noRefund" && (
              <TextField
                name="warningDate"
                label="Date of Warning Letter"
                fullWidth
                onChange={handleChange}
              />
            )}
            <TextField
              name="amountPaid"
              label="Amount Paid"
              fullWidth
              onChange={handleChange}
            />
            <TextField
              name="hoursWorked"
              label="Hours Worked"
              fullWidth
              onChange={handleChange}
            />
            <TextField
              name="valueOfWork"
              label="Dollar Value of Work Performed"
              fullWidth
              onChange={handleChange}
            />
            <TextField
              name="expenses"
              label="Expenses Incurred"
              fullWidth
              onChange={handleChange}
            />
            <TextField
              name="refundAmount"
              label="Refund Amount"
              fullWidth
              onChange={handleChange}
            />
            {subType === "noRefund" && (
              <TextField
                name="amountOwed"
                label="Amount Owed to Firm (if any)"
                fullWidth
                onChange={handleChange}
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button variant="contained" onClick={handleGenerateDocx}>
            GENERATE LETTER
          </Button>
        </DialogActions>
      </Dialog>

      {/* Warning Letter Component */}
      {letterType === "warning" && (
        <WarningLetterGenerator
          client={client}
          open={true}
          onClose={() => setLetterType("")}
        />
      )}

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <MuiAlert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
          elevation={6}
          variant="filled"
        >
          {snackbar.message}
        </MuiAlert>
      </Snackbar>
    </Paper>
  );
};

export default LetterGenerator;
