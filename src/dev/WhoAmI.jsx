// src/dev/WhoAmI.jsx
import React, { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { Box, Button, Typography } from "@mui/material";

export default function WhoAmI() {
  const [info, setInfo] = useState({ status: "Loading…" });

  async function load() {
    try {
      const auth = getAuth();
      if (!auth.currentUser) {
        setInfo({ error: "Not logged in" });
        return;
      }
      // Force refresh so we see the latest claims
      const token = await auth.currentUser.getIdTokenResult(true);
      setInfo({
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        claims: token.claims,
      });
    } catch (e) {
      setInfo({ error: e?.message || "Failed to load claims" });
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Box sx={{ p: 2, mb: 2, border: "1px dashed", borderColor: "divider", borderRadius: 1, bgcolor: "grey.50" }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Debug: Who am I?</Typography>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(info, null, 2)}</pre>
      <Button onClick={load} size="small" sx={{ mt: 1 }}>Refresh</Button>
    </Box>
  );
}