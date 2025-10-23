// src/auth/AdminRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';

// 🔐 Email con pase directo (comparado en minúsculas)
const BYPASS_EMAIL = 'jhovanny@rahmanlawpllc.com';

// 🔐 Única función de permiso:
//   - Admin permitido
//   - (Opcional) master permitido (borra esta línea si NO quieres)
//   - Email BYPASS permitido
function canManageUsers(user) {
  if (!user) return false;
  const email = (user.email || '').toLowerCase();
  return user.role === 'admin' || user.role === 'master' || email === BYPASS_EMAIL;
}

export default function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  console.log("🔒 AdminRoute – user:", user, "loading:", loading);
  if (loading) return null; // o spinner
  if (!canManageUsers(user)) return <Navigate to="/dashboard" replace />;
  return children;
}
