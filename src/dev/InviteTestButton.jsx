// src/dev/InviteTestButton.jsx
import React from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

export default function InviteTestButton() {
  const handleClick = async () => {
    try {
      const inviteUser = httpsCallable(functions, "inviteUser");
      const res = await inviteUser({
        email: "testemployee@rahmanlawpllc.com", // change to your test email
        displayName: "Test Employee",
        role: "editor",
      });
      alert("Invite OK.\n\n" + JSON.stringify(res.data, null, 2));
      // res.data = { uid, resetLink, verifyLink }
      console.log("Invite response:", res.data);
    } catch (e) {
      console.error(e);
      alert(`Error: ${e.message || e.code || "Unknown error"}`);
    }
  };

  return (
    <button onClick={handleClick} style={{ padding: 10 }}>
      Test Invite User
    </button>
  );
}