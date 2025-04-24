import React, { useState } from "react";
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
} from "@mui/material";
import { generateFilledLetter } from "./generateFilledLetter";
import { doc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import db from "../firebase";

export default function WarningLetterGenerator({ client, open, onClose }) {
  const [subType, setSubType] = useState("filed");
  const [formData, setFormData] = useState({
    clientAddress: "",
    clientCityStateZip: "",
    clientPhone: "",
    clientEmail: "",
    retainerDate: "",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const formatDateLong = (date) =>
    new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const today = formatDateLong(new Date());
  const monthlyInstallment = client.installmentAmount || 500;

  const getTemplatePath = () => {
    if (subType === "filed") return "/templates/WarningLetter_FiledClient.docx";
    if (subType === "active")
      return "/templates/WarningLetter_ActiveClient.docx";
    return null;
  };

  const generatePastDueSummary = () => {
    const invoiceTotal = parseFloat(client?.invoiceTotal || 0);
    const rawStart = client.firstInstallmentDate;
    if (!rawStart) return { table: "N/A", total: "$0.00" };

    let firstInstallmentDate = new Date(
      rawStart?.seconds ? rawStart.seconds * 1000 : rawStart
    );
    const today = new Date();

    const validPayments = (client?.payments || []).filter(
      (p) => new Date(p.date) >= firstInstallmentDate
    );
    const validTotalPaid = validPayments.reduce((sum, p) => sum + p.amount, 0);
    const paidInstallments = Math.floor(validTotalPaid / monthlyInstallment);

    const dueMonths = [];
    for (let i = paidInstallments; ; i++) {
      const dueDate = new Date(firstInstallmentDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      if (dueDate > today) break;
      dueMonths.push({
        date: dueDate.toLocaleDateString("default", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        amount: monthlyInstallment,
      });
    }

    const total = dueMonths.length * monthlyInstallment;
    const rows = dueMonths.map(
      (entry) => `${entry.date}                $${entry.amount.toFixed(2)}`
    );

    if (rows.length > 0) {
      rows.push("------------------------------");
      rows.push(
        `Total                  $${total.toLocaleString(undefined, {
          minimumFractionDigits: 2,
        })}`
      );
    }

    return {
      table: rows.join("\n") || "N/A",
      total: `$${total.toLocaleString(undefined, {
        minimumFractionDigits: 2,
      })}`,
    };
  };

  const handleGenerate = async () => {
    try {
      const templatePath = getTemplatePath();
      const res = await fetch(templatePath);
      const buffer = await res.arrayBuffer();

      const { table, total } = generatePastDueSummary();

      const values = {
        clientName: `${client.firstName} ${client.lastName}`,
        caseType: client.caseType || "[Case Type]",
        clientAddress: formData.clientAddress,
        clientCityStateZip: formData.clientCityStateZip,
        clientPhone: formData.clientPhone,
        clientEmail: formData.clientEmail,
        retainerDate: formData.retainerDate,
        today,
        PastDueAmount: table,
        TotalPastDueAmount: total,
      };

      const filename = `${client.lastName}_WarningLetter_${subType}.docx`;
      await generateFilledLetter(buffer, values, filename);

      // 🔥 Save metadata to Firestore
      const lettersRef = collection(doc(db, "clients", client.id), "letters");
      await addDoc(lettersRef, {
        type: "Warning Letter",
        subType: subType === "filed" ? "Filed Client" : "Active Client",
        filename,
        generatedAt: serverTimestamp(),
      });

      onClose();
    } catch (err) {
      console.error("❌ Error generating warning letter:", err);
      alert("Something went wrong while generating the letter.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        Warning Letter -{" "}
        {subType === "filed" ? "Filed Client" : "Active Client"}
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, mt: 1 }}>
        <FormControl fullWidth>
          <InputLabel>Client Type</InputLabel>
          <Select value={subType} onChange={(e) => setSubType(e.target.value)}>
            <MenuItem value="filed">Filed Client</MenuItem>
            <MenuItem value="active">Active Client</MenuItem>
          </Select>
        </FormControl>

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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleGenerate}>
          GENERATE LETTER
        </Button>
      </DialogActions>
    </Dialog>
  );
}
