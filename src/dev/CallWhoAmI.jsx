// src/dev/CallWhoAmI.jsx
import React from "react";
import { Button } from "@mui/material";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../firebase";

export default function CallWhoAmI() {
  const onClick = async () => {
    try {
      if (!auth.currentUser) return alert("Not signed in here.");
      await auth.currentUser.getIdToken(true); // force refresh
      const fn = httpsCallable(functions, "whoAmI");
      const { data } = await fn({});
      alert(`Server sees -> uid: ${data.uid}, role: ${data.role}, email: ${data.email}`);
      console.log("whoAmI (server):", data);
    } catch (e) {
      console.error(e);
      alert(e?.message || e?.code || "whoAmI failed");
    }
  };
  return (
    <Button variant="outlined" onClick={onClick} sx={{ mb: 2 }}>
      Test function auth (server whoAmI)
    </Button>
  );
}