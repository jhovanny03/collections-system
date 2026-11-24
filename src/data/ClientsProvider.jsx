// src/data/ClientsProvider.jsx
// The full clients collection, live, for the pages that need every client's whole record
// (Due vs collected history, Payment allocation, Team, MyCase sync). It loads only once a
// page asks for it (useClients()), because it is big: everyday pages read the prepared
// figures instead (src/data/BookProvider.jsx), which is what keeps them fast.
// Hand-entered clients with a MyCase case count MyCase payments, not typed ones
// (src/billing/mycaseOverlay.js): in `clients` their `payments` is the MyCase list and the
// typed list is kept as `typedPayments`. Nothing here is ever written back.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import db from "../firebase";
import { useAuth } from "../auth/useAuth";
import { caseIdOf, withMyCasePayments } from "../billing/mycaseOverlay";

const EMPTY = { clients: [], loading: true, error: null, byId: new Map(), mycaseByCase: new Map(), request: () => {} };
const ClientsContext = createContext(EMPTY);

export function ClientsProvider({ children }) {
  const { user } = useAuth();
  const [wanted, setWanted] = useState(false);
  const [state, setState] = useState({ clients: [], loading: true, error: null });
  const [mycase, setMycase] = useState(new Map());
  const request = useCallback(() => setWanted(true), []);

  useEffect(() => {
    if (!user || !wanted) {
      if (!user) setState({ clients: [], loading: true, error: null });
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
  }, [user, wanted]);

  // This month's MyCase payments by case: payments the sync has not stored on a
  // hand-entered client yet still count. Past months come from `mycaseReceived`.
  useEffect(() => {
    if (!user || !wanted) return undefined;
    const now = new Date();
    const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    return onSnapshot(
      query(collection(db, "mycasePayments"), where("date", ">=", first)),
      (snap) => {
        const byCase = new Map();
        snap.docs.forEach((d) => {
          const p = d.data();
          const k = String(p.caseId || "");
          if (!k) return;
          if (!byCase.has(k)) byCase.set(k, []);
          byCase.get(k).push({ id: String(p.id || d.id), date: p.date, amount: p.amount, status: p.status, type: p.type, invoiceId: p.invoiceId });
        });
        setMycase(byCase);
      },
      (error) => console.error("MyCase payments listener failed:", error)
    );
  }, [user, wanted]);

  const value = useMemo(() => {
    const clients = state.clients.map((c) => withMyCasePayments(c, mycase.get(caseIdOf(c) || "")));
    return { ...state, clients, byId: new Map(clients.map((c) => [c.id, c])), mycaseByCase: mycase, request };
  }, [state, mycase, request]);
  return <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>;
}

/**
 * Every client's full record (live). Asking for it starts the download, so call it only
 * on pages that need whole records; pass { enabled: false } to read without starting it.
 * { clients, loading, error, byId }
 */
export function useClients({ enabled = true } = {}) {
  const ctx = useContext(ClientsContext);
  const { request } = ctx;
  useEffect(() => {
    if (enabled) request();
  }, [enabled, request]);
  return ctx;
}
