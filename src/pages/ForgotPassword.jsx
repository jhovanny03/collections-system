// src/pages/ForgotPassword.jsx
import React, { useState } from "react";
import {
  Box,
  Paper,
  Stack,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
} from "@mui/material";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import verticalLogo from "../assets/Vertical Logo ENG.png";

// Brand colors (match ActionHandler)
const FEDERAL_BLUE = "#0b3a75";
const PERSIAN_GREEN = "#00a693";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const navigate = useNavigate();
  const auth = getAuth();

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    setSubmitting(true);
    try {
      const normalized = email.trim().toLowerCase();
      if (!normalized) throw new Error("Please enter your email.");
      await sendPasswordResetEmail(auth, normalized, {
        // Ensures the link returns to your app's handler
        url: `${window.location.origin}/action`,
        handleCodeInApp: true,
      });
      setMsg(
        "If this email exists, a reset link has been sent. Please check your inbox."
      );
    } catch (e) {
      // Friendly generic message (don’t leak existence of accounts)
      setErr("If this email exists, a reset link has been sent.");
      // Useful in console for debugging specific errors
      // eslint-disable-next-line no-console
      console.warn("sendPasswordResetEmail error:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        bgcolor: "#f7f9fb",
      }}
    >
      <Paper
        elevation={10}
        sx={{
          width: 420,
          maxWidth: "92vw",
          p: 4,
          borderRadius: 3,
          background: "#fff",
          boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
        }}
      >
        {/* Brand */}
        <Stack alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
          <Box
            component="img"
            src={verticalLogo}
            alt="Rahman Law"
            sx={{
              height: 72,
              width: "auto",
              objectFit: "contain",
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.15))",
            }}
          />
        </Stack>

        <Typography
          variant="h6"
          fontWeight={800}
          textAlign="center"
          sx={{ color: FEDERAL_BLUE }}
        >
          Reset your password
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          textAlign="center"
          sx={{ mt: 0.5 }}
        >
          Enter the email associated with your account.
        </Typography>

        {msg && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {msg}
          </Alert>
        )}
        {err && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {err}
          </Alert>
        )}

        <Box component="form" onSubmit={onSubmit} noValidate sx={{ mt: 3 }}>
          <Stack spacing={2}>
            <TextField
              label="Email"
              type="email"
              fullWidth
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              autoComplete="email"
            />

            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Button
                variant="text"
                onClick={() => navigate("/login")}
                sx={{ textTransform: "none" }}
              >
                Back to login
              </Button>

              <Button
                type="submit"
                variant="contained"
                disabled={submitting}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  px: 3,
                  bgcolor: PERSIAN_GREEN,
                  "&:hover": { bgcolor: "#00877c" },
                  minWidth: 160,
                }}
              >
                {submitting ? (
                  <Stack direction="row" alignItems="center" gap={1}>
                    <CircularProgress size={18} />
                    Sending…
                  </Stack>
                ) : (
                  "Send reset link"
                )}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}