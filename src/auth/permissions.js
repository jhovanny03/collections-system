// src/auth/permissions.js
// One place for who can do what. Roles, lowest to highest:
//   basic   – read only (dashboard, clients, reports)
//   editor  – billing team: follow-ups, payments, Case Setup, MyCase Review
//   lead    – team lead: editor + Team section (team performance)
//   admin   – lead + user management
//   master  – the owner account (same as admin, cannot be locked out)
// The owner email is always master, whatever its stored role says.

export const BYPASS_EMAIL = "jhovanny@rahmanlawpllc.com";

export const ROLES = ["basic", "editor", "lead", "admin", "master"];
export const ROLE_LABELS = {
  basic: "Viewer",
  editor: "Billing team",
  lead: "Team lead",
  admin: "Admin",
  master: "Owner",
};
export const ROLE_HELP = {
  basic: "Can see the dashboard, clients and reports. Cannot change anything.",
  editor: "Works the follow-ups, promises, payments, Case Setup and MyCase Review.",
  lead: "Everything the billing team can do, plus the Team section to review how the team is doing.",
  admin: "Everything a team lead can do, plus adding and managing users.",
  master: "Owner account.",
};

const nx = (s) => String(s || "").trim().toLowerCase();

export function roleOf(user) {
  if (!user) return null;
  if (nx(user.email) === nx(BYPASS_EMAIL)) return "master";
  const r = nx(user.role);
  return ROLES.includes(r) ? r : "basic";
}

const rank = (user) => ROLES.indexOf(roleOf(user));
const atLeast = (user, role) => !!user && rank(user) >= ROLES.indexOf(role);

export const isMaster = (user) => roleOf(user) === "master";
export const isAdmin = (user) => roleOf(user) === "admin";
export const isEditor = (user) => roleOf(user) === "editor";
export const isBasic = (user) => roleOf(user) === "basic";

export const isEditorOrHigher = (user) => atLeast(user, "editor");
export const isLeadOrHigher = (user) => atLeast(user, "lead");
export const canManageUsers = (user) => atLeast(user, "admin");

/** The name to show and to record on actions ("who did this"). */
export function displayNameOf(user) {
  if (!user) return "";
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return full || user.name || user.displayName || user.email || "";
}
