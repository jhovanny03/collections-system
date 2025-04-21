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
} from "@mui/material";
import { generateFilledLetter } from "./generateFilledLetter";

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

  const today = new Date().toLocaleDateString();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const getTemplateFile = () => {
    if (subType === "noRefund")
      return "/templates/TerminationLetterTemplate.docx";
    if (subType === "withRefund" && refundLevel === "partial")
      return "/templates/TerminationLetter_PartialRefund.docx";
    if (subType === "withRefund" && refundLevel === "full")
      return "/templates/TerminationLetter_FullRefund.docx";
    return null;
  };

  const handleGenerateDocx = async () => {
    try {
      const templatePath = getTemplateFile();
      if (!templatePath) throw new Error("No template selected");

      const response = await fetch(templatePath);
      const templateBuffer = await response.arrayBuffer();

      const values = {
        clientName: `${client.firstName} ${client.lastName}`,
        clientAddress: formData.clientAddress,
        clientCityStateZip: formData.clientCityStateZip,
        clientPhone: formData.clientPhone,
        clientEmail: formData.clientEmail,
        caseType: client.caseType || "[Case Type]",
        today,
        retainerDate: formData.retainerDate,
        missedDates: formData.missedDates,
        warningDate: formData.warningDate,
        amountPaid: formData.amountPaid,
        hoursWorked: formData.hoursWorked,
        valueOfWork: formData.valueOfWork,
        expenses: formData.expenses,
        refundAmount: formData.refundAmount,
        amountOwed: formData.amountOwed,
      };

      const filename = `${client.lastName}_Termination_Letter_${subType}_${
        refundLevel || "none"
      }.docx`;
      await generateFilledLetter(templateBuffer, values, filename);
      setOpen(false);
    } catch (err) {
      console.error("Error loading template or generating letter:", err);

      if (err.properties && Array.isArray(err.properties.errors)) {
        const errorMessages = err.properties.errors
          .map((e) => e.properties.explanation)
          .join("\n");
        console.error("Template rendering errors:\n", errorMessages);
      }

      alert(
        "There was an error generating the letter. Check the console for details."
      );
    }
  };

  const shouldShowModal =
    subType === "noRefund" ||
    (subType === "withRefund" &&
      (refundLevel === "partial" || refundLevel === "full"));

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
            }}
          >
            <MenuItem value="termination">Termination Letters</MenuItem>
            <MenuItem value="warning" disabled>
              Warning Letter (coming soon)
            </MenuItem>
          </Select>
        </FormControl>

        {letterType === "termination" && (
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
        )}

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
      </Box>

      {/* Pop-up Modal for Letter Form */}
      <Dialog
        open={open && shouldShowModal}
        onClose={() => setOpen(false)}
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
            <TextField
              name="missedDates"
              label="Missed Payment Dates (comma separated)"
              fullWidth
              onChange={handleChange}
            />
            <TextField
              name="warningDate"
              label="Date of Warning Letter"
              fullWidth
              onChange={handleChange}
            />
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
            <TextField
              name="amountOwed"
              label="Amount Owed to Firm (if any)"
              fullWidth
              onChange={handleChange}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleGenerateDocx}>
            Generate Word Document
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default LetterGenerator;
