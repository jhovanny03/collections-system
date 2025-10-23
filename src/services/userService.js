// src/services/userService.js
/*import { db, storage } from "../firebase";
import { doc, setDoc, getDoc, serverTimestam, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, getStorage } from "firebase/storage";


export async function uploadProfileImage(uid, file) {
  const imgRef = ref(storage, `profile-images/${uid}`);
  await uploadBytes(imgRef, file);
  return getDownloadURL(imgRef);
}

export async function createUserProfile(uid, { firstName, lastName, email, role, profileImageFile }) {
  let profileImageURL = "";
  if (profileImageFile) {
    profileImageURL = await uploadProfileImage(uid, profileImageFile);
  }
  await setDoc(doc(db, "users", uid), {
    firstName, lastName, email, role,
    profileImageURL,
    createdAt: serverTimestamp(),
  });
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}*/

// src/services/userService.js
// -------------------------------------------------------------------
// FIXED: import de serverTimestamp (antes estaba mal escrito)
// REMOVED: getStorage (no se usa aquí)
// ADDED: updateUserProfile (para actualizar nombre/foto/rol, etc.)
// CHANGED: createUserProfile ahora usa serverTimestamp correcto
// -------------------------------------------------------------------
import { db, storage } from "../firebase";
import { doc, setDoc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore"; // FIXED: serverTimestam -> serverTimestamp
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"; // REMOVED getStorage (no se usa)

/**
 * Sube la imagen de perfil del usuario y devuelve la URL pública.
 */
export async function uploadProfileImage(uid, file) {
  // Mantenemos tu misma ruta para no romper nada
  const imgRef = ref(storage, `profile-images/${uid}`);
  await uploadBytes(imgRef, file);
  return getDownloadURL(imgRef);
}

/**
 * Crea el documento de perfil en /users/{uid}
 * (Se respeta tu esquema original: firstName, lastName, email, role, profileImageURL)
 */
export async function createUserProfile(
  uid,
  { firstName, lastName, email, role, profileImageFile }
) {
  let profileImageURL = "";
  if (profileImageFile) {
    profileImageURL = await uploadProfileImage(uid, profileImageFile);
  }

  await setDoc(doc(db, "users", uid), {
    firstName,
    lastName,
    email,
    role,
    profileImageURL,
    createdAt: serverTimestamp(), // FIXED: serverTimestamp correcto
  });
}

/**
 * Lee el perfil de /users/{uid}
 */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

/**
 * NEW: Actualiza el perfil del usuario en /users/{uid}
 * - Acepta un objeto parcial con campos a actualizar.
 * - Si llega `name` y no vienen firstName/lastName, divide el nombre.
 * - Si llega `profileImageFile`, primero lo sube y escribe profileImageURL.
 * - Escribe updatedAt con serverTimestamp().
 * - Intenta updateDoc y si el doc no existe, hace un setDoc({merge:true}).
 *
 * Ejemplos de uso:
 *   await updateUserProfile(uid, { firstName: "Ana", lastName: "Perez" })
 *   await updateUserProfile(uid, { name: "Ana Perez" })
 *   await updateUserProfile(uid, { profileImageFile: file })
 *   await updateUserProfile(uid, { role: "editor" })
 */
export async function updateUserProfile(uid, data = {}) {
  const payload = { ...data };

  // Si envías `name` (string) y no envías firstName/lastName, los derivamos
  if (
    typeof data.name === "string" &&
    !data.firstName &&
    !data.lastName
  ) {
    const parts = data.name.trim().split(/\s+/);
    const firstName = parts.shift() || "";
    const lastName = parts.join(" ");
    payload.firstName = firstName;
    payload.lastName = lastName;
    delete payload.name; // ya lo transformamos
  }

  // Si viene un archivo de imagen, súbelo y genera profileImageURL
  if (data.profileImageFile && (data.profileImageFile.name || data.profileImageFile.size)) {
    const url = await uploadProfileImage(uid, data.profileImageFile);
    payload.profileImageURL = url;
    delete payload.profileImageFile;
  }

  // Marca de tiempo de actualización
  payload.updatedAt = serverTimestamp();

  const userRef = doc(db, "users", uid);

  try {
    // updateDoc actualiza solo los campos enviados
    await updateDoc(userRef, payload);
  } catch (e) {
    // Si el doc no existe, hacemos upsert con merge
    await setDoc(userRef, payload, { merge: true });
  }

  return true;
}

