// src/admin/UserManagement.jsx
// Users & roles (admins): add people, set what they can do, disable or remove access.
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, Avatar, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment,
  MenuItem, Snackbar, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import EditRounded from "@mui/icons-material/EditRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import LockResetRounded from "@mui/icons-material/LockResetRounded";
import BlockRounded from "@mui/icons-material/BlockRounded";
import CheckCircleOutlineRounded from "@mui/icons-material/CheckCircleOutlineRounded";
import PersonAddAlt1Rounded from "@mui/icons-material/PersonAddAlt1Rounded";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import { useSearchParams } from "react-router-dom";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { sendPasswordResetEmail } from "firebase/auth";
import db, { app, auth } from "../firebase";
import { useAuth } from "../auth/useAuth";
import { ROLE_LABELS, ROLE_HELP, roleOf, BYPASS_EMAIL } from "../auth/permissions";
import { PageHeader, Section } from "../ui/kit";
import { parseDate } from "../utils/dates";

const ROLE_OPTIONS = ["basic", "editor", "lead", "admin"];
const ROLE_COLOR = { basic: "default", editor: "primary", lead: "success", admin: "secondary", master: "secondary" };
const nameOf = (u) => [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name || "";

export default function UserManagement() {
  const { user: me } = useAuth();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(null);
  const [invite, setInvite] = useState(params.get("invite") ? { name: "", email: "", role: "editor" } : null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(null);
  const [toast, setToast] = useState(null);
  const call = (name, data) => httpsCallable(getFunctions(app), name)(data);

  useEffect(() => {
    getDocs(collection(db, "users"))
      .then((snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((e) => {
        console.error(e);
        setRows([]);
        setToast({ type: "error", msg: "Could not load users." });
      });
  }, []);

  const sorted = useMemo(() => (rows || []).slice().sort((a, b) => ROLE_OPTIONS.indexOf(roleOf(b)) - ROLE_OPTIONS.indexOf(roleOf(a)) || nameOf(a).localeCompare(nameOf(b))), [rows]);
  const isOwner = (r) => String(r.email || "").toLowerCase() === BYPASS_EMAIL;

  const saveEdit = async () => {
    const [firstName, ...rest] = edit.name.trim().split(" ");
    const patch = { name: edit.name.trim(), firstName: firstName || "", lastName: rest.join(" "), role: edit.role, updatedAt: new Date().toISOString() };
    try {
      await updateDoc(doc(db, "users", edit.id), patch);
      setRows((p) => p.map((r) => (r.id === edit.id ? { ...r, ...patch } : r)));
      setEdit(null);
      setToast({ type: "success", msg: "Saved. The change applies the next time they open the app." });
    } catch (e) {
      setToast({ type: "error", msg: e.message || "Could not save." });
    }
  };

  const toggleDisabled = async (r) => {
    const disabled = !r.disabled;
    if (disabled && !window.confirm(`Turn off access for ${nameOf(r) || r.email}? They will be signed out and cannot sign in until you turn it back on.`)) return;
    await updateDoc(doc(db, "users", r.id), { disabled });
    setRows((p) => p.map((x) => (x.id === r.id ? { ...x, disabled } : x)));
    setToast({ type: "success", msg: disabled ? "Access turned off." : "Access turned back on." });
  };

  const resetPassword = async (r) => {
    try {
      await sendPasswordResetEmail(auth, r.email);
      setToast({ type: "success", msg: `Password reset email sent to ${r.email}.` });
    } catch (e) {
      setToast({ type: "error", msg: e.message || "Could not send the email." });
    }
  };

  const sendInvite = async () => {
    if (!/\S+@\S+\.\S+/.test(invite.email)) return setToast({ type: "error", msg: "Enter a valid email." });
    setBusy(true);
    try {
      const { data } = await call("inviteUser", { name: invite.name, email: invite.email, role: invite.role });
      setRows((p) => [...p, { id: data.uid, name: invite.name, email: invite.email.toLowerCase(), role: invite.role, disabled: false, createdAt: new Date() }]);
      setLink({ email: invite.email, url: data.setPasswordLink });
      setInvite(null);
      if (params.get("invite")) setParams({}, { replace: true });
    } catch (e) {
      setToast({ type: "error", msg: e.message || "Could not add the user." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Permanently delete ${nameOf(r) || r.email}'s account? This cannot be undone. (To pause access instead, use "Turn off access".)`)) return;
    try {
      await call("deleteUser", { uid: r.id });
      setRows((p) => p.filter((x) => x.id !== r.id));
      setToast({ type: "success", msg: "Account deleted." });
    } catch (e) {
      setToast({ type: "error", msg: e.message || "Could not delete." });
    }
  };

  return (
    <Box>
      <PageHeader
        title="Users & roles"
        subtitle="Who can use the app and what each person can do."
        actions={
          <Button variant="contained" startIcon={<PersonAddAlt1Rounded />} onClick={() => setInvite({ name: "", email: "", role: "editor" })}>
            Add a person
          </Button>
        }
      />

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "3fr 1fr" } }}>
        <Section title="People" pad={false}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Person</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Access</TableCell>
                  <TableCell>Added</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows === null && (
                  <TableRow><TableCell colSpan={5}>Loading…</TableCell></TableRow>
                )}
                {sorted.map((r) => {
                  const role = roleOf(r);
                  const self = r.id === me?.uid;
                  return (
                    <TableRow key={r.id} hover sx={{ opacity: r.disabled ? 0.55 : 1 }}>
                      <TableCell>
                        <Stack direction="row" spacing={1.25} alignItems="center">
                          <Avatar src={r.profileImageURL} sx={{ width: 32, height: 32, fontSize: 13, bgcolor: "primary.main" }}>{(nameOf(r) || r.email || "?").slice(0, 1).toUpperCase()}</Avatar>
                          <Box>
                            <Typography fontWeight={700} fontSize={14}>{nameOf(r) || "(no name yet)"}{self ? " (you)" : ""}</Typography>
                            <Typography variant="caption" color="text.secondary">{r.email}</Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Tooltip title={ROLE_HELP[role]}>
                          <Chip size="small" label={ROLE_LABELS[role]} color={ROLE_COLOR[role]} variant={role === "basic" ? "outlined" : "filled"} />
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" label={r.disabled ? "Turned off" : "Active"} color={r.disabled ? "warning" : "success"} />
                      </TableCell>
                      <TableCell>{parseDate(r.createdAt)?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) || "—"}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        <Tooltip title="Edit name and role">
                          <span>
                            <IconButton size="small" disabled={isOwner(r)} onClick={() => setEdit({ id: r.id, name: nameOf(r), role: role === "master" ? "admin" : role })}>
                              <EditRounded fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Email a password reset link">
                          <IconButton size="small" onClick={() => resetPassword(r)}>
                            <LockResetRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={r.disabled ? "Turn access back on" : "Turn off access"}>
                          <span>
                            <IconButton size="small" disabled={self || isOwner(r)} onClick={() => toggleDisabled(r)}>
                              {r.disabled ? <CheckCircleOutlineRounded fontSize="small" /> : <BlockRounded fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Delete account">
                          <span>
                            <IconButton size="small" color="error" disabled={self || isOwner(r)} onClick={() => remove(r)}>
                              <DeleteOutlineRounded fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Section>

        <Section title="What each role can do">
          <Stack spacing={1.5}>
            {ROLE_OPTIONS.map((r) => (
              <Box key={r}>
                <Chip size="small" label={ROLE_LABELS[r]} color={ROLE_COLOR[r]} variant={r === "basic" ? "outlined" : "filled"} />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{ROLE_HELP[r]}</Typography>
              </Box>
            ))}
          </Stack>
        </Section>
      </Box>

      {/* Edit */}
      <Dialog open={!!edit} onClose={() => setEdit(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit person</DialogTitle>
        <DialogContent dividers>
          {edit && (
            <Stack spacing={2}>
              <TextField label="Full name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} fullWidth />
              <TextField select label="Role" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} helperText={ROLE_HELP[edit.role]} fullWidth>
                {ROLE_OPTIONS.map((r) => <MenuItem key={r} value={r}>{ROLE_LABELS[r]}</MenuItem>)}
              </TextField>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEdit(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveEdit}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Invite */}
      <Dialog open={!!invite} onClose={() => !busy && setInvite(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Add a person</DialogTitle>
        <DialogContent dividers>
          {invite && (
            <Stack spacing={2}>
              <TextField label="Full name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} fullWidth autoFocus />
              <TextField label="Work email" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} fullWidth />
              <TextField select label="Role" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })} helperText={ROLE_HELP[invite.role]} fullWidth>
                {ROLE_OPTIONS.map((r) => <MenuItem key={r} value={r}>{ROLE_LABELS[r]}</MenuItem>)}
              </TextField>
              <Alert severity="info" variant="outlined">You will get a link for them to set their password. Send it to them yourself.</Alert>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvite(null)} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={sendInvite} disabled={busy}>{busy ? "Adding…" : "Add person"}</Button>
        </DialogActions>
      </Dialog>

      {/* Set-password link */}
      <Dialog open={!!link} onClose={() => setLink(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Account created</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ mb: 2 }}>Send this link to <b>{link?.email}</b> so they can set their password and sign in:</Typography>
          <TextField
            value={link?.url || ""}
            fullWidth
            InputProps={{
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => navigator.clipboard.writeText(link.url).then(() => setToast({ type: "success", msg: "Link copied." }))}>
                    <ContentCopyRounded />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setLink(null)}>Done</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {toast ? <Alert severity={toast.type} variant="filled">{toast.msg}</Alert> : <span />}
      </Snackbar>
    </Box>
  );
}
