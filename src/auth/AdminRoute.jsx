// src/auth/AdminRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";

/** Admins and the owner only. */
export default function AdminRoute({ children }) {
  const { loading, canManageUsers } = useAuth();
  if (loading) return null;
  if (!canManageUsers()) return <Navigate to="/dashboard" replace />;
  return children;
}
