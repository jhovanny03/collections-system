// src/pages/MyCaseReview.jsx
// Payments from MyCase that the importer would not guess about: no matching client,
// several matching clients, refunds/reversals, or a possible duplicate of a manual entry.
import React, { useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  InputAdornment, Link, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography,
} from "@mui/material";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import db, { app } from "../firebase";

const REASONS = {
  no_matching_client: {
    label: "No matching client",
    help: "No client's MyCase link points at this case. Add or fix the link on the client, then Retry.",
  },
  multiple_matching_clients: {
    label: "Several clients on this case",
    help: "More than one client shares this MyCase case. Record the payment by hand on the right one, then Dismiss.",
  },
  refund_or_reversal: {
    label: "Refund / reversal",
    help: "Refunds and bounced payments are cancelled against the payment they reverse automatically; this one had no matching payment (same invoice and amount). Retry once the original payment is in, or adjust by hand and Dismiss.",
  },
  possible_duplicate: {
    label: "Possible duplicate",
    help: "A manual payment with the same date and amount already exists, so this was not added. Dismiss if it is the same payment.",
  },
  untagged_invoice: {
    label: "New invoice, not tagged",
    help: "Billing added an invoice to this case after it was set up. Say what it is; the payment is then counted (or not) accordingly.",
  },
  invalid_date: {
    label: "Missing / invalid date",
    help: "MyCase sent no usable payment date. Record it by hand, then Dismiss.",
  },
};

const money = (n) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function MyCaseReview() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState({});
  const [notes, setNotes] = useState({});

  useEffect(() => {
    const q = query(collection(db, "mycasePaymentReview"), where("status", "==", "open"));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => String(b.paymentDate || "").localeCompare(String(a.paymentDate || "")));
        setItems(rows);
      },
      (e) => {
        console.error(e);
        setError("Could not load review items. You may not have access.");
        setItems([]);
      }
    );
  }, []);

  const act = async (id, action, role, plan) => {
    setBusy((b) => ({ ...b, [id]: true }));
    setNotes((n) => ({ ...n, [id]: "" }));
    try {
      const fn = httpsCallable(getFunctions(app), "resolveMyCaseReview");
      const { data } = await fn({ reviewId: id, action, ...(role ? { role } : {}), ...(plan ? { plan } : {}) });
      if (data.status === "open") {
        const why = REASONS[data.detail]?.label || data.detail;
        setNotes((n) => ({ ...n, [id]: `Still unresolved: ${why}` }));
      }
      return true;
    } catch (e) {
      console.error(e);
      setNotes((n) => ({ ...n, [id]: e.message || "Action failed." }));
      return false;
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  // "Installment" on a new invoice makes it a plan of its own: ask for its amount and start.
  const [planFor, setPlanFor] = useState(null); // { item, invoice, monthlyAmount, startDate, error }
  const openPlanForm = async (it) => {
    let invoice = null;
    try {
      const s = await getDoc(doc(db, "mycaseInvoices", String(it.invoiceId)));
      invoice = s.exists() ? s.data() : null;
    } catch (e) { console.error(e); }
    setPlanFor({ item: it, invoice, monthlyAmount: "", startDate: invoice?.dueDate || "", error: "" });
  };
  const savePlan = async () => {
    const monthly = Number(planFor.monthlyAmount);
    if (!(monthly > 0)) { setPlanFor((p) => ({ ...p, error: "Enter the monthly amount." })); return; }
    if (!planFor.startDate) { setPlanFor((p) => ({ ...p, error: "Enter the first installment date." })); return; }
    const id = planFor.item.id;
    const ok = await act(id, "tag", "installment", { monthlyAmount: monthly, startDate: planFor.startDate });
    if (ok) setPlanFor(null);
    else setPlanFor((p) => ({ ...p, error: "Could not save. See the message on the item." }));
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        MyCase payments to review
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        These payments came from MyCase but were held back instead of guessed. Nothing here is
        counted in collections until it is resolved.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {items === null && <CircularProgress />}
      {items && items.length === 0 && !error && (
        <Alert severity="success">Nothing to review. Every MyCase payment is accounted for.</Alert>
      )}

      {items && items.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>MyCase client / case</TableCell>
                <TableCell>Why held</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((it) => {
                const r = REASONS[it.reason] || { label: it.reason, help: "" };
                return (
                  <TableRow key={it.id} hover>
                    <TableCell>{it.paymentDate || "—"}</TableCell>
                    <TableCell align="right">{money(it.amount)}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{it.mycaseClientName || "—"}</Typography>
                      {it.caseId && (
                        <Link
                          variant="caption"
                          href={`https://law-firm-of-moumita-rahman-pllc.mycase.com/court_cases/${it.caseId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Case {it.caseId}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      <Chip size="small" label={r.label} sx={{ mb: 0.5 }} />
                      <Typography variant="caption" display="block" color="text.secondary">
                        {r.help}
                      </Typography>
                      {notes[it.id] && (
                        <Typography variant="caption" color="warning.main" display="block">
                          {notes[it.id]}
                        </Typography>
                      )}
                      <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                        {it.reason === "untagged_invoice" && [
                          ["installment", "Installment"], ["initial", "Initial payment"], ["other", "Other (not counted)"],
                        ].map(([role, label]) => (
                          <Button key={role} size="small" variant="outlined" disabled={!!busy[it.id]}
                            onClick={() => (role === "installment" ? openPlanForm(it) : act(it.id, "tag", role))}>
                            {label}
                          </Button>
                        ))}
                        {(it.reason === "no_matching_client" ||
                          it.reason === "multiple_matching_clients" ||
                          it.reason === "refund_or_reversal") && (
                          <Button size="small" variant="outlined" disabled={!!busy[it.id]}
                            onClick={() => act(it.id, "retry")}>
                            Retry
                          </Button>
                        )}
                        <Button size="small" color="inherit" disabled={!!busy[it.id]}
                          onClick={() => act(it.id, "dismiss")}>
                          Dismiss
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {planFor && (
        <Dialog open onClose={() => setPlanFor(null)} maxWidth="xs" fullWidth>
          <DialogTitle>
            New installment plan
            <Typography variant="body2" color="text.secondary">
              {planFor.item.mycaseClientName || "Client"} · invoice {planFor.invoice?.number || planFor.item.invoiceNumber || planFor.item.invoiceId}
            </Typography>
          </DialogTitle>
          <DialogContent dividers>
            <Typography variant="body2" sx={{ mb: 2 }}>
              This invoice becomes its own payment plan (the client&apos;s first one if they were added
              from intake): its payments count toward this plan only.
              {planFor.invoice && ` Invoice total ${money(planFor.invoice.total)}${planFor.invoice.dueDate ? `, due ${planFor.invoice.dueDate}` : ""} in MyCase.`}
            </Typography>
            {planFor.error && <Alert severity="error" sx={{ mb: 2 }}>{planFor.error}</Alert>}
            <Stack spacing={2}>
              <TextField size="small" label="Monthly amount" type="number" autoFocus
                value={planFor.monthlyAmount}
                onChange={(e) => setPlanFor((p) => ({ ...p, monthlyAmount: e.target.value, error: "" }))}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
              <TextField size="small" label="First installment" type="date"
                value={planFor.startDate}
                onChange={(e) => setPlanFor((p) => ({ ...p, startDate: e.target.value, error: "" }))}
                InputLabelProps={{ shrink: true }}
                helperText={planFor.invoice?.dueDate ? "Pre-filled from the invoice's due date in MyCase." : undefined} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPlanFor(null)} disabled={!!busy[planFor.item.id]}>Cancel</Button>
            <Button variant="contained" onClick={savePlan} disabled={!!busy[planFor.item.id]}>
              {busy[planFor.item.id] ? "Saving…" : "Save plan and count payments"}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
