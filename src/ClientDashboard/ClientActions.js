// ✅ Updated ClientActions.js (pause/close/reopen fully aligned)
import React, { useMemo, useState } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import db from "../firebase";
import {
  Stack,
  Button,
  Tooltip,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Chip,
  Typography,
  Box,
} from "@mui/material";
import PauseIcon from "@mui/icons-material/PauseCircle";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CloseIcon from "@mui/icons-material/HighlightOff";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const ymLabel = (d) =>
  d.toLocaleString("default", { month: "short", year: "numeric" });

function buildMonthRange(startDate, endDate) {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  const out = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

// Skip Payments Dialog (unchanged)
function SkipPaymentsDialog({ open, onClose, client, onSaved }) {
  const months = useMemo(() => {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth() - 12, 1);
    const to = new Date(today.getFullYear(), today.getMonth() + 18, 1);
    return buildMonthRange(from, to);
  }, []);

  const existing = useMemo(() => new Set(client?.skipMonths || []), [client]);
  const [selected, setSelected] = useState(() => new Set(existing));

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectNone = () => setSelected(new Set());
  const selectExisting = () => setSelected(new Set(existing));
  const quickThisMonth = () => {
    const k = ymKey(new Date());
    setSelected((prev) => {
      const next = new Set(prev);
      next.add(k);
      return next;
    });
  };
  const quickNext3 = () => {
    const base = new Date();
    const nexts = [1, 2, 3].map((i) =>
      ymKey(new Date(base.getFullYear(), base.getMonth() + i, 1))
    );
    setSelected((prev) => {
      const next = new Set(prev);
      nexts.forEach((k) => next.add(k));
      return next;
    });
  };

  const handleSave = async () => {
    if (!client?.id) return;
    const arr = Array.from(selected).sort();
    const ref = doc(db, "clients", client.id);
    await updateDoc(ref, {
      skipMonths: arr,
      skipUpdatedAt: serverTimestamp(),
    });
    onSaved(arr);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Skip Payments</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Select the months you want to <strong>waive</strong>. For these months,
          the client won’t be billed and any past due for those months will not be counted.
        </Typography>

        <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
          <Button onClick={selectExisting} size="small" startIcon={<CheckCircleIcon />}>
            Load Existing
          </Button>
          <Button onClick={quickThisMonth} size="small" startIcon={<CalendarMonthIcon />}>
            This Month
          </Button>
          <Button onClick={quickNext3} size="small" startIcon={<CalendarMonthIcon />}>
            Next 3 Months
          </Button>
          <Button onClick={selectNone} size="small" startIcon={<ClearAllIcon />}>
            Clear
          </Button>
        </Stack>

        <Grid container spacing={1.5}>
          {months.map((d) => {
            const key = ymKey(d);
            const active = selected.has(key);
            return (
              <Grid item key={key}>
                <Chip
                  label={ymLabel(d)}
                  variant={active ? "filled" : "outlined"}
                  color={active ? "warning" : "default"}
                  onClick={() => toggle(key)}
                  sx={{ minWidth: 108, justifyContent: "center" }}
                />
              </Grid>
            );
          })}
        </Grid>

        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Selected:
          </Typography>
          <Typography variant="body2">
            {Array.from(selected).length ? Array.from(selected).join(", ") : "None"}
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save Skips
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------- Main Actions ----------
export default function ClientActions({ client, setClient }) {
  const [skipOpen, setSkipOpen] = useState(false);

  // Pause: freeze projection, don’t modify history
  const pause = async () => {
    if (!client?.id) return;
    const ref = doc(db, "clients", client.id);
    await updateDoc(ref, {
      status: "paused",
      pauseStartedAt: serverTimestamp(),
    });
    setClient((c) => ({
      ...c,
      status: "paused",
      pauseStartedAt: new Date(),
    }));
  };

  // Resume: only unpause
  const resume = async () => {
    if (!client?.id) return;
    const ref = doc(db, "clients", client.id);
    await updateDoc(ref, {
      status: "active",
      pauseStartedAt: null,
    });
    setClient((c) => ({
      ...c,
      status: "active",
      pauseStartedAt: null,
    }));
  };

  // Close: mark as closed, clear expected projections
  const closeCase = async () => {
    if (!client?.id) return;
    if (!window.confirm("Close this case? No more payments will be required.")) return;
    const ref = doc(db, "clients", client.id);
    await updateDoc(ref, {
      status: "closed",
      closedAt: serverTimestamp(),
    });
    setClient((c) => ({
      ...c,
      status: "closed",
      closedAt: new Date(),
    }));
  };

  // ✅ Reopen: restore to active, keep historical months intact
  const reopenCase = async () => {
    if (!client?.id) return;
    const ref = doc(db, "clients", client.id);
    await updateDoc(ref, {
      status: "active",
      closedAt: null,
    });
    setClient((c) => ({
      ...c,
      status: "active",
      closedAt: null,
    }));
  };

  const isClosed = client?.status === "closed";
  const isPaused = client?.status === "paused";

  if (!client?.id) return null;

  return (
    <>
      <Paper
        elevation={1}
        sx={{
          p: 2,
          mb: 2,
          display: "inline-flex",
          gap: 2,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {isClosed ? (
          <Tooltip title="Reopen this case and restore previous payment schedule">
            <Button
              variant="contained"
              color="success"
              startIcon={<RestartAltIcon />}
              onClick={reopenCase}
              size="large"
            >
              Reopen Case
            </Button>
          </Tooltip>
        ) : isPaused ? (
          <Tooltip title="Resume expected payments (past-due months stay the same)">
            <Button
              variant="contained"
              color="success"
              startIcon={<PlayArrowIcon />}
              onClick={resume}
              size="large"
            >
              Resume Payments
            </Button>
          </Tooltip>
        ) : (
          <Tooltip title="Pause expected payments (no new due months while paused)">
            <Button
              variant="contained"
              color="warning"
              startIcon={<PauseIcon />}
              onClick={pause}
              size="large"
            >
              Pause Payments
            </Button>
          </Tooltip>
        )}

        <Tooltip title="Select specific months to waive (no billing for those months)">
          <span>
            <Button
              variant="outlined"
              color="warning"
              startIcon={<CalendarMonthIcon />}
              onClick={() => setSkipOpen(true)}
              size="large"
              disabled={isClosed}
            >
              Skip Payments
            </Button>
          </span>
        </Tooltip>

        <Tooltip title="Permanently close this case (no more payments required)">
          <Button
            variant="outlined"
            color="error"
            startIcon={<CloseIcon />}
            onClick={closeCase}
            disabled={isClosed}
            size="large"
          >
            Close Case
          </Button>
        </Tooltip>
      </Paper>

      <SkipPaymentsDialog
        open={skipOpen}
        onClose={() => setSkipOpen(false)}
        client={client}
        onSaved={(newSkipMonths) =>
          setClient((c) => ({ ...c, skipMonths: newSkipMonths }))
        }
      />
    </>
  );
}