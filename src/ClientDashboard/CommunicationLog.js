import React, { useState } from "react";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import db from "../firebase";

export default function CommunicationLog({ client, setClient }) {
  const [logEntry, setLogEntry] = useState("");
  const clientId = client?.id;

  const handleAddLog = async () => {
    if (!logEntry.trim()) return;
    if (!clientId) return;

    const auth = getAuth();
    const user = auth.currentUser;

    const newLog = {
      message: logEntry,
      timestamp: new Date().toISOString(),
      user: user?.displayName || user?.email || "Anonymous",
    };

    const clientRef = doc(db, "clients", clientId);
    await updateDoc(clientRef, {
      communicationLogs: arrayUnion(newLog),
    });

    setClient((prev) => ({
      ...prev,
      communicationLogs: [...(prev.communicationLogs || []), newLog],
    }));

    setLogEntry("");
  };

  return (
    <div style={{ marginBottom: "2rem" }}>
      <h3>📝 Communication Log</h3>

      {(client.communicationLogs || []).map((log, index) => (
        <div
          key={index}
          style={{
            marginBottom: "1rem",
            border: "1px solid #ddd",
            borderRadius: "8px",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              background: "#f9f9f9",
              padding: "6px 10px",
              fontSize: "13px",
              color: "#555",
              fontStyle: "italic",
            }}
          >
            {new Date(log.timestamp).toLocaleString()} • {log.user}
          </div>
          <div
            style={{
              padding: "12px",
              fontSize: "15px",
              color: "#222",
              lineHeight: 1.5,
              background: "#fff",
            }}
          >
            {log.message}
          </div>
        </div>
      ))}

      <textarea
        value={logEntry}
        onChange={(e) => setLogEntry(e.target.value)}
        rows={4}
        placeholder="Write a new communication log..."
        style={{
          width: "100%",
          padding: "10px",
          fontSize: "15px",
          borderRadius: "6px",
          border: "1px solid #ccc",
          marginTop: "1rem",
        }}
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