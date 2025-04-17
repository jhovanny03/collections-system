// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCRoKzcQIj6e2_VvS2wim6wR4QM5WPE5k",
  authDomain: "collectionsapp-7d351.firebaseapp.com",
  projectId: "collectionsapp-7d351",
  storageBucket: "collectionsapp-7d351.appspot.com",
  messagingSenderId: "1041714431865",
  appId: "1:1041714431865:web:440c24ae0904bac3c051a8",
  measurementId: "G-GQR7JJB4ZH"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default db;
