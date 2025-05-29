import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCRoKzcQIj6e2_VvS2wim6wR4QM5WP8E5k",
  authDomain: "collectionsapp-7d351.firebaseapp.com",
  projectId: "collectionsapp-7d351",
  storageBucket: "collectionsapp-7d351.appspot.com", // ✅ FIXED
  messagingSenderId: "1041714431865",
  appId: "1:1041714431865:web:440c24ae0904bac3c051a8",
  measurementId: "G-GQR7JJB4ZH",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Set up services
const db = getFirestore(app);
const auth = getAuth(app);

// ✅ Export both as named and default (for backward compatibility)
export default db;
export { db, auth };
