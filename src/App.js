// src/App.js
import React, { useMemo, useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  GlobalStyles,
} from "@mui/material";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import db from "./firebase";

import Sidebar from "./Layout/Sidebar";
import Layout from "./Layout/Layout";
import PageTransition from "./Layout/PageTransition";

import ClientList from "./ClientList";
import CreateClient from "./CreateClient";
import ClientDashboard from "./ClientDashboard/ClientDashboard";
import PromisedPaymentCalendar from "./PromisedPaymentCalendar";
import FollowUps from "./FollowUps/FollowUps";
import Dashboard from "./Dashboard/Dashboard";
import UserManagement from "./admin/UserManagement.jsx";
import ReportsPage from "./Reports/ReportsPage";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import Welcome from "./pages/Welcome";
import Onboarding from "./pages/Onboarding";
import ActionHandler from "./pages/ActionHandler";

import { AuthProvider } from "./auth/AuthProvider";
import PrivateRoute from "./auth/PrivateRoute";
import { useAuth } from "./auth/useAuth";
import AdminRoute from "./auth/AdminRoute";
import EditorRoute from "./auth/EditorRoute";

function App() {
  return (
    <AuthProvider>
      <Router>
        <ThemeAndRoutes />
      </Router>
    </AuthProvider>
  );
}

function ThemeAndRoutes() {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isAuthPage = ["/login"].includes(location.pathname);
  const [clients, setClients] = useState([]);
  const [mode, setMode] = useState("light");

  useEffect(() => {
    if (user && location.pathname === "/login") {
      navigate("/dashboard", { replace: true });
    }
  }, [user, location.pathname, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.exists() ? snap.data() : {};
        const done = !!data.onboardingCompleted;
        const onOnboarding = location.pathname === "/onboarding";
        if (!done && !onOnboarding) navigate("/onboarding", { replace: true });
      } catch (e) {
        console.warn("Onboarding check failed:", e.message);
      }
    })();
  }, [user, location.pathname, navigate]);

  useEffect(() => {
    if (!user) return;
    const fetchClients = async () => {
      try {
        const snapshot = await getDocs(collection(db, "clients"));
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setClients(data);
      } catch (error) {
        console.error("Error fetch clients:", error);
      }
    };
    fetchClients();
  }, [user]);

  const updateClientCommunication = async (clientId, newEntry) => {
    try {
      const clientRef = doc(db, "clients", clientId);
      await updateDoc(clientRef, { communicationLog: arrayUnion(newEntry) });
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? { ...c, communicationLog: [...(c.communicationLog || []), newEntry] }
            : c
        )
      );
    } catch (error) {
      console.error(error);
    }
  };

  // 🎨 EXECUTIVE COOL THEME
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: "#0b3a75" }, // Federal Blue
          secondary: { main: "#00a693" }, // Persian Green
          error: { main: "#d44500" }, // Syracuse Red-Orange
          background: {
            default: mode === "light" ? "#f6f8fa" : "#0f1621",
            paper: mode === "light" ? "#ffffff" : "#1a2332",
          },
          text: {
            primary: mode === "light" ? "#1a1a1a" : "#eaeff4",
            secondary: mode === "light" ? "#4b5563" : "#cfd6e3",
          },
        },
        shape: { borderRadius: 14 },
        typography: {
          fontFamily: "'Poppins','Roboto','Arial',sans-serif",
          h4: { fontWeight: 600 },
          button: { textTransform: "none", fontWeight: 600 },
        },
        components: {
          MuiButton: {
            styleOverrides: {
              root: {
                borderRadius: 10,
                fontWeight: 600,
              },
              containedPrimary: {
                backgroundColor: "#00a693",
                "&:hover": { backgroundColor: "#00877c" },
              },
              containedSecondary: {
                backgroundColor: "#0b3a75",
                "&:hover": { backgroundColor: "#052958" },
              },
            },
          },
        },
      }),
    [mode]
  );

  const toggleColorMode = () => setMode((prev) => (prev === "light" ? "dark" : "light"));

  if (isAuthPage) {
    if (authLoading)
      return (
        <Box
          sx={{
            height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          Loading…
        </Box>
      );
    if (user) return <Navigate to="/dashboard" replace />;
    return (
      <Box
        sx={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Login />
      </Box>
    );
  }

  if (authLoading)
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Loading…
      </Box>
    );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          ".fc .fc-timegrid-slot:hover": { backgroundColor: theme.palette.action.hover },
        }}
      />
      <Box sx={{ display: "flex" }}>
        {!isAuthPage && <Sidebar />}
        <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
          <PageTransition>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/welcome" element={<Welcome />} />
              <Route path="/action" element={<ActionHandler />} />
              <Route
                path="/onboarding"
                element={
                  <PrivateRoute>
                    <Onboarding />
                  </PrivateRoute>
                }
              />
              <Route
                path="/*"
                element={
                  <PrivateRoute>
                    <Layout mode={mode} toggleColorMode={toggleColorMode} clients={clients}>
                      <Routes>
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/clients" element={<ClientList clients={clients} />} />
                        <Route path="/client/:clientId" element={<ClientDashboard />} />

                        <Route
                          path="/create-client"
                          element={
                            <EditorRoute>
                              <CreateClient />
                            </EditorRoute>
                          }
                        />
                        <Route
                          path="/promised-payments"
                          element={
                            <EditorRoute>
                              <PromisedPaymentCalendar />
                            </EditorRoute>
                          }
                        />
                        <Route
                          path="/follow-ups"
                          element={
                            <EditorRoute>
                              <FollowUps
                                clients={clients}
                                updateClientCommunication={updateClientCommunication}
                              />
                            </EditorRoute>
                          }
                        />

                        <Route path="/profile" element={<Profile />} />
                        <Route
                          path="/register"
                          element={
                            <AdminRoute>
                              <Register />
                            </AdminRoute>
                          }
                        />
                        <Route
                          path="/admin/users"
                          element={
                            <AdminRoute>
                              <UserManagement />
                            </AdminRoute>
                          }
                        />

                        {/* Reports for all roles */}
                        <Route path="/reports" element={<ReportsPage />} />
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                      </Routes>
                    </Layout>
                  </PrivateRoute>
                }
              />
            </Routes>
          </PageTransition>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;