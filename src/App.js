import React, { useMemo, useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider, createTheme, CssBaseline, Box } from "@mui/material";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import db from "./firebase";

import Sidebar from "./Layout/Sidebar";
import DarkModeToggle from "./Layout/DarkModeToggle";
import PageTransition from "./Layout/PageTransition";

import ClientList from "./ClientList";
import CreateClient from "./CreateClient";
import ClientDashboard from "./ClientDashboard/ClientDashboard";
import PromisedPaymentCalendar from "./PromisedPaymentCalendar";
import FollowUps from "./FollowUps/FollowUps";
import Dashboard from "./Dashboard/Dashboard";

function App() {
  const [clients, setClients] = useState([]);
  const [mode, setMode] = useState("light");

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const snapshot = await getDocs(collection(db, "clients"));
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setClients(data);
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

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: "#6366f1" },
          secondary: { main: "#f43f5e" },
          background: {
            default: mode === "light" ? "#f4f4f5" : "#18181b",
            paper: mode === "light" ? "#ffffff" : "#27272a",
          },
          text: {
            primary: mode === "light" ? "#111827" : "#f9fafb",
            secondary: mode === "light" ? "#6b7280" : "#d1d5db",
          },
        },
        shape: { borderRadius: 16 },
        typography: {
          fontFamily: "'Poppins', 'Roboto', 'Arial', sans-serif",
          h4: { fontWeight: 600 },
          subtitle2: { fontWeight: 500 },
        },
      }),
    [mode]
  );

  const toggleColorMode = () => {
    setMode((prevMode) => (prevMode === "light" ? "dark" : "light"));
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Box sx={{ display: "flex" }}>
          <Sidebar />
          <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
            <DarkModeToggle mode={mode} toggleColorMode={toggleColorMode} />
            <PageTransition>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route
                  path="/clients"
                  element={<ClientList clients={clients} />}
                />
                <Route path="/create-client" element={<CreateClient />} />
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
                <Route path="/dashboard" element={<Dashboard />} />
              </Routes>
            </PageTransition>
          </Box>
        </Box>
      </Router>
    </ThemeProvider>
  );
}

export default App;
