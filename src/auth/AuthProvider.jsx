// src/auth/AuthProvider.jsx
// Signed-in user = Firebase Auth account + users/{uid} profile (role, name).
// Permission helpers come from ./permissions so every page uses the same rules.
import React, { createContext, useEffect, useMemo, useState, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { authService, isFirmEmail } from "../services/authService";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import {
  BYPASS_EMAIL,
  roleOf,
  displayNameOf,
  isMaster as isMasterFn,
  isAdmin as isAdminFn,
  isEditor as isEditorFn,
  isBasic as isBasicFn,
  isEditorOrHigher as isEditorOrHigherFn,
  isLeadOrHigher as isLeadOrHigherFn,
  canManageUsers as canManageUsersFn,
} from "./permissions";
import { setActor } from "./actor";

const AuthContext = createContext({
  user: null,
  loading: true,
  disabledNotice: false,
  register: async () => {},
  login: async () => {},
  logout: async () => {},
  isMaster: () => false,
  isAdmin: () => false,
  isEditor: () => false,
  isBasic: () => true,
  isEditorOrHigher: () => false,
  isLeadOrHigher: () => false,
  canManageUsers: () => false,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Set when a disabled account tries to sign in (shown on the login page).
  const [disabledNotice, setDisabledNotice] = useState(false);
  // Set when a non-firm account is signed in (any sign-in method): it is signed out.
  const [domainNotice, setDomainNotice] = useState(false);

  const register = useCallback((email, password) => authService.register(email, password), []);
  const login = useCallback((email, password) => {
    setDisabledNotice(false);
    return authService.login(email, password);
  }, []);
  const logout = useCallback(() => authService.logout(), []);
  const loginWithGoogle = useCallback(() => {
    setDisabledNotice(false);
    setDomainNotice(false);
    return authService.loginWithGoogle();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setActor(null);
          setUser(null);
          return;
        }
        const email = (firebaseUser.email || "").toLowerCase();
        // Firm accounts only: any other account (an old email/password login, a personal
        // Google account) is signed out before anything is read or created for it.
        if (!isFirmEmail(email)) {
          setDomainNotice(true);
          setActor(null);
          setUser(null);
          await authService.logout();
          return;
        }
        const isOwner = email === BYPASS_EMAIL.toLowerCase();
        const profileRef = doc(db, "users", firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);

        let profileData;
        if (profileSnap.exists()) {
          profileData = profileSnap.data() || {};
          if (!profileData.role) {
            const defaultRole = isOwner ? "master" : "basic";
            await setDoc(profileRef, { role: defaultRole }, { merge: true });
            profileData.role = defaultRole;
          }
        } else {
          profileData = { email, role: isOwner ? "master" : "basic", firstName: "", lastName: "", createdAt: serverTimestamp() };
          await setDoc(profileRef, profileData);
        }

        // A disabled account cannot use the app (the owner can never be locked out).
        if (profileData.disabled === true && !isOwner) {
          setDisabledNotice(true);
          setUser(null);
          await authService.logout();
          return;
        }

        const merged = { uid: firebaseUser.uid, email, displayName: firebaseUser.displayName || "", ...profileData };
        const full = { ...merged, role: roleOf(merged), name: displayNameOf(merged) };
        setActor(full);
        setUser(full);
      } catch (e) {
        console.error("Could not load the user profile:", e);
        setUser({ uid: firebaseUser?.uid, email: (firebaseUser?.email || "").toLowerCase(), role: "basic" });
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      disabledNotice,
      domainNotice,
      register,
      login,
      logout,
      loginWithGoogle,
      isMaster: () => isMasterFn(user),
      isAdmin: () => isAdminFn(user),
      isEditor: () => isEditorFn(user),
      isBasic: () => isBasicFn(user),
      isEditorOrHigher: () => isEditorOrHigherFn(user),
      isLeadOrHigher: () => isLeadOrHigherFn(user),
      canManageUsers: () => canManageUsersFn(user),
    }),
    [user, loading, disabledNotice, domainNotice, register, login, logout, loginWithGoogle]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
