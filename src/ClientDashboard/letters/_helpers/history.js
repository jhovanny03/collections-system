// src/ClientDashboard/letters/_helpers/history.js
import { collection, doc, addDoc, serverTimestamp } from "firebase/firestore";
import db from "../../../firebase";

export async function saveLetterMetadata(clientId, meta) {
  const lettersRef = collection(doc(db, "clients", clientId), "letters");
  return addDoc(lettersRef, { ...meta, generatedAt: serverTimestamp() });
}