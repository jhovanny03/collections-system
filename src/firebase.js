// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyCRoKzcQIj6e2_VvS2wim6wR4QM5WP8E5k",
  authDomain: "collectionsapp-7d351.firebaseapp.com",
  projectId: "collectionsapp-7d351",
  storageBucket: "collectionsapp-7d351.appspot.com",
  messagingSenderId: "1041714431865",
  appId: "1:1041714431865:web:440c24ae0904bac3c051a8",
  measurementId: "G-GQR7JJB4ZH",
};

// Init
const app = initializeApp(firebaseConfig);

// Which Firestore database this build uses. Unset = the original database.
// REACT_APP_FIRESTORE_DATABASE=mycase-rebuild points the app at the MyCase rebuild,
// a separate database in the same project; the original is never touched by it.
export const DATABASE_ID = process.env.REACT_APP_FIRESTORE_DATABASE || "(default)";
export const IS_REBUILD_DATABASE = DATABASE_ID !== "(default)";

// Singletons
const db = IS_REBUILD_DATABASE ? getFirestore(app, DATABASE_ID) : getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// Local only: REACT_APP_FUNCTIONS_LOCAL=1 (with the rebuild database) sends callable
// functions (Case Setup save...) to collections-rebuild/local-functions.js on port 5001,
// which writes to the rebuild database only. Never set in a deployed build.
if (IS_REBUILD_DATABASE && process.env.REACT_APP_FUNCTIONS_LOCAL === "1" && window.location.hostname === "localhost") {
  connectFunctionsEmulator(getFunctions(app), "localhost", 5001);
}

// Exports
export { app, db, auth, storage };
export default db; // (keep default if other files import default)