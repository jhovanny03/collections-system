// src/data/WorkQueueProvider.jsx
// "What needs attention" counts, shared by the sidebar badges, the bell and Home.
// Counts come from cheap server-side aggregations (no documents downloaded) and are
// refreshed every 5 minutes; follow-up numbers follow the month's list live.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { collection, doc, getCountFromServer, onSnapshot, query, where } from "firebase/firestore";
import db from "../firebase";
import { useAuth } from "../auth/useAuth";
import { useBook } from "./BookProvider";

const WorkQueueContext = createContext({ counts: {}, loading: true, refresh: () => {} });

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const promiseDay = (p) => {
  const v = p?.date;
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  const d = typeof v.toDate === "function" ? v.toDate() : new Date(v);
  return isNaN(d) ? "" : ymd(d);
};

export function WorkQueueProvider({ children }) {
  const { user, isEditorOrHigher } = useAuth();
  // Prepared rows (name, case title, status, promise): no download of every client.
  const { rows: clients } = useBook();
  const [server, setServer] = useState({ loading: true });
  const [cohort, setCohort] = useState(null);
  const canWork = !!user && isEditorOrHigher();

  const refresh = useCallback(async () => {
    if (!canWork) return;
    const count = async (q) => {
      try {
        return (await getCountFromServer(q)).data().count;
      } catch (e) {
        console.warn("Count failed:", e.message);
        return null;
      }
    };
    const cases = collection(db, "mycaseCases");
    const [newCases, waitingPlan, toTag, reviewOpen, linkProblems, initialClients, initialStarted] = await Promise.all([
      count(query(cases, where("needsSetup", "==", true), where("setupGroup", "==", "client"))),
      count(query(cases, where("needsPlan", "==", true))),
      count(query(cases, where("needsTagging", "==", true))),
      count(query(collection(db, "mycasePaymentReview"), where("status", "==", "open"))),
      count(collection(db, "mycaseLinkIssues")),
      count(query(cases, where("initialState", "==", "client"))),
      count(query(cases, where("initialState", "==", "started"))),
    ]);
    // Initial payments not completed: clients in Collections + new cases that started paying.
    const initialOpen = (initialClients || 0) + (initialStarted || 0);
    setServer({ loading: false, newCases, waitingPlan, toTag, reviewOpen, linkProblems, initialOpen, at: new Date() });
  }, [canWork]);

  useEffect(() => {
    if (!canWork) return undefined;
    refresh();
    const t = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [canWork, refresh]);

  // This month's follow-up list (built on the 16th): open counts, live.
  useEffect(() => {
    if (!canWork) return undefined;
    const now = new Date();
    const id = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return onSnapshot(doc(db, "followUpsCohorts", id), (s) => setCohort(s.exists() ? { id, ...s.data() } : { id }), () => setCohort({ id }));
  }, [canWork]);

  const promises = useMemo(() => {
    const today = ymd(new Date());
    let dueToday = 0;
    let overdue = 0;
    const todayList = [];
    for (const c of clients) {
      const day = promiseDay(c.paymentPromise);
      if (!day || (c.status || "").toLowerCase() === "closed") continue;
      if (day === today) {
        dueToday++;
        todayList.push(c);
      } else if (day < today) overdue++;
    }
    return { dueToday, overdue, todayList };
  }, [clients]);

  const value = useMemo(() => {
    const counts = {
      ...server,
      followUpsOpen: cohort?.counts ? cohort.counts.current : null,
      followUpsBehind: cohort?.counts ? cohort.counts.behind : null,
      followUpsUnlogged: cohort?.counts ? cohort.counts.paidInMyCaseNotLogged || 0 : null,
      followUpsReady: !!cohort?.reportAt || !!cohort?.lastGeneratedBy,
      followUpsMonth: cohort?.id,
      promisesToday: promises.dueToday,
      promisesOverdue: promises.overdue,
      promisesTodayList: promises.todayList,
    };
    // Badge = new work only; "existing clients to tag" is a backlog shown inside Case Setup.
    counts.caseSetupTotal = [counts.newCases, counts.waitingPlan].reduce((s, n) => s + (n || 0), 0);
    return { counts, loading: server.loading, refresh };
  }, [server, cohort, promises, refresh]);

  return <WorkQueueContext.Provider value={value}>{children}</WorkQueueContext.Provider>;
}

/** { counts, loading, refresh } */
export const useWorkQueue = () => useContext(WorkQueueContext);
