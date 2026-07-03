// src/ClientFollowUps/followUps.service.js
import {
  doc,
  serverTimestamp,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import db from "../firebase";

// ---------- Date helpers ----------
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);

export const getCohortIdFromAnchor = (anchorDate) => {
  const d =
    anchorDate instanceof Date ? anchorDate : new Date(anchorDate || new Date());
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};

// Update a single cohort item
export async function updateCohortItem(cohortId, clientId, updates) {
  const itemRef = doc(db, "followUpsCohorts", cohortId, "items", clientId);
  await updateDoc(itemRef, { ...updates, updatedAt: serverTimestamp() });
}

// Append a communication log entry to the client document
export async function updateClientCommunication(clientId, partialLog) {
  if (!clientId) throw new Error("Missing clientId for communication log");

  const auth = getAuth();
  const user = auth.currentUser;

  const newLog = {
    message: partialLog?.message || "",
    timestamp: partialLog?.timestamp || new Date().toISOString(),
    user:
      partialLog?.user ||
      user?.displayName ||
      user?.email ||
      "Anonymous",
  };

  const clientRef = doc(db, "clients", clientId);
  await updateDoc(clientRef, {
    communicationLogs: arrayUnion(newLog),
  });

  return newLog;
}
