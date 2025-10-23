import React, { useEffect } from "react";
import { Button, Card, CardContent, Typography, Box } from "@mui/material";
import { CheckCircle } from "@mui/icons-material";

export default function Welcome() {
  useEffect(() => {
    // Default timezone always America/New_York
    localStorage.setItem("timezone", "America/New_York");
  }, []);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        backgroundColor: "#f6f7fb",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 2,
      }}
    >
      <Card
        sx={{
          maxWidth: 480,
          width: "100%",
          borderRadius: 3,
          boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
        }}
      >
        <CardContent sx={{ textAlign: "center", padding: "40px 30px" }}>
          <Box
            component="img"
            src="http://cdn.mcauto-images-production.sendgrid.net/d47fa05d4bc12ffd/7c9fb1e8-3ceb-4cc5-a487-21e1efb41c86/2550x585.png"
            alt="Rahman Law Banner"
            sx={{
              width: "100%",
              borderRadius: "10px",
              marginBottom: 3,
            }}
          />

          <CheckCircle sx={{ fontSize: 48, color: "#0B5CAD", mb: 1 }} />
          <Typography variant="h5" fontWeight={600} gutterBottom>
            Welcome to Rahman Law Collections
          </Typography>

          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mb: 3, lineHeight: 1.6 }}
          >
            Your account has been successfully created. Please verify your email
            to get started or proceed to login if you’ve already done so.
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Button
              variant="contained"
              href="/verify"
              sx={{
                backgroundColor: "#0B5CAD",
                "&:hover": { backgroundColor: "#094b8b" },
                textTransform: "none",
                fontWeight: 600,
                fontSize: 15,
              }}
            >
              Verify My Email
            </Button>

            <Button
              variant="outlined"
              href="/login"
              sx={{
                color: "#0B5CAD",
                borderColor: "#0B5CAD",
                textTransform: "none",
                fontWeight: 600,
                fontSize: 15,
                "&:hover": {
                  borderColor: "#094b8b",
                  color: "#094b8b",
                },
              }}
            >
              Go to Login
            </Button>
          </Box>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 4, display: "block" }}
          >
            © {new Date().getFullYear()} The Law Firm of Moumita Rahman PLLC. All rights reserved.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}