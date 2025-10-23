// src/pages/Profile.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardHeader,
  CardContent,
  Stack,
  Avatar,
  Button,
  TextField,
  Divider,
  Typography,
  Snackbar,
  Alert,
} from "@mui/material";
import PhotoCameraRounded from "@mui/icons-material/PhotoCameraRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";

import { useAuth } from "../auth/useAuth";
import db from "../firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import {
  getAuth,
  updateProfile as fbUpdateProfile,
} from "firebase/auth";

import { authService } from "../services/authService";
import { getUserProfile, updateUserProfile, uploadProfileImage } from "../services/userService";

export default function Profile() {
  const { user } = useAuth(); // debe traer uid, email, photoURL
  const auth = getAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Perfil básico
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState(""); // mostrado solo lectura por ahora
  const [photoURL, setPhotoURL] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");

  // Password
  const [isPasswordProvider, setIsPasswordProvider] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);

  const [toast, setToast] = useState({ open: false, type: "success", msg: "" });

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      try {
        setLoading(true);
        // Cargar Auth
        setDisplayName(user.displayName || user.name || "");
        setEmail(user.email || "");
        setPhotoURL(user.photoURL || "");

        // Cargar Firestore (si quieres sincronizar más campos)
        const fs = await getUserProfile(user.uid); // tu service (devuelve {} si no existe)
        if (fs?.name && !displayName) setDisplayName(fs.name);
        if (fs?.profileImageURL && !photoURL) setPhotoURL(fs.profileImageURL);

        // Detectar proveedores
        const providers = auth.currentUser?.providerData || [];
        setIsPasswordProvider(providers.some(p => p.providerId === "password"));
      } catch (e) {
        console.error(e);
        setToast({ open: true, type: "error", msg: "Error loading profile" });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const onPickImage = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
  };

  const handleSaveProfile = async () => {
    if (!user?.uid) return;
    try {
      setSaving(true);

      // 1) si hay foto nueva -> subir a Storage y obtener URL pública
      let newPhotoURL = photoURL;
      if (file) {
        newPhotoURL = await uploadProfileImage(user.uid, file); // service
      }

      // 2) Actualizar Auth profile (nombre + foto)
      await fbUpdateProfile(auth.currentUser, {
        displayName: displayName || "",
        photoURL: newPhotoURL || null,
      });

      // 3) Actualizar Firestore (doc /users/{uid})
      await updateUserProfile(user.uid, {
        name: displayName || "",
        profileImageURL: newPhotoURL || "",
        updatedAt: serverTimestamp(),
      });

      // 4) Reset preview
      setPhotoURL(newPhotoURL);
      setFile(null);
      setPreview("");

      setToast({ open: true, type: "success", msg: "Profile updated" });
    } catch (e) {
      console.error(e);
      setToast({ open: true, type: "error", msg: "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!isPasswordProvider) {
      setToast({ open: true, type: "error", msg: "Password change not available for this provider" });
      return;
    }
    if (!currentPwd || !newPwd || !newPwd2) {
      setToast({ open: true, type: "error", msg: "Fill all password fields" });
      return;
    }
    if (newPwd !== newPwd2) {
      setToast({ open: true, type: "error", msg: "New passwords do not match" });
      return;
    }

    try {
      setPwdSaving(true);
      // reauth + update
      await authService.reauthWithPassword(user.email, currentPwd);
      await authService.updateUserPassword(newPwd);
      setCurrentPwd("");
      setNewPwd("");
      setNewPwd2("");
      setToast({ open: true, type: "success", msg: "Password changed" });
    } catch (e) {
      console.error(e);
      const msg =
        e?.code === "auth/wrong-password" ? "Wrong current password" :
        e?.code === "auth/weak-password" ? "Weak new password" :
        e?.code === "auth/requires-recent-login" ? "Reauthentication required" :
        "Password change failed";
      setToast({ open: true, type: "error", msg });
    } finally {
      setPwdSaving(false);
    }
  };

  if (loading) return "Loading profile…";

  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
      <CardHeader title="My Profile" subheader="Update your personal information" />
      <CardContent>
        <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems="center">
          <Box sx={{ position: "relative" }}>
            <Avatar
              src={preview || photoURL}
              alt={displayName || email}
              sx={{ width: 104, height: 104, boxShadow: 1 }}
            />
            <Button
              component="label"
              size="small"
              startIcon={<PhotoCameraRounded />}
              sx={{ mt: 1 }}
            >
              Change photo
              <input type="file" accept="image/*" hidden onChange={onPickImage} />
            </Button>
          </Box>

          <Box sx={{ flex: 1, width: "100%" }}>
            <Stack spacing={2}>
              <TextField
                label="Full name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                fullWidth
              />
              <TextField
                label="Email"
                value={email}
                fullWidth
                InputProps={{ readOnly: true }}
                helperText="Email changes require security review (disabled here)."
              />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  startIcon={<SaveRounded />}
                  onClick={handleSaveProfile}
                  disabled={saving}
                >
                  Save profile
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Stack>

        <Divider sx={{ my: 3 }} />

        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Security
        </Typography>

        {isPasswordProvider ? (
          <Stack spacing={2} sx={{ maxWidth: 420 }}>
            <TextField
              type="password"
              label="Current password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
            />
            <TextField
              type="password"
              label="New password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
            />
            <TextField
              type="password"
              label="Confirm new password"
              value={newPwd2}
              onChange={(e) => setNewPwd2(e.target.value)}
            />
            <Button
              variant="outlined"
              startIcon={<LockRounded />}
              onClick={handleChangePassword}
              disabled={pwdSaving}
            >
              Change password
            </Button>
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Your account uses a federated provider (e.g., Google). Password changes are not available.
          </Typography>
        )}
      </CardContent>

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
