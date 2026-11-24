// src/data/ClientsProvider.jsx
// One live copy of the clients collection for the whole app. Pages used to download
// every client 3-5 times per visit; now they share this listener, which also keeps
// every page current when MyCase payments arrive or a teammate edits a client.
// Hand-entered clients with a MyCase case count MyCase payments, not typed ones
// (src/billing/mycaseOverlay.js): in `clients` their `payments` is the MyCase list and the
// typed list is kept as `typedPayments`. Nothing here is ever written back.
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import db from "../firebase";
import { useAuth } from "../auth/useAuth";
import { caseIdOf, isReceived, withMyCasePayments } from "../billing/mycaseOverlay";

const ClientsContext = createContext({ clients: [], loading: true, error: null, byId: new Map() });

export function ClientsProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({ clients: [], loading: true, error: null });
  const [mycase, setMycase] = useState(new Map());

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

  // This month's MyCase payments, by case, for the "MyCase received" total on Home
  // (about 1,500 rows). Past months come from each client's stored `mycaseReceived`.
  useEffect(() => {
    if (!user) return undefined;
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
  }, [user]);

  const value = useMemo(() => {
    const clients = state.clients.map((c) => {
      return withMyCasePayments(c, mycase.get(caseIdOf(c) || ""));
    });
    // This month in MyCase: all money received, and what landed on cases not in Collections.
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const tracked = new Set(state.clients.filter((c) => !c.mycaseExcluded).map(caseIdOf).filter(Boolean));
    const mycaseMonth = { ym, received: 0, count: 0, notInApp: 0, notInAppCount: 0 };
    mycase.forEach((list, caseId) => {
      for (const p of list) {
        if (String(p.date || "").slice(0, 7) !== ym || !isReceived(p)) continue;
        mycaseMonth.received += Number(p.amount);
        mycaseMonth.count++;
        if (!tracked.has(caseId)) {
          mycaseMonth.notInApp += Number(p.amount);
          mycaseMonth.notInAppCount++;
        }
      }
    });
    return { ...state, clients, byId: new Map(clients.map((c) => [c.id, c])), mycaseMonth: mycase.size ? mycaseMonth : null, mycaseByCase: mycase };
  }, [state, mycase]);
  return <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>;
}

/** { clients, loading, error, byId } — clients include unlogged MyCase payments (read-only). */
export const useClients = () => useContext(ClientsContext);
