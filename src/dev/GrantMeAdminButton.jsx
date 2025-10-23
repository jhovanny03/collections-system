// src/dev/GrantMeAdminButton.jsx
import React from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { getAuth } from "firebase/auth";

export default function GrantMeAdminButton() {
  const onClick = async () => {
    try {
      const auth = getAuth();
      if (!auth.currentUser) return alert("Sign in first.");

      await auth.currentUser.getIdToken(true);
      const grantAdmin = httpsCallable(functions, "grantAdmin");
      const res = await grantAdmin({ email: "YOUR_EMAIL@rahmanlawpllc.com" }); // <- your login email
      alert("Admin claim granted. Sign out and sign back in.");
      console.log(res.data);
    } catch (e) {
      console.error(e);
      alert(e.message || e.code || "Error");
    }
  };
  return <button onClick={onClick}>Grant me Admin (one-time)</button>;
}