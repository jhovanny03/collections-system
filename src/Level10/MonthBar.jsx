// src/Level10/MonthBar.jsx
import React, { useState } from "react";
import {
  Stack,
  TextField,
  IconButton,
  Tooltip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  CircularProgress,
  Snackbar,
  Alert,
  Box,
} from "@mui/material";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import BoltIcon from "@mui/icons-material/Bolt";
import TodayIcon from "@mui/icons-material/Today";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import db from "../firebase";
// If you already have this helper, great; if not, we'll still handle it locally.
import { bulkDeleteWeekDocs } from "./services/level10.api";

const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const ym = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const ymd = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const fmtNice = (isoYmd) => {
  const d = new Date(`${isoYmd}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function MonthBar({
  month,
  setMonth,
  meetingDate,
  setMeetingDate,
  onRunToday,      // optional helper: set today + populate
  onPopulateWeek,  // required: create/overwrite column for meetingDate
  onDeleted,       // optional: called after hard delete to refresh parent
}) {
  // ====== Delete Columns dialog state ======
  const [delOpen, setDelOpen] = useState(false);
  const [loadingWeeks, setLoadingWeeks] = useState(false);
  const [availableWeeks, setAvailableWeeks] = useState([]); // ["YYYY-MM-DD", ...]
  const [selected, setSelected] = useState(new Set());
  const [toast, setToast] = useState({ open: false, msg: "", type: "success" });

  // ====== Handlers for month / meeting date ======
  const handleMonthChange = (e) => {
    const val = e.target.value; // YYYY-MM
    setMonth(val);
    // meetingDate stays as the user chose; no auto-snap
  };

  const shiftMeetingBy = (days) => {
    const d = new Date(`${meetingDate}T00:00:00`);
    d.setDate(d.getDate() + days);
    // keep month UI in sync if crossing months
    setMonth(ym(d));
    setMeetingDate(ymd(d));
  };

  const prevWeek = () => shiftMeetingBy(-7);
  const nextWeek = () => shiftMeetingBy(+7);

  // ====== Delete Columns dialog logic ======
  const openDeleteDialog = async () => {
    setDelOpen(true);
    setSelected(new Set());
    setLoadingWeeks(true);
    try {
      // List existing week docs for the selected month
      const weeksRef = collection(db, `level10/${month}/weeks`);
      const snap = await getDocs(weeksRef);
      const ids = snap.docs.map((d) => d.id); // doc id = "YYYY-MM-DD"
      const filtered = ids.filter((id) => id.startsWith(month + "-")).sort();
      setAvailableWeeks(filtered);
    } catch (e) {
      setAvailableWeeks([]);
      setToast({ open: true, type: "warning", msg: `Couldn't load weeks: ${e.message}` });
    } finally {
      setLoadingWeeks(false);
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(availableWeeks));
  const clearAll = () => setSelected(new Set());

  const pruneMonthColumns = async (monthId, datesToRemove) => {
    const monthRef = doc(db, `level10/${monthId}`);
    const snap = await getDoc(monthRef);
    if (!snap.exists()) return { keptColumns: [] };

    const data = snap.data() || {};
    const cols = Array.isArray(data.columns) ? data.columns.slice() : [];
    const remove = new Set(datesToRemove);
    const kept = cols.filter((c) => !remove.has(c));
    if (kept.length !== cols.length) {
      await updateDoc(monthRef, { columns: kept });
    }
    return { keptColumns: kept };
  };

  const confirmDelete = async () => {
    if (!selected.size) {
      setDelOpen(false);
      return;
    }
    try {
      const dates = Array.from(selected).sort();

      // 1) Delete week docs
      if (typeof bulkDeleteWeekDocs === "function") {
        await bulkDeleteWeekDocs(month, dates);
      } else {
        // Fallback: manual delete each week doc if helper not present
        const batch = await Promise.all(
          dates.map(async (d) => {
            const ref = doc(db, `level10/${month}/weeks/${d}`);
            // dynamic import to keep tree small if not needed
            const { deleteDoc } = await import("firebase/firestore");
            return deleteDoc(ref);
          })
        );
        void batch;
      }

      // 2) Prune the header columns in the month doc so the date disappears
      const { keptColumns } = await pruneMonthColumns(month, dates);

      // If current meetingDate was deleted, nudge it to the most recent remaining column (or today)
      if (dates.includes(meetingDate)) {
        const fallback = keptColumns.length ? keptColumns[keptColumns.length - 1] : ymd(new Date());
        setMeetingDate(fallback);
        setMonth(fallback.slice(0, 7));
      }

      setToast({
        open: true,
        type: "success",
        msg: `Deleted ${dates.length} column${dates.length > 1 ? "s" : ""}.`,
      });

      // Update dialog list instantly
      setAvailableWeeks((prev) => prev.filter((d) => !selected.has(d)));
      setSelected(new Set());
      setDelOpen(false);

      // Notify parent to reload month/columns table
      onDeleted && onDeleted(dates);
    } catch (e) {
      setToast({ open: true, type: "error", msg: `Delete failed: ${e.message}` });
    }
  };

  return (
    <>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        {/* Month selector */}
        <TextField
          type="month"
          label="Month"
          size="small"
          value={month}
          onChange={handleMonthChange}
          InputLabelProps={{ shrink: true }}
        />

        {/* Meeting date selector */}
        <TextField
          type="date"
          label="Meeting Date"
          size="small"
          value={meetingDate}
          onChange={(e) => setMeetingDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />

        {/* Weekly nudge */}
        <Tooltip title="Previous Meeting (−1 week)">
          <IconButton onClick={prevWeek}>
            <ChevronLeft />
          </IconButton>
        </Tooltip>
        <Tooltip title="Next Meeting (+1 week)">
          <IconButton onClick={nextWeek}>
            <ChevronRight />
          </IconButton>
        </Tooltip>

        {/* Populate / Run */}
        <Box sx={{ ml: { xs: 0, sm: 1 } }}>
          <Tooltip title="Populate auto metrics for the selected Meeting Date">
            <Button
              size="small"
              variant="contained"
              startIcon={<BoltIcon />}
              onClick={onPopulateWeek}
              sx={{ mr: 1 }}
            >
              Populate Week
            </Button>
          </Tooltip>

          {onRunToday && (
            <Tooltip title="Set Meeting Date to today and populate">
              <Button
                size="small"
                variant="outlined"
                startIcon={<TodayIcon />}
                onClick={onRunToday}
              >
                Run Today
              </Button>
            </Tooltip>
          )}
        </Box>

        {/* Multi-delete */}
        <Tooltip title="Delete one or more existing columns for this month">
          <Button
            size="small"
            color="error"
            variant="outlined"
            startIcon={<DeleteSweepIcon />}
            onClick={openDeleteDialog}
            sx={{ ml: { xs: 0, sm: 1 } }}
          >
            Delete Columns
          </Button>
        </Tooltip>
      </Stack>

      {/* Delete Columns dialog */}
      <Dialog open={delOpen} onClose={() => setDelOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete Columns ({month})</DialogTitle>
        <DialogContent dividers>
          {loadingWeeks ? (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={28} />
            </Stack>
          ) : availableWeeks.length === 0 ? (
            <Box sx={{ color: "text.secondary", py: 1 }}>No columns found for this month.</Box>
          ) : (
            <>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <Button size="small" onClick={selectAll}>Select All</Button>
                <Button size="small" onClick={clearAll}>Clear</Button>
              </Stack>
              <List dense>
                {availableWeeks.map((id) => {
                  const checked = selected.has(id);
                  return (
                    <ListItem
                      key={id}
                      secondaryAction={
                        <Checkbox
                          edge="end"
                          onChange={() => toggleSelect(id)}
                          checked={checked}
                        />
                      }
                      disablePadding
                      onClick={() => toggleSelect(id)}
                      sx={{ cursor: "pointer" }}
                    >
                      <ListItemIcon>
                        <Checkbox edge="start" checked={checked} tabIndex={-1} disableRipple />
                      </ListItemIcon>
                      <ListItemText primary={fmtNice(id)} secondary={id} />
                    </ListItem>
                  );
                })}
              </List>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelOpen(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={confirmDelete}
            disabled={loadingWeeks || selected.size === 0}
          >
            Delete Selected
          </Button>
        </DialogActions>
      </Dialog>

      {/* Micro toast */}
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
    </>
  );
}