import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Stack,
  Alert,
} from "@mui/material";
import { CheckCircle } from "@mui/icons-material";
import { motion } from "framer-motion";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import db from "../firebase";
import { useAuth } from "../auth/useAuth";

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    // If not logged in, send to login
    if (!user) navigate("/login", { replace: true });
  }, [user, navigate]);

  async function handleFinish(e) {
    e.preventDefault();
    setError("");

    if (!user?.uid) {
      setError("You must be signed in to complete onboarding.");
      return;
    }
    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }

    try {
      setSaving(true);
      await setDoc(
        doc(db, "users", user.uid),
        {
          name: fullName.trim(),
          phone: phone.trim() || "",
          onboardingCompleted: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Show success animation
      setFinished(true);

      // Redirect after 2 seconds
      const t = setTimeout(() => navigate("/dashboard", { replace: true }), 2000);
      return () => clearTimeout(t);
    } catch (e) {
      setError(e?.message || "Could not complete onboarding.");
    } finally {
      setSaving(false);
    }
  }

  if (finished) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "#f6f7fb",
          p: 2,
        }}
      >
        <Card sx={{ maxWidth: 460, width: "100%", borderRadius: 3 }}>
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ display: "inline-flex" }}
            >
              <CheckCircle sx={{ fontSize: 64, color: "#22c55e" }} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.35 }}
            >
              <Typography variant="h6" fontWeight={700} sx={{ mt: 2 }}>
                Setup complete! Welcome aboard.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Redirecting you to your dashboard…
              </Typography>
            </motion.div>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "#f6f7fb",
        p: 2,
      }}
    >
      <Card sx={{ maxWidth: 520, width: "100%", borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
            Welcome to Rahman Law Collections
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Just a couple quick details and you’ll be all set.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleFinish}>
            <Stack spacing={2.2}>
              <TextField
                label="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoFocus
                fullWidth
              />
              <TextField
                label="Phone (optional)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                fullWidth
              />

              {/* Timezone intentionally removed — default is America/New_York in your codebase */}

              <Button
                type="submit"
                variant="contained"
                disabled={saving}
                sx={{
                  py: 1.25,
                  textTransform: "none",
                  fontWeight: 700,
                  backgroundColor: "#0B5CAD",
                  "&:hover": { backgroundColor: "#094b8b" },
                }}
              >
                {saving ? "Saving…" : "Finish Setup"}
              </Button>
            </Stack>
          </form>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 3, display: "block", textAlign: "center" }}
          >
            © {new Date().getFullYear()} The Law Firm of Moumita Rahman PLLC. All rights reserved.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}