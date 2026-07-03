/*// src/auth/AuthProvider.jsx
import React, { createContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { authService } from '../services/authService';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const AuthContext = createContext();

const MASTER_ROLE = 'master';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Cargar perfil desde Firestore
        const profileRef = doc(db, 'users', firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);
        let profileData;

        if (profileSnap.exists()) {
          profileData = profileSnap.data();
          
          if (!profileData.role) {
            profileData.role = MASTER_ROLE;
            await setDoc(profileRef, { role: MASTER_ROLE }, { merge: true });
          }
          
        } else {
          // Si no hay perfil en Firestore, usamos datos básicos de Auth
          profileData = {
            email: firebaseUser.email,
            role: MASTER_ROLE,
            firstName: '',
            lastName: '',
            createdAt: serverTimestamp(),
          };
          await setDoc(profileRef, profileData);
          
        }
        setUser({
        uid: firebaseUser.uid,
        email: (firebaseUser.email || '').toLowerCase(), // 💡 normalizamos
        ...profileData,
      });
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const register = (email, password) => authService.register(email, password);
  const login    = (email, password) => authService.login(email, password);
  const logout   = ()              => authService.logout();

  return (
    <AuthContext.Provider value={{ user, loading, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext; */

// src/auth/AuthProvider.jsx
import React, { createContext, useEffect, useMemo, useState, useCallback } from 'react';
// REMOVE: signOut no se usa porque ya ocupas authService.logout()
// import { onAuthStateChanged, signOut } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { authService } from '../services/authService';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// ADD: traemos BYPASS_EMAIL y helpers centralizados
import {
  BYPASS_EMAIL,
  isMaster as isMasterFn,
  isAdmin as isAdminFn,
  isEditor as isEditorFn,
  isBasic as isBasicFn,
  isEditorOrHigher as isEditorOrHigherFn,
  canManageUsers as canManageUsersFn,
} from "./permissions";

// CHANGED: el contexto ahora documenta también los helpers de permisos
const AuthContext = createContext({
  user: null,
  loading: true,
  // auth actions
  register: async (_e, _p) => {},
  login: async (_e, _p) => {},
  logout: async () => {},
  // helpers de permisos
  isMaster: () => false,
  isAdmin: () => false,
  isEditor: () => false,
  isBasic: () => true,
  isEditorOrHigher: () => false,
  canManageUsers: () => false,
});

const MASTER_ROLE = 'master';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ADD: acciones auth (las exponemos en el context)
  const register     = useCallback((email, password) => authService.register(email, password), []);
  const login        = useCallback((email, password) => authService.login(email, password), []);
  const logout       = useCallback(() => authService.logout(), []);
  const loginWithGoogle = useCallback(() => authService.loginWithGoogle(), []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUser(null);
          return;
        }

        const email = (firebaseUser.email || '').toLowerCase(); // CHANGED: normalizamos
        const profileRef = doc(db, 'users', firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);

        let profileData;
        if (profileSnap.exists()) {
          profileData = profileSnap.data() || {};

          // CHANGED: si no hay role, NO ponemos master por defecto — evaluamos por email
          if (!profileData.role) {
            const defaultRole =
              email === BYPASS_EMAIL.toLowerCase() ? MASTER_ROLE : 'basic';
            await setDoc(profileRef, { role: defaultRole }, { merge: true });
            profileData.role = defaultRole;
          }
        } else {
          // CHANGED: crear perfil con role seguro (master solo para BYPASS)
          const defaultRole =
            email === BYPASS_EMAIL.toLowerCase() ? MASTER_ROLE : 'basic';

          profileData = {
            email,
            role: defaultRole,
            firstName: '',
            lastName: '',
            createdAt: serverTimestamp(),
          };
          await setDoc(profileRef, profileData);
        }

        // CHANGED: armamos el usuario combinado (Auth + perfil)
        setUser({
          uid: firebaseUser.uid,
          email,
          ...profileData,
        });
      } catch (e) {
        console.error("AuthProvider onAuthStateChanged error:", e);
        // Fallback mínimo para no romper IU
        setUser({
          uid: firebaseUser?.uid,
          email: (firebaseUser?.email || '').toLowerCase(),
          role: 'basic',
        });
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  // ADD: helpers de permisos “amarrados” al usuario actual
  const value = useMemo(() => {
    return {
      user,
      loading,
      register,
      login,
      logout,
      loginWithGoogle,
      // helpers
      isMaster: () => isMasterFn(user),
      isAdmin: () => isAdminFn(user),
      isEditor: () => isEditorFn(user),
      isBasic: () => isBasicFn(user),
      isEditorOrHigher: () => isEditorOrHigherFn(user),
      canManageUsers: () => canManageUsersFn(user),
    };
  }, [user, loading, register, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;

