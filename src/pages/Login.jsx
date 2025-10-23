// src/pages/Login.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Link,
  Stack,
  Alert,
  CircularProgress,
  IconButton,
  InputAdornment,
  Grow,
  GlobalStyles,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { useAuth } from "../auth/useAuth";

// ✅ Assets
import loginBg from "../assets/login-bg.png";
import verticalLogo from "../assets/Vertical Logo ENG.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Login error:", err);
      setError("Invalid email or password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box
      sx={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundImage: `linear-gradient(
          rgba(11, 24, 48, 0.65),
          rgba(0, 0, 0, 0.65)
        ), url(${loginBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* ✅ Fix autofill styling globally */}
      <GlobalStyles
        styles={{
          "input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus, textarea:-webkit-autofill, select:-webkit-autofill":
            {
              WebkitTextFillColor: "#fff",
              WebkitBoxShadow:
                "0 0 0px 1000px rgba(255,255,255,0.08) inset !important",
              transition: "background-color 9999s ease-in-out 0s",
              caretColor: "#fff",
            },
        }}
      />

      <Grow in timeout={500}>
        <Paper
          elevation={8}
          sx={{
            width: 420,
            maxWidth: "92vw",
            p: 4,
            borderRadius: 3,
            background: "rgba(255, 255, 255, 0.08)",
            backdropFilter: "blur(12px)",
            border: "2px solid transparent",
            backgroundClip: "padding-box",
            position: "relative",
            color: "#fff",
            boxShadow: "0 8px 40px rgba(0, 0, 0, 0.35)",
            "&::before": {
              content: '""',
              position: "absolute",
              inset: 0,
              borderRadius: 3,
              padding: "2px",
              background:
                "linear-gradient(135deg, #0b3a75 0%, #00a693 50%, #d44500 100%)",
              WebkitMask:
                "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
              pointerEvents: "none",
            },
          }}
        >
          {/* Brand */}
          <Stack alignItems="center" spacing={2} sx={{ mb: 2 }}>
            <Box
              component="img"
              src={verticalLogo}
              alt="Rahman Law Vertical Logo"
              sx={{
                width: 120,
                height: "auto",
                objectFit: "contain",
                filter:
                  "brightness(1.3) drop-shadow(0 0 10px rgba(255,255,255,0.6))",
              }}
            />

            <Typography
              variant="h6"
              fontWeight={700}
              sx={{
                letterSpacing: 0.5,
                color: "#ffffff",
                textAlign: "center",
                mt: 1,
              }}
            >
              Sign in to your account
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "rgba(255,255,255,0.8)",
                textAlign: "center",
                mb: 1,
              }}
            >
              Access Rahman Law Collections
            </Typography>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mt: 1, mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate autoComplete="off">
            <Stack spacing={2}>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                fullWidth
                size="medium"
                InputLabelProps={{ style: { color: "#fff" } }}
                InputProps={{
                  style: { color: "#fff" },
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(255,255,255,0.08)",
                    "& fieldset": {
                      borderColor: "rgba(255,255,255,0.25)",
                    },
                    "&:hover fieldset": {
                      borderColor: "rgba(255,255,255,0.4)",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "#00a693",
                    },
                  },
                }}
              />

              <TextField
                label="Password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                fullWidth
                size="medium"
                InputLabelProps={{ style: { color: "#fff" } }}
                InputProps={{
                  style: { color: "#fff" },
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showPw ? "Hide password" : "Show password"}
                        onClick={() => setShowPw((s) => !s)}
                        edge="end"
                        sx={{ color: "#fff" }}
                      >
                        {showPw ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(255,255,255,0.08)",
                    "& fieldset": {
                      borderColor: "rgba(255,255,255,0.25)",
                    },
                    "&:hover fieldset": {
                      borderColor: "rgba(255,255,255,0.4)",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "#00a693",
                    },
                  },
                }}
              />

              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
              >
                <Link
                  component="button"
                  variant="body2"
                  onClick={() => navigate("/action?mode=resetPassword")}
                  sx={{ color: "#fff", opacity: 0.8, textTransform: "none" }}
                >
                  Reset password
                </Link>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={submitting}
                  sx={{
                    minWidth: 120,
                    textTransform: "none",
                    fontWeight: 700,
                    px: 3,
                    bgcolor: "#00a693",
                    "&:hover": { bgcolor: "#008f81" },
                  }}
                >
                  {submitting ? (
                    <Stack direction="row" gap={1} alignItems="center">
                      <CircularProgress size={18} color="inherit" />
                      <span>Signing in…</span>
                    </Stack>
                  ) : (
                    "Login"
                  )}
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Paper>
      </Grow>
    </Box>
  );
}