// === NEW: src/auth/EditorRoute.jsx =============================
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";

export default function EditorRoute({ children }) {
  const { loading, user, isEditorOrHigher } = useAuth();
  const location = useLocation();

  if (loading) return null; // o un spinner si prefieres
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  // Solo Editor / Admin / Master
  if (!isEditorOrHigher()) {
    // Redirige a dashboard o muestra un "No autorizado"
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
