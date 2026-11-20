// src/auth/actor.js
// Who is doing this action, for "by" fields and team reports. Uses the person's profile
// name (users/{uid}), not the Firebase Auth display name, which is usually empty.
import { getAuth } from "firebase/auth";

let current = null;

/** Called by AuthProvider whenever the signed-in user changes. */
export function setActor(user) {
  current = user ? { name: user.name || user.email || "", email: (user.email || "").toLowerCase(), uid: user.uid || "" } : null;
}

/** { name, email, uid } of the person signed in. */
export function getActor() {
  if (current) return current;
  const u = getAuth().currentUser;
  return { name: u?.displayName || u?.email || "Unknown", email: (u?.email || "").toLowerCase(), uid: u?.uid || "" };
}
