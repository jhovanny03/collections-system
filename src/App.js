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
import { ThemeProvider, CssBaseline, Box, GlobalStyles, CircularProgress } from "@mui/material";
import { doc, getDoc } from "firebase/firestore";
import db from "./firebase";
import { createAppTheme } from "./theme/brand";
import { ClientsProvider } from "./data/ClientsProvider";
import { WorkQueueProvider } from "./data/WorkQueueProvider";
import { BookProvider } from "./data/BookProvider";

import Layout from "./Layout/Layout";

import ClientList from "./ClientList";
import CreateClient from "./CreateClient";
import ClientDashboard from "./ClientDashboard/ClientDashboard";
import PromisedPayments from "./pages/PromisedPayments";
import InitialPayments from "./pages/InitialPayments";
import DataQuality from "./pages/DataQuality";
import FollowUps from "./ClientFollowUps/FollowUps.jsx";
import Home from "./Dashboard/Home";
import UserManagement from "./admin/UserManagement.jsx";
import ReportsPage from "./Reports/ReportsPage";
import TeamPerformance from "./Team/TeamPerformance";

import Login from "./pages/Login";
import Profile from "./pages/Profile";
import MyCaseReview from "./pages/MyCaseReview";
import CaseSetup from "./pages/CaseSetup";
import { FEATURES } from "./config/features";
import Welcome from "./pages/Welcome";
import Onboarding from "./pages/Onboarding";
import ActionHandler from "./pages/ActionHandler";
import ForgotPassword from "./pages/ForgotPassword";

import { AuthProvider } from "./auth/AuthProvider";
import PrivateRoute from "./auth/PrivateRoute";
import { useAuth } from "./auth/useAuth";
import AdminRoute from "./auth/AdminRoute";
import EditorRoute from "./auth/EditorRoute";
import LeadRoute from "./auth/LeadRoute";

const MODE_KEY = "color_mode_v1";

function App() {
  return (
    <AuthProvider>
      <ClientsProvider>
        <BookProvider>
          <WorkQueueProvider>
            <Router>
              <ThemeAndRoutes />
            </Router>
          </WorkQueueProvider>
        </BookProvider>
      </ClientsProvider>
    </AuthProvider>
  );
}

function ThemeAndRoutes() {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isLoginPage = location.pathname === "/login";
  // /login-preview: the sign-in page without the signed-in redirect, local dev only.
  const isStandalonePage = ["/login", "/login-preview", "/welcome", "/action", "/forgot-password"].includes(
    location.pathname
  );
  const inLayout = !isStandalonePage && location.pathname !== "/onboarding";

  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem(MODE_KEY) === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  // Onboarding status is read once per signed-in user, not on every page change.
  const [onboarded, setOnboarded] = useState(null);

  useEffect(() => {
    if (user && isLoginPage) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, isLoginPage, navigate]);

  useEffect(() => {
    if (!user) {
      setOnboarded(null);
      return;
    }
    if (user.onboardingCompleted) {
      setOnboarded(true);
      return;
    }
    getDoc(doc(db, "users", user.uid))
      .then((snap) => setOnboarded(!!(snap.exists() && snap.data().onboardingCompleted)))
      .catch((e) => {
        console.warn("Onboarding check failed:", e.message);
        setOnboarded(true);
      });
  }, [user]);

  useEffect(() => {
    if (onboarded === false && location.pathname !== "/onboarding") navigate("/onboarding", { replace: true });
  }, [onboarded, location.pathname, navigate]);

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  const toggleColorMode = () =>
    setMode((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem(MODE_KEY, next);
      } catch {}
      return next;
    });

  // Sign-in screens and the loading spinner get the brand theme too.
  const branded = (node) => (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {node}
    </ThemeProvider>
  );
  const spinner = (
    <Box sx={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <CircularProgress />
    </Box>
  );

  if (isLoginPage) {
    if (authLoading) return branded(spinner);
    if (user) return <Navigate to="/dashboard" replace />;
    return branded(
      <Box sx={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Login />
      </Box>
    );
  }

  if (authLoading) return branded(spinner);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          ".fc .fc-timegrid-slot:hover": { backgroundColor: theme.palette.action.hover },
        }}
      />
      {/* Signed-in pages get their sidebar, header and padding from <Layout>. A second
          sidebar here used to sit under Layout's, taking 240px (plus padding) of width
          from every page. Only pages outside Layout get padding here. */}
      <Box sx={{ display: "flex" }}>
        <Box
          component={inLayout ? "div" : "main"}
          sx={{ flexGrow: 1, minWidth: 0, p: inLayout ? 0 : 3 }}
        >
          <Routes>
              <Route path="/login" element={<Login />} />
              {process.env.NODE_ENV === "development" && <Route path="/login-preview" element={<Login />} />}
              <Route path="/welcome" element={<Welcome />} />
              <Route path="/action" element={<ActionHandler />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />

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
                    <Layout mode={mode} toggleColorMode={toggleColorMode}>
                      <Routes>
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        <Route path="/dashboard" element={<Home />} />
                        <Route path="/clients" element={<ClientList />} />
                        <Route path="/client/:clientId" element={<ClientDashboard />} />
                        <Route
                          path="/create-client"
                          element={
                            FEATURES.createClient ? (
                              <EditorRoute>
                                <CreateClient />
                              </EditorRoute>
                            ) : (
                              // In the MyCase rebuild, new clients come from Case Setup.
                              <Navigate to="/case-setup" replace />
                            )
                          }
                        />
                        <Route
                          path="/promised-payments"
                          element={
                            <EditorRoute>
                              <PromisedPayments />
                            </EditorRoute>
                          }
                        />
                        <Route
                          path="/initial-payments"
                          element={
                            <EditorRoute>
                              <InitialPayments />
                            </EditorRoute>
                          }
                        />
                        <Route
                          path="/data-quality"
                          element={
                            <EditorRoute>
                              <DataQuality />
                            </EditorRoute>
                          }
                        />
                        <Route
                          path="/follow-ups"
                          element={
                            <EditorRoute>
                              <FollowUps />
                            </EditorRoute>
                          }
                        />
                        <Route
                          path="/case-setup"
                          element={
                            <EditorRoute>
                              <CaseSetup />
                            </EditorRoute>
                          }
                        />
                        <Route
                          path="/mycase-review"
                          element={
                            <EditorRoute>
                              <MyCaseReview />
                            </EditorRoute>
                          }
                        />
                        <Route path="/profile" element={<Profile />} />
                        <Route
                          path="/register"
                          element={
                            // The old Register page signed the admin out; adding people now
                            // happens on Users & roles (server creates the account).
                            <Navigate to="/admin/users?invite=1" replace />
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

                        <Route path="/reports" element={<ReportsPage />} />
                        <Route path="/level10" element={<Navigate to="/reports" replace />} />
                        <Route
                          path="/team"
                          element={
                            <LeadRoute>
                              <TeamPerformance />
                            </LeadRoute>
                          }
                        />

                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                      </Routes>
                    </Layout>
                  </PrivateRoute>
                }
              />
            </Routes>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;