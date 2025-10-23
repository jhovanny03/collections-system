// EditClient.jsx
import React, { useEffect, useState } from "react";
import db from "./firebase";
import { doc, updateDoc } from "firebase/firestore";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  TextField,
  Button,
  Stack,
  Snackbar,
  Alert,
} from "@mui/material";

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
];

const CASE_STATUSES = ["ACTIVE", "FILED", "APPROVED"];

export default function EditClient({ client, onClose, onSave }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [myCaseLink, setMyCaseLink] = useState("");
  const [caseType, setCaseType] = useState("");
  const [caseStatus, setCaseStatus] = useState("");

  // ✅ NEW: Case Title state
  const [caseTitle, setCaseTitle] = useState("");

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ open: false, type: "success", msg: "" });

  // Prefill with current client data
  useEffect(() => {
    if (!client) return;
    setFirstName(client.firstName || "");
    setLastName(client.lastName || "");
    setMyCaseLink(client.myCaseLink || "");
    setCaseType(client.caseType || "");
    setCaseStatus(client.caseStatus || "");
    setCaseTitle(client.caseTitle || ""); // ✅ preload
  }, [client]);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();

    // Minimal required fields (kept same as your version; caseTitle is optional)
    if (!firstName.trim() || !lastName.trim() || !caseType || !caseStatus || !myCaseLink.trim()) {
      setToast({ open: true, type: "error", msg: "Please fill in all required fields." });
      return;
    }

    setLoading(true);
    const now = new Date().toISOString();

    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      myCaseLink: myCaseLink.trim(),
      caseType,
      caseStatus,
      updatedAt: now,
      lastChangeAt: now,
      lastActivity: "edited",
    };

    // ✅ include caseTitle if provided (trim), omit if empty
    const trimmedTitle = (caseTitle || "").trim();
    if (trimmedTitle) payload.caseTitle = trimmedTitle;
    else payload.caseTitle = ""; // or delete payload.caseTitle; if you prefer removing the field

    try {
      await updateDoc(doc(db, "clients", client.id), payload);
      setToast({ open: true, type: "success", msg: "Client updated." });
      onSave?.();
      onClose?.();
    } catch (err) {
      console.error(err);
      setToast({ open: true, type: "error", msg: "Failed to update client." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={!!client} onClose={onClose} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: 1 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Edit Client</DialogTitle>
        <DialogContent dividers>
          <form onSubmit={handleSubmit}>
            <Grid container spacing={2.5} sx={{ pt: 0.5 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  fullWidth
                  autoFocus
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

              {/* ✅ NEW: Case Title field */}
              <Grid item xs={12}>
                <TextField
                  label="Case Title"
                  value={caseTitle}
                  onChange={(e) => setCaseTitle(e.target.value)}
                  fullWidth
                  placeholder="e.g., A (04-25) SCOTT, DONMAUR (SPOUSE I-360 + AOS) Buffalo"
                  inputProps={{ maxLength: 200 }}
                  helperText="Used to disambiguate clients with the same name. Shows as a compact tag in the list."
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
            </Grid>
          </form>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Stack direction="row" spacing={1.5}>
            <Button onClick={onClose} disabled={loading} variant="text">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading} variant="contained">
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={2500}
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
    </>
  );
}