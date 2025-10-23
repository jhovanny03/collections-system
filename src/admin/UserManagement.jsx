// src/admin/UserManagement.jsx
import React, { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardHeader,
  CardContent,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Button,
  Stack,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Snackbar,
  Alert,
  Tooltip,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import LockResetIcon from "@mui/icons-material/LockReset";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import PersonAddAlt1Icon from "@mui/icons-material/PersonAddAlt1";

import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import db from "../firebase";

// Optional services
import { authService } from "../services/authService";
import { userService } from "../services/userService";

// ✅ Singletons from firebase.js
import { auth } from "../firebase";
import { sendPasswordResetEmail } from "firebase/auth";

const ROLE_OPTIONS = ["admin", "editor", "basic"];

// 🌐 Your HTTP Function endpoints
const INVITE_ENDPOINT =
  "https://us-central1-collectionsapp-7d351.cloudfunctions.net/inviteUserHttp";
const DELETE_ENDPOINT =
  "https://us-central1-collectionsapp-7d351.cloudfunctions.net/deleteUserHttp";

function fmt(d) {
  if (!d) return "—";
  try {
    const date = d?.toDate ? d.toDate() : new Date(d);
    return isNaN(date) ? "—" : date.toLocaleString();
  } catch {
    return "—";
  }
}

export default function UserManagement() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);

  const [toast, setToast] = useState({ open: false, type: "success", msg: "" });

  // Invite dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("basic");
  const [inviting, setInviting] = useState(false);

  // Load users
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRows(list);
      } catch (e) {
        console.error(e);
        setToast({ open: true, type: "error", msg: "Error loading users" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openEdit = (row) => {
    setEditRow({
      id: row.id,
      name: row.name || "",
      email: row.email || "",
      role: row.role || "basic",
      disabled: !!row.disabled,
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!editRow) return;
    try {
      await updateDoc(doc(db, "users", editRow.id), {
        name: editRow.name,
        email: editRow.email,
        role: editRow.role,
        disabled: !!editRow.disabled,
        updatedAt: new Date().toISOString(),
      });

      setRows((prev) =>
        prev.map((r) => (r.id === editRow.id ? { ...r, ...editRow } : r))
      );
      setToast({ open: true, type: "success", msg: "User updated" });
      setEditOpen(false);
    } catch (e) {
      console.error(e);
      setToast({ open: true, type: "error", msg: "Update failed" });
    }
  };

  const handleResetPassword = async (email) => {
    try {
      if (authService?.sendPasswordReset) {
        await authService.sendPasswordReset(email);
      } else {
        await sendPasswordResetEmail(auth, email);
      }
      setToast({ open: true, type: "success", msg: "Reset email sent" });
    } catch (e) {
      console.error(e);
      setToast({ open: true, type: "error", msg: "Failed to send reset email" });
    }
  };

  const handleToggleDisabled = async (row) => {
    try {
      const newVal = !row.disabled;
      await updateDoc(doc(db, "users", row.id), { disabled: newVal });
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, disabled: newVal } : r))
      );
      setToast({
        open: true,
        type: "success",
        msg: newVal ? "User disabled" : "User enabled",
      });
    } catch (e) {
      console.error(e);
      setToast({ open: true, type: "error", msg: "Operation failed" });
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete ${row.name || row.email}?`)) return;
    try {
      if (!auth.currentUser) {
        setToast({ open: true, type: "error", msg: "You must be signed in." });
        return;
      }
      // Refresh token so server sees latest claims
      const idToken = await auth.currentUser.getIdToken(true);

      // 🔁 Call backend to delete from Auth + Firestore
      const resp = await fetch(DELETE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ uid: row.id }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      // Update UI
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setToast({ open: true, type: "success", msg: "User deleted" });
    } catch (e) {
      console.error(e);
      const msg =
        e?.message?.includes("Admins only") ? "Only admins can delete users"
        : e?.message || "Delete failed";
      setToast({ open: true, type: "error", msg });
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail || !/\S+@\S+\.\S+/.test(inviteEmail)) {
      setToast({ open: true, type: "error", msg: "Enter a valid email" });
      return;
    }
    try {
      setInviting(true);

      if (!auth.currentUser) {
        setToast({ open: true, type: "error", msg: "You must be signed in." });
        setInviting(false);
        return;
      }

      // Fresh token so server sees latest claims (role=admin)
      const idToken = await auth.currentUser.getIdToken(true);

      const resp = await fetch(INVITE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          email: inviteEmail.trim().toLowerCase(),
          displayName: inviteName.trim(),
          role: inviteRole,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      const data = await resp.json(); // { uid, resetLink, verifyLink }

      setToast({ open: true, type: "success", msg: "Invite created. Email links generated." });

      // Optimistic UI
      setRows((prev) => [
        ...prev,
        {
          id: data.uid,
          name: inviteName.trim(),
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
          disabled: false,
          createdAt: new Date(),
        },
      ]);

      // reset dialog
      setInviteName("");
      setInviteEmail("");
      setInviteRole("basic");
      setInviteOpen(false);

      console.log("Invite links:", data);
    } catch (e) {
      console.error(e);
      const msg =
        e?.message?.includes("Admins only") ? "Only admins can invite users"
        : e?.message?.includes("already exists") ? "A user with this email already exists"
        : e?.message || "Invite failed";
      setToast({ open: true, type: "error", msg });
    } finally {
      setInviting(false);
    }
  };

  return (
    <Card elevation={0} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
      <CardHeader
        title="Employee Management"
        subheader="View, invite, and edit users"
        action={
          <Button
            variant="contained"
            startIcon={<PersonAddAlt1Icon />}
            onClick={() => setInviteOpen(true)}
          >
            Invite Employee
          </Button>
        }
      />
      <CardContent>
        {loading ? (
          "Loading users…"
        ) : (
          <Box sx={{ width: "100%", overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Name</strong></TableCell>
                  <TableCell><strong>Email</strong></TableCell>
                  <TableCell><strong>Role</strong></TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{r.name || "—"}</TableCell>
                    <TableCell>{r.email || "—"}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={r.role || "basic"}
                        color={r.role === "admin" ? "primary" : r.role === "editor" ? "secondary" : "default"}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={r.disabled ? "Disabled" : "Active"}
                        color={r.disabled ? "warning" : "success"}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{fmt(r.createdAt)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(r)}>
                          <EditIcon fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Reset password">
                        <IconButton size="small" onClick={() => handleResetPassword(r.email)}>
                          <LockResetIcon fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={r.disabled ? "Enable" : "Disable"}>
                        <IconButton size="small" onClick={() => handleToggleDisabled(r)}>
                          <PowerSettingsNewIcon fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          sx={{ color: "error.main" }}
                          onClick={() => handleDelete(r)}
                        >
                          <DeleteIcon fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">No users</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        )}
      </CardContent>

      {/* Edit dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit employee</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={editRow?.name || ""}
              onChange={(e) => setEditRow((s) => ({ ...s, name: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Email"
              value={editRow?.email || ""}
              onChange={(e) => setEditRow((s) => ({ ...s, email: e.target.value }))}
              fullWidth
            />
            <TextField
              select
              label="Role"
              value={editRow?.role || "basic"}
              onChange={(e) => setEditRow((s) => ({ ...s, role: e.target.value }))}
              fullWidth
            >
              {ROLE_OPTIONS.map((r) => (
                <MenuItem key={r} value={r}>{r}</MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Invite employee</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Full name"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              fullWidth
            />
            <TextField
              label="Email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              fullWidth
            />
            <TextField
              select
              label="Role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              fullWidth
            >
              {ROLE_OPTIONS.map((r) => (
                <MenuItem key={r} value={r}>{r}</MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviteOpen(false)} disabled={inviting}>Cancel</Button>
          <Button variant="contained" onClick={handleInvite} disabled={inviting}>
            {inviting ? "Inviting…" : "Send Invite"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={toast.type} variant="filled" sx={{ width: "100%" }}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Card>
  );
}