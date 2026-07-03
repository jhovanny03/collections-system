// src/Level10/services/level10.api.js
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc, serverTimestamp } from "firebase/firestore";
import db from "../../firebase";

/** Paths */
export const monthDocRef = (month) => doc(db, `level10/${month}`);
export const weekDocRef = (month, dateYmd) => doc(db, `level10/${month}/weeks/${dateYmd}`);
const ownersDocRef = () => doc(db, `level10/_owners`);

/** Load month doc (columns + (legacy) ownerByMetric if present) */
export async function loadMonth(month) {
  const snap = await getDoc(monthDocRef(month));
  if (!snap.exists()) return { columns: [], ownerByMetric: {} };
  const data = snap.data() || {};
  return {
    columns: Array.isArray(data.columns) ? data.columns : [],
    ownerByMetric: data.ownerByMetric || {}, // legacy support (used only for one-time migration)
  };
}

/** List all week docs under month; returns { [dateYmd]: { metrics, manual } } */
export async function loadWeeksMap(month) {
  const col = collection(db, `level10/${month}/weeks`);
  const qs = await getDocs(col);
  const map = {};
  qs.forEach((d) => (map[d.id] = d.data() || {}));
  return map;
}

/** Ensure month column exists for date */
export async function ensureMonthColumn(month, dateYmd) {
  const ref = monthDocRef(month);
  const snap = await getDoc(ref);
  const base = snap.exists() ? (snap.data() || {}) : {};
  const columns = Array.isArray(base.columns) ? base.columns.slice() : [];
  if (!columns.includes(dateYmd)) {
    columns.push(dateYmd);
    columns.sort(); // ascending YYYY-MM-DD
    await setDoc(ref, { columns }, { merge: true });
  }
}

/** Upsert week metrics; preserves existing manual */
export async function upsertWeekMetrics({ month, dateYmd, metrics, createdBy }) {
  const ref = weekDocRef(month, dateYmd);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() || {}) : {};
  await setDoc(
    ref,
    {
      metrics,
      manual: existing.manual || {},
      createdAt: existing.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: existing.createdBy || (createdBy || "System"),
    },
    { merge: true }
  );
}

/** Update a single manual metric cell */
export async function updateManualCell({ month, dateYmd, metricId, value }) {
  const ref = weekDocRef(month, dateYmd);
  await updateDoc(ref, { [`manual.${metricId}`]: value });
}

/** -------- GLOBAL OWNERS (new) -------- */

/** Load global owners from level10/_owners */
export async function loadGlobalOwners() {
  const snap = await getDoc(ownersDocRef());
  return snap.exists() ? (snap.data()?.ownerByMetric || {}) : {};
}

/** Save global owners to level10/_owners */
export async function saveGlobalOwners(ownerByMetric) {
  await setDoc(ownersDocRef(), { ownerByMetric, updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * One-time migration helper:
 * If the given month doc has legacy ownerByMetric and the global doc is empty,
 * copy owners from the month into global and clear legacy field from the month.
 */
export async function migrateOwnersIfNeeded(month) {
  const globalSnap = await getDoc(ownersDocRef());
  const globalOwners = globalSnap.exists() ? (globalSnap.data()?.ownerByMetric || {}) : {};

  if (globalOwners && Object.keys(globalOwners).length > 0) {
    return globalOwners; // already have global owners
  }

  const mSnap = await getDoc(monthDocRef(month));
  if (!mSnap.exists()) return {};

  const monthOwners = mSnap.data()?.ownerByMetric || {};
  if (monthOwners && Object.keys(monthOwners).length > 0) {
    // write to global
    await saveGlobalOwners(monthOwners);
    // optional: clean up legacy owners in month doc
    await setDoc(monthDocRef(month), { ownerByMetric: {} }, { merge: true });
    return monthOwners;
  }

  return {};
}

/** Bulk delete week docs for selected ids (helper for MonthBar multi-delete) */
export async function bulkDeleteWeekDocs(month, dateIds = []) {
  await Promise.all(
    dateIds.map((id) => deleteDoc(weekDocRef(month, id)))
  );
}