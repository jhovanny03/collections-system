// src/data/ClientsProvider.jsx
// One live copy of the clients collection for the whole app. Pages used to download
// every client 3-5 times per visit; now they share this listener, which also keeps
// every page current when MyCase payments arrive or a teammate edits a client.
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import db from "../firebase";
import { useAuth } from "../auth/useAuth";

const ClientsContext = createContext({ clients: [], loading: true, error: null, byId: new Map() });

export function ClientsProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({ clients: [], loading: true, error: null });

  useEffect(() => {
    if (!user) {
      setState({ clients: [], loading: true, error: null });
      return undefined;
    }
    return onSnapshot(
      collection(db, "clients"),
      (snap) => setState({ clients: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loading: false, error: null }),
      (error) => {
        console.error("Clients listener failed:", error);
        setState((s) => ({ ...s, loading: false, error }));
      }
    );
  }, [user]);

  const value = useMemo(() => ({ ...state, byId: new Map(state.clients.map((c) => [c.id, c])) }), [state]);
  return <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>;
}

/** { clients, loading, error, byId } */
export const useClients = () => useContext(ClientsContext);
