// src/utils/dates.js
//
// Payment and promise dates are stored as plain calendar dates ("2026-03-15").
// `new Date("2026-03-15")` reads that as midnight UTC, which in New York is the
// evening of the 14th, so it displays one day early. These helpers read a plain
// date as local midnight instead, and leave real timestamps alone.

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

// new Date(y, m, d) maps years 0-99 to 1900-1999; setFullYear keeps the year as
// written, so a typo like "0026-05-01" is not silently moved to 1926.
function localMidnight(m) {
  const d = new Date(2000, 0, 1);
  d.setFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d;
}

/** Date for a stored value: "YYYY-MM-DD", ISO timestamp, Firestore Timestamp or Date. */
export function parseDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return isNaN(value) ? null : value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  if (typeof value === "string") {
    const m = value.match(YMD);
    if (m) return localMidnight(m);
  }
  const d = new Date(value);
  return isNaN(d) ? null : d;
}

/**
 * Drop-in replacement for `new Date(value)` in calculations: identical behaviour
 * for every input (including Invalid Date for junk, so existing isNaN checks still
 * work) except a plain "YYYY-MM-DD", which becomes local midnight instead of UTC.
 * Without it a payment dated the 1st lands in the previous month in New York.
 */
export function asDate(value) {
  if (typeof value === "string") {
    const m = value.match(YMD);
    if (m) return localMidnight(m);
  }
  return new Date(value);
}

/** Display a stored date; `fallback` when it is missing or unreadable. */
export function formatDate(value, options, fallback = "—") {
  const d = parseDate(value);
  return d ? d.toLocaleDateString(undefined, options) : fallback;
}

export const LONG_DATE = { year: "numeric", month: "long", day: "numeric" };

/** Today's local date as "YYYY-MM-DD" (toISOString() would give tomorrow after 8 PM in New York). */
export function todayYMD(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
