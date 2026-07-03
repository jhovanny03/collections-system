// src/ClientFollowUps/followUps.types.js

// Core status values (stored in Firestore)
export const FOLLOW_UP_STATUS = {
  PENDING: "Pending",
  ATTEMPTED_NO_CONTACT: "Attempted-No-Contact",
  REACHED_WORKING: "Reached-Working",
  PROMISE: "Promise",
  PARTIAL_PAYMENT: "Partial-Payment", // ✅ NEW
  RESOLVED: "Resolved",
};

// Human-friendly labels for UI (Chips, dropdowns, etc.)
export const STATUS_LABELS = {
  [FOLLOW_UP_STATUS.PENDING]: "Pending",
  [FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT]: "Attempted – No Contact",
  [FOLLOW_UP_STATUS.REACHED_WORKING]: "Reached – Working",
  [FOLLOW_UP_STATUS.PROMISE]: "Promise to Pay",
  [FOLLOW_UP_STATUS.PARTIAL_PAYMENT]: "Partial Payment", // ✅ NEW
  [FOLLOW_UP_STATUS.RESOLVED]: "Resolved (This Month)",
};

// Recommended MUI Chip colors per status
// (These are just the color props you pass to <Chip color="...">)
export const STATUS_COLORS = {
  [FOLLOW_UP_STATUS.PENDING]: "default", // grey
  [FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT]: "warning", // yellow/orange
  [FOLLOW_UP_STATUS.REACHED_WORKING]: "info", // blue
  [FOLLOW_UP_STATUS.PROMISE]: "secondary", // purple/secondary
  [FOLLOW_UP_STATUS.PARTIAL_PAYMENT]: "secondary", // ✅ NEW (keep purple, or change to "info" if you prefer)
  [FOLLOW_UP_STATUS.RESOLVED]: "success", // green
};

// Handy list for filters / future dropdowns
export const ALL_STATUSES = [
  FOLLOW_UP_STATUS.PENDING,
  FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT,
  FOLLOW_UP_STATUS.REACHED_WORKING,
  FOLLOW_UP_STATUS.PROMISE,
  FOLLOW_UP_STATUS.PARTIAL_PAYMENT, // ✅ NEW
  FOLLOW_UP_STATUS.RESOLVED,
];

// Document how this cohort was generated (for future logic/reporting)
export const COHORT_SOURCE_RULE = "missed-current-month-15th";