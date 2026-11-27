// src/pages/promises/promiseStatus.js
// Where a client's current promise stands, from their payments (Promised payments page and
// the Monthly briefing). Kept = paid at least the amount between the day the promise was
// made and GRACE_DAYS after its date.
import { parseDate } from "../../utils/dates";
import { GRACE_DAYS } from "./PromisePanel";

const DAY = 864e5;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** { key: kept | today | upcoming | grace | missed, paid } */
export function promiseStatus(promise, payments, today) {
  const due = parseDate(promise.date);
  if (!due) return { key: "upcoming", paid: 0 };
  const made = parseDate(promise.createdAt) || new Date(due.getTime() - 30 * DAY);
  const graceEnd = new Date(startOfDay(due).getTime() + (GRACE_DAYS + 1) * DAY - 1);
  const paid = (payments || []).reduce((s, p) => {
    const d = parseDate(p.date);
    return d && Number(p.amount) > 0 && d >= startOfDay(made) && d <= graceEnd ? s + Number(p.amount) : s;
  }, 0);
  const amount = Number(promise.amount || 0);
  if (amount > 0 && paid >= amount - 0.005) return { key: "kept", paid };
  const d0 = startOfDay(due).getTime();
  if (d0 === today.getTime()) return { key: "today", paid };
  if (d0 > today.getTime()) return { key: "upcoming", paid };
  if (today.getTime() <= graceEnd.getTime()) return { key: "grace", paid };
  return { key: "missed", paid };
}
