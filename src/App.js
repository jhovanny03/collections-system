// src/App.js
import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import db from "./firebase";

import ClientList from "./ClientList";
import CreateClient from "./CreateClient";
import ClientDashboard from "./ClientDashboard/ClientDashboard";
import PromisedPaymentCalendar from "./PromisedPaymentCalendar";
import FollowUps from "./FollowUps/FollowUps";

function MainView({ clients }) {
  const [view, setView] = useState("create");

  return (
    <div className="App" style={{ padding: "2rem" }}>
      <div style={{ marginBottom: "2rem" }}>
        <button onClick={() => setView("create")} style={buttonStyle}>
          ➕ Create Client
        </button>
        <button onClick={() => setView("view")} style={buttonStyle}>
          📄 View Clients
        </button>
        <a
          href="/promised-payments"
          style={{ ...buttonStyle, textDecoration: "none" }}
        >
          📅 Promised Payments
        </a>
        <a
          href="/follow-ups"
          style={{ ...buttonStyle, textDecoration: "none" }}
        >
          🔁 Follow Ups
        </a>
      </div>
      {view === "create" && <CreateClient />}
      {view === "view" && <ClientList clients={clients} />}
    </div>
  );
}

function App() {
  const [clients, setClients] = useState([]);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const snapshot = await getDocs(collection(db, "clients"));
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setClients(data);
        console.log("Fetched clients:", data);
      } catch (error) {
        console.error("Error fetching clients:", error);
      }
    };

    fetchClients();
  }, []);

  const updateClientCommunication = async (clientId, newEntry) => {
    try {
      const clientRef = doc(db, "clients", clientId);
      await updateDoc(clientRef, {
        communicationLog: arrayUnion(newEntry),
      });

      // Update UI immediately
      setClients((prevClients) =>
        prevClients.map((client) =>
          client.id === clientId
            ? {
                ...client,
                communicationLog: [
                  ...(client.communicationLog || []),
                  newEntry,
                ],
              }
            : client
        )
      );
    } catch (error) {
      console.error("Error updating communication log:", error);
    }
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainView clients={clients} />} />
        <Route path="/client/:clientId" element={<ClientDashboard />} />
        <Route
          path="/promised-payments"
          element={<PromisedPaymentCalendar />}
        />
        <Route
          path="/follow-ups"
          element={
            <FollowUps
              clients={clients}
              updateClientCommunication={updateClientCommunication}
            />
          }
        />
      </Routes>
    </Router>
  );
}

const buttonStyle = {
  marginRight: "1rem",
  padding: "0.6rem 1.2rem",
  borderRadius: "4px",
  border: "1px solid #ccc",
  backgroundColor: "#f8f8f8",
  cursor: "pointer",
};

export default App;
