import React, { useState } from "react";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import db from "../firebase";

export default function CommunicationLog({ client, setClient }) {
  const [logEntry, setLogEntry] = useState("");
  const clientId = client?.id;

  const handleAddLog = async () => {
    if (!logEntry.trim()) return;

    if (!clientId) {
      console.error("Missing clientId — cannot save communication log.");
      return;
    }

    const auth = getAuth();
    const user = auth.currentUser;

    const newLog = {
      message: logEntry,
      timestamp: new Date().toISOString(),
      user: user?.displayName || user?.email || "Anonymous",
    };

    try {
      const clientRef = doc(db, "clients", clientId);
      await updateDoc(clientRef, {
        communicationLogs: arrayUnion(newLog),
      });

      setClient((prev) => ({
        ...prev,
        communicationLogs: [...(prev.communicationLogs || []), newLog],
      }));

      setLogEntry("");
    } catch (err) {
      console.error("Failed to update Firestore log:", err);
    }
  };

  return (
    <div style={{ marginBottom: "2rem" }}>
      <h3>Communication Log</h3>
      {(client.communicationLogs || []).map((log, index) => (
        <div
          key={index}
          style={{
            marginBottom: "1rem",
            padding: "10px",
            border: "1px solid #ccc",
            borderRadius: "6px",
          }}
        >
          <div style={{ fontSize: "14px", color: "#555", marginBottom: "6px" }}>
            🟢 Created {new Date(log.timestamp).toLocaleString()} by {log.user}
          </div>
          <div>{log.message}</div>
        </div>
      ))}
      <textarea
        value={logEntry}
        onChange={(e) => setLogEntry(e.target.value)}
        rows={4}
        placeholder="Write a new communication log..."
        style={{ width: "100%", padding: "10px", fontSize: "16px" }}
      />
      <button
        onClick={handleAddLog}
        style={{
          marginTop: "10px",
          padding: "8px 16px",
          backgroundColor: "#007bff",
          color: "#fff",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        Submit Log
      </button>
    </div>
  );
}
