// === NEW: src/auth/permissions.js ==============================
// Helpers reutilizables para checar permisos en toda la app.

export const BYPASS_EMAIL = "jhovanny@rahmanlawpllc.com";

const nx = (s) => (s || "").toLowerCase();

export function isMaster(user) {
  return nx(user?.email) === nx(BYPASS_EMAIL);
}

export function isAdmin(user) {
  return (user?.role || "").toLowerCase() === "admin";
}

export function isEditor(user) {
  return (user?.role || "").toLowerCase() === "editor";
}

export function isBasic(user) {
  const r = (user?.role || "").toLowerCase();
  return !r || r === "basic";
}

export function isEditorOrHigher(user) {
  // Editor, Admin o Master
  return isMaster(user) || isAdmin(user) || isEditor(user);
}

export function canManageUsers(user) {
  // Solo Admin o Master
  return isMaster(user) || isAdmin(user);
}
