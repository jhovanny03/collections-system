// src/ClientDashboard/letters/_helpers/fetchTemplateBuffer.js
import { getStorage, ref, getDownloadURL } from "firebase/storage";

export async function fetchTemplateBuffer(storagePath) {
  const storage = getStorage();
  const fileRef = ref(storage, storagePath);
  const url = await getDownloadURL(fileRef);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch template: ${res.status}`);
  return await res.arrayBuffer();
}