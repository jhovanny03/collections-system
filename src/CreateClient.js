import React, { useState } from "react";
import db from "./firebase";
import { collection, addDoc, doc, getDoc } from "firebase/firestore";

// Reuse your existing invoice editor (exact same behavior)
import InvoiceSection from "./InvoiceSection";

// MUI
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  TextField,
  Button,
  Grid,
  Stack,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
// Optional animation (safe to remove if you don't want it)
import { motion } from "framer-motion";

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
  "REMOVAL DEFENSE", // ✅ NEW CASE TYPE
];

const CASE_STATUSES = ["ACTIVE", "FILED", "APPROVED"];

export default function CreateClient({ onClientCreated }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [myCaseLink, setMyCaseLink] = useState("");
  const [caseType, setCaseType] = useState("");
  const [caseStatus, setCaseStatus] = useState("");

  // ✅ NEW: Case Title
  const [caseTitle, setCaseTitle] = useState("");

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ open: false, type: "success", msg: "" });

  // NEW: state to show the billing popup using the SAME InvoiceSection
  const [billingOpen, setBillingOpen] = useState(false);
  const [newClient, setNewClient] = useState(null); // full client object for InvoiceSection

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setMyCaseLink("");
    setCaseType("");
    setCaseStatus("");
    setCaseTitle(""); // ✅ reset case title too
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const title = (caseTitle || "").trim();

    const newClientBase = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      myCaseLink: myCaseLink.trim(),
      caseType,
      caseStatus,
      status: "active", // default status for new client
      payments: [], // ensure the array exists for InvoiceSection
      createdAt: new Date().toISOString(),
      // ✅ include caseTitle only if provided
      ...(title ? { caseTitle: title } : { caseTitle: "" }),
    };

    try {
      // 1) create basic client
      const ref = await addDoc(collection(db, "clients"), newClientBase);

      // 2) fetch full doc back (so we have id + fields exactly as stored)
      const snap = await getDoc(doc(db, "clients", ref.id));
      const full = { id: snap.id, ...snap.data() };
      setNewClient(full);

      // 3) open billing popup (this shows your InvoiceSection)
      setBillingOpen(true);

      if (onClientCreated) onClientCreated();
      resetForm();
      setToast({ open: true, type: "success", msg: "Client created successfully." });
    } catch (error) {
      console.error("Error adding client:", error);
      setToast({ open: true, type: "error", msg: "Failed to create client." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ px: 2, py: 3 }}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <Card
          sx={{
            maxWidth: 720,
            mx: "auto",
            borderRadius: 3,
            boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
            border: "1px solid rgba(2,55,112,0.08)",
          }}
        >
          <CardHeader
            title="Create Client"
            subheader="Add a new client to the collections system"
            sx={{
              pb: 0,
              "& .MuiCardHeader-title": { fontWeight: 700 },
              "& .MuiCardHeader-subheader": { color: "text.secondary" },
            }}
          />
          <CardContent>
            <Box component="form" onSubmit={handleSubmit} noValidate>
              <Grid container spacing={2.5}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="First Name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Last Name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    label="MyCase Link"
                    value={myCaseLink}
                    onChange={(e) => setMyCaseLink(e.target.value)}
                    required
                    fullWidth
                    placeholder="https://law-firm-of-moumita-rahman-pllc.mycase.com/..."
                    helperText="Paste the client's MyCase profile link."
                  />
                </Grid>

                {/* ✅ NEW: Case Title */}
                <Grid item xs={12}>
                  <TextField
                    label="Case Title"
                    value={caseTitle}
                    onChange={(e) => setCaseTitle(e.target.value)}
                    fullWidth
                    placeholder="e.g., A (04-25) SCOTT, DONMAUR (SPOUSE I-360 + AOS) Buffalo"
                    inputProps={{ maxLength: 200 }}
                    helperText="Used to disambiguate clients with the same name. Shown as a compact tag in the list."
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    select
                    label="Case Type"
                    value={caseType}
                    onChange={(e) => setCaseType(e.target.value)}
                    required
                    fullWidth
                    SelectProps={{ native: true }}
                  >
                    <option value="" />
                    {CASE_TYPES.map((ct) => (
                      <option key={ct} value={ct}>
                        {ct}
                      </option>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    select
                    label="Case Stage"
                    value={caseStatus}
                    onChange={(e) => setCaseStatus(e.target.value)}
                    required
                    fullWidth
                    SelectProps={{ native: true }}
                  >
                    <option value="" />
                    {CASE_STATUSES.map((cs) => (
                      <option key={cs} value={cs}>
                        {cs}
                      </option>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12}>
                  <Stack direction="row" spacing={1.5} justifyContent="flex-end">
                    <Button
                      variant="outlined"
                      onClick={resetForm}
                      disabled={loading}
                    >
                      Clear
                    </Button>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={loading}
                      sx={{
                        bgcolor: "#0b3a75",
                        "&:hover": { bgcolor: "#092e5b" },
                      }}
                    >
                      {loading ? "Saving..." : "Create Client"}
                    </Button>
                  </Stack>
                </Grid>
              </Grid>
            </Box>
          </CardContent>
        </Card>
      </motion.div>

      {/* Snackbar */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
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

      {/* 🔹 Billing Quick Setup using your existing InvoiceSection */}
      <Dialog
        open={billingOpen}
        onClose={() => setBillingOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Setup Invoice</DialogTitle>
        <DialogContent dividers>
          {newClient && (
            <InvoiceSection client={newClient} setClient={setNewClient} />
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              if (newClient?.id) {
                window.open(`/client/${newClient.id}`, "_blank", "noopener");
              }
              setBillingOpen(false);
            }}
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}