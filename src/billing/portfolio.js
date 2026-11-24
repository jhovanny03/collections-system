// src/billing/portfolio.js
// The billing math lives in book.js (shared with the server); this adds the React hook.
import { useMemo } from "react";
import { clientRows, allPayments, summarize } from "./book";
export * from "./book";

const cache = new WeakMap();
/** Memoized portfolio for the shared clients array. */
export function usePortfolio(clients) {
  return useMemo(() => {
    if (cache.has(clients)) return cache.get(clients);
    const asOf = new Date();
    const rows = clientRows(clients, asOf);
    const payments = allPayments(clients);
    const value = { rows, payments, summary: summarize(rows, payments, asOf), asOf };
    cache.set(clients, value);
    return value;
  }, [clients]);
}
