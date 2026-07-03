import React, { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Stack,
} from "@mui/material";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  getAuth,
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
} from "firebase/auth";
import verticalLogo from "../assets/Vertical Logo ENG.png"; // ✅ your logo

const GENERATE_RESET_ENDPOINT =
  "https://us-central1-collectionsapp-7d351.cloudfunctions.net/generateResetLinkHttp";
const MIN_LEN = 6;

// 🎨 Brand colors
const FEDERAL_BLUE = "#0b3a75";
const PERSIAN_GREEN = "#00a693";

export default function ActionHandler() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const auth = getAuth();

  const mode = sp.get("mode");
  const oobCode = sp.get("oobCode");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [email, setEmail] = useState("");
  const [resetLink, setResetLink] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetDone, setResetDone] = useState(false);

  const tooShort = newPassword.length > 0 && newPassword.length < MIN_LEN;
  const mismatch =
    confirmPassword.length > 0 && confirmPassword !== newPassword;
  const canSubmit =
    !resetDone && !loading && !!oobCode && newPassword.length >= MIN_LEN && !mismatch;

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError("");
      setInfo("");
      setLoading(true);

      try {
        if (!mode || !oobCode) {
          setError("Invalid or missing action parameters.");
          return;
        }

        if (mode === "verifyEmail") {
          let emailFromCode = "";
          try {
            const check = await checkActionCode(auth, oobCode);
            emailFromCode = check?.data?.email || "";
            if (!cancelled) setEmail(emailFromCode);
          } catch {
            setError("This verification link is invalid or expired.");
            return;
          }

          try {
            await applyActionCode(auth, oobCode);
          } catch {
            setError("We couldn't verify your email. The link may be expired.");
            return;
          }

          try {
            const resp = await fetch(GENERATE_RESET_ENDPOINT, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: emailFromCode }),
            });
            if (!resp.ok) {
              const j = await resp.json().catch(() => ({}));
              throw new Error(j.error || `HTTP ${resp.status}`);
            }
            const { resetLink: rl } = await resp.json();
            if (!cancelled) {
              setResetLink(rl);
              setInfo("Email verified! Next, set your password.");
            }
          } catch {
            setError(
              "Email verified, but we couldn’t create a password link. Ask your admin to resend a reset email."
            );
            return;
          }
        }

        if (mode === "resetPassword") {
          setInfo("Enter a new password to complete the reset.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [mode, oobCode, auth]);

  async function handleDoReset(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (!oobCode) throw new Error("Missing reset code.");
      if (newPassword.length < MIN_LEN)
        throw new Error(`Password must be at least ${MIN_LEN} characters.`);
      if (newPassword !== confirmPassword)
        throw new Error("Passwords do not match.");

      await confirmPasswordReset(auth, oobCode, newPassword);
      setResetDone(true);
      setInfo("Password reset complete. Redirecting to login…");
      setTimeout(() => navigate("/login"), 3000);
    } catch (e) {
      setError(e?.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        backgroundImage: "linear-gradient(135deg, #0b3a75 0%, #00a693 100%)", // ✅ gradient only
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
      }}
    >
      <Card
        sx={{
          maxWidth: 540,
          width: "100%",
          borderRadius: 3,
          background: "#fff",
          boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
        }}
      >
        <CardContent sx={{ p: 4 }}>
          {/* ✅ Brand header with vertical logo */}
          <Stack alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
            <Box
              component="img"
              src={verticalLogo}
              alt="Rahman Law"
              sx={{
                height: 80,
                width: "auto",
                objectFit: "contain",
                filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.15))",
              }}
            />
          </Stack>

          <Typography
            variant="h5"
            fontWeight={800}
            sx={{
              mb: 1,
              color: FEDERAL_BLUE,
              letterSpacing: 0.2,
              textAlign: "center",
            }}
          >
            {mode === "verifyEmail" && "Verify your email"}
            {mode === "resetPassword" && "Reset your password"}
          </Typography>

          {loading && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2 }}>
              <CircularProgress size={20} />
              <Typography>Working…</Typography>
            </Box>
          )}

          {!loading && error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}

          {!loading && !error && info && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {info}
            </Alert>
          )}

          {/* ✅ After verify: show ONLY "Set Password" */}
          {!loading && !error && mode === "verifyEmail" && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
              <Button
                variant="contained"
                onClick={() => resetLink && (window.location.href = resetLink)}
                disabled={!resetLink}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  px: 3,
                  bgcolor: PERSIAN_GREEN,
                  "&:hover": { bgcolor: "#00877c" },
                }}
              >
                Set Password
              </Button>
            </Box>
          )}

          {/* Inline password reset */}
          {!loading && !error && mode === "resetPassword" && (
            <Box
              component="form"
              onSubmit={handleDoReset}
              sx={{ mt: 3, display: "grid", gap: 2 }}
            >
              <Typography variant="body2" color="text.secondary">
                Choose a strong password. Minimum {MIN_LEN} characters.
              </Typography>

              <TextField
                type="password"
                label="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                fullWidth
                error={tooShort}
                helperText={tooShort ? `Must be at least ${MIN_LEN} characters.` : " "}
              />
              <TextField
                type="password"
                label="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                fullWidth
                error={mismatch}
                helperText={mismatch ? "Passwords do not match." : " "}
              />

              <Button
                type="submit"
                variant="contained"
                disabled={!canSubmit}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  px: 3,
                  bgcolor: PERSIAN_GREEN,
                  "&:hover": { bgcolor: "#00877c" },
                }}
              >
                {resetDone ? "Password Updated" : "Update Password"}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}