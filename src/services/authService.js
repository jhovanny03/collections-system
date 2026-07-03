// src/services/authService.js
/*import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { auth } from '../firebase';

export const authService = {
  register: (email, password) =>
    createUserWithEmailAndPassword(auth, email, password),

  login: (email, password) =>
    signInWithEmailAndPassword(auth, email, password),

  logout: () =>
    signOut(auth)
};
*/

// src/services/authService.js
// ------------------------------------------------------------------
// Basado en tu archivo original. Se mantuvieron register/login/logout.
// NEW: sendPasswordReset(email) -> para enviar email de reseteo.
// NEW: reauthWithPassword(email, currentPassword) -> reautenticar.
// NEW: updateUserPassword(newPassword) -> cambiar contraseña (requiere reauth).
// ------------------------------------------------------------------
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "../firebase";

const COMPANY_DOMAIN = "rahmanlawpllc.com";

export const authService = {
  register: (email, password) =>
    createUserWithEmailAndPassword(auth, email, password),

  login: (email, password) =>
    signInWithEmailAndPassword(auth, email, password),

  logout: () => signOut(auth),

  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ hd: COMPANY_DOMAIN });
    const result = await signInWithPopup(auth, provider);
    const email = (result.user.email || "").toLowerCase();
    if (!email.endsWith(`@${COMPANY_DOMAIN}`)) {
      await signOut(auth);
      throw new Error("Only @rahmanlawpllc.com accounts are allowed.");
    }
    return result;
  },

  // NEW: Enviar email de restablecimiento de contraseña
  // Uso: await authService.sendPasswordReset(email)
  sendPasswordReset: (email) => sendPasswordResetEmail(auth, email),

  // NEW: Reautenticación con email/contraseña
  // Uso: await authService.reauthWithPassword(user.email, currentPwd)
  async reauthWithPassword(email, currentPassword) {
    const user = auth.currentUser;
    if (!user) throw new Error("No authenticated user");
    const cred = EmailAuthProvider.credential(email, currentPassword);
    await reauthenticateWithCredential(user, cred);
    return true;
  },

  // NEW: Cambiar contraseña del usuario autenticado
  // Requiere haber llamado antes a reauthWithPassword
  // Uso: await authService.updateUserPassword(newPwd)
  async updateUserPassword(newPassword) {
    const user = auth.currentUser;
    if (!user) throw new Error("No authenticated user");
    await updatePassword(user, newPassword);
    return true;
  },
};
