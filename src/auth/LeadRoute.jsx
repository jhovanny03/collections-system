// src/auth/LeadRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";

/** Team leads, admins and the owner. */
export default function LeadRoute({ children }) {
  const { loading, isLeadOrHigher } = useAuth();
  if (loading) return null;
  if (!isLeadOrHigher()) return <Navigate to="/dashboard" replace />;
  return children;
}
