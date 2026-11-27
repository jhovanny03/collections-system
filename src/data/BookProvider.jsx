// src/data/BookProvider.jsx
// The prepared figures (functions/portfolioSnapshot.js): one row per client plus the
// Home/report totals, computed on the server after each MyCase sync and RingCentral import.
// Reading ~10 small documents instead of every client is what makes pages open fast.
// If the figures do not exist yet (before the first server run), useBook() falls back to
// loading every client and computing in the browser, exactly as before.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import db, { app } from "../firebase";
import { useAuth } from "../auth/useAuth";
import { useClients } from "./ClientsProvider";
import { usePortfolio, collectionRateByMonth, collectionsByMonth, summarize } from "../billing/portfolio";
import { agingTrend, collectionForecast, writeOffRisk, planHealth } from "../billing/insights";

const BookContext = createContext(null);
const NO_CLIENTS = [];
const EMPTY_SUMMARY = summarize([], [], new Date());

// Stored rows hold dates as text and leave out a few duplicates: put them back.
const hydrateRow = (r) => ({
  ...r,
  mycasePhones: r.phones || [],
  paymentPromise: r.promise || null,
  createdAt: r.createdAt ? new Date(r.createdAt) : null,
  lastContact: r.lastContact ? { ...r.lastContact, at: new Date(r.lastContact.at) } : null,
});
const hydratePayment = (p) => ({ ...p, date: new Date(p.date), recordedAt: p.recordedAt ? new Date(p.recordedAt) : null });

export function BookProvider({ children }) {
  const { user } = useAuth();
  const [meta, setMeta] = useState(undefined); // undefined = loading, null = not prepared yet
  const [rows, setRows] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(doc(db, "portfolio", "summary"), (s) => setMeta(s.exists() ? s.data() : null), () => setMeta(null));
  }, [user]);

  // New figures saved on the server: read the rows once.
  const generatedAt = meta && meta.generatedAt;
  useEffect(() => {
    if (!generatedAt) return undefined;
    let alive = true;
    getDocs(collection(db, "portfolioRows"))
      .then((s) => {
        if (!alive) return;
        const batches = s.docs.map((d) => d.data()).sort((a, b) => a.i - b.i);
        setRows(batches.flatMap((b) => b.rows).map(hydrateRow));
      })
      .catch((e) => console.error("Could not read the prepared figures:", e));
    return () => {
      alive = false;
    };
  }, [generatedAt]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await httpsCallable(getFunctions(app), "refreshPortfolioNow", { timeout: 300000 })({});
    } finally {
      setRefreshing(false);
    }
  }, []);

  const value = useMemo(() => ({ meta, rows, refresh, refreshing }), [meta, rows, refresh, refreshing]);
  return <BookContext.Provider value={value}>{children}</BookContext.Provider>;
}

/**
 * { ready, summaryReady, rows, summary, months, byMonth, daily, recent, mycaseMonth, promiseMonths, generatedAt, source,
 *   refresh, refreshing }  — rows have the same fields as clientRows() (src/billing/book.js).
 */
export function useBook() {
  const ctx = useContext(BookContext);
  const missing = ctx.meta === null;
  const { clients, loading } = useClients({ enabled: missing });
  const local = usePortfolio(missing ? clients : NO_CLIENTS);
  const localMonths = useMemo(() => (missing && clients.length ? collectionRateByMonth(clients, 12) : []), [missing, clients]);

  return useMemo(() => {
    if (missing) {
      return {
        ready: !loading, summaryReady: !loading, source: "live", rows: local.rows, summary: local.summary, months: localMonths,
        byMonth: collectionsByMonth(local.payments, 12), daily: null, recent: local.payments.slice(0, 25), mycaseMonth: null, promiseMonths: null,
        generatedAt: null, refresh: ctx.refresh, refreshing: ctx.refreshing,
      };
    }
    const m = ctx.meta;
    return {
      // summaryReady: totals and charts (one small document); ready: every client row too.
      ready: !!(m && ctx.rows), summaryReady: !!m, source: "prepared", rows: ctx.rows || [],
      summary: m ? { ...m.summary, asOf: new Date(m.summary.asOf) } : EMPTY_SUMMARY,
      months: m ? m.months : [], byMonth: m ? m.byMonth : [], daily: (m && m.daily) || null, recent: m ? (m.recent || []).map(hydratePayment) : [],
      mycaseMonth: m ? m.mycaseMonth : null, promiseMonths: m ? m.promiseMonths || null : null, generatedAt: m ? new Date(m.generatedAt) : null,
      refresh: ctx.refresh, refreshing: ctx.refreshing,
    };
  }, [missing, loading, local, localMonths, ctx]);
}

/** Rows by client id, from the prepared figures. */
export function useBookById() {
  const { rows } = useBook();
  return useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
}

/**
 * Aging trend, forecast, write-off risk and plan health. Prepared on the server with the
 * other figures; computed in the browser only when they are not prepared yet.
 */
export function useInsights() {
  const ctx = useContext(BookContext);
  const missing = ctx.meta === null;
  const generatedAt = ctx.meta && ctx.meta.generatedAt;
  const [prepared, setPrepared] = useState(null);
  const { clients, loading } = useClients({ enabled: missing });
  const { rows } = usePortfolio(missing ? clients : NO_CLIENTS);

  useEffect(() => {
    if (!generatedAt) return undefined;
    let alive = true;
    Promise.all([getDoc(doc(db, "portfolio", "insights")), getDocs(collection(db, "portfolioHealth"))]).then(([ins, health]) => {
      if (!alive) return;
      const i = ins.data() || {};
      setPrepared({
        agingTrend: i.agingTrend || [], forecast: i.forecast || null,
        risk: (i.risk || []).map((r) => ({ ...r, lastPayment: r.lastPayment ? new Date(r.lastPayment) : null })),
        health: health.docs.map((d) => d.data()).sort((a, b) => a.i - b.i).flatMap((d) => d.rows),
      });
    });
    return () => {
      alive = false;
    };
  }, [generatedAt]);

  const local = useMemo(() => {
    if (!missing || loading || !clients.length) return null;
    const byId = new Map(rows.map((r) => [r.id, r]));
    return { agingTrend: agingTrend(clients, 12), forecast: collectionForecast(clients, 3), risk: writeOffRisk(clients, byId, 6), health: planHealth(clients, byId) };
  }, [missing, loading, clients, rows]);

  return missing ? local : prepared;
}
