// Firestore helpers for saving & reading metric snapshots
import { collection, doc, setDoc, getDocs, query, orderBy, limit as qLimit } from "firebase/firestore";
import db from "../../firebase"; // same default import style as Level10/index.jsx

const COLL = "billing_metrics_snapshots";

/**
 * Save a snapshot: one doc per YYYY-MM-DD (meeting date)
 * shape:
 * {
 *   dateYmd: '2025-11-04',
 *   month: '2025-11',
 *   createdAt: new Date().toISOString(),
 *   metrics: { ...computeAll().metrics }
 * }
 */
export async function saveMetricsSnapshot({ dateYmd, month, metrics }) {
  const ref = doc(collection(db, COLL), dateYmd);
  await setDoc(ref, {
    dateYmd,
    month,
    createdAt: new Date().toISOString(),
    metrics,
  }, { merge: true });
}

/** Load newest N snapshots (default 12) ordered by dateYmd desc */
export async function loadRecentSnapshots({ limit = 12 } = {}) {
  const q = query(collection(db, COLL), orderBy("dateYmd", "desc"), qLimit(limit));
  const snap = await getDocs(q);
  const rows = [];
  snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
  // reverse to ascending for chart x-axis
  return rows.reverse();
}