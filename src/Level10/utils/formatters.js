export function fmt(value, type) {
  if (value == null || value === "") return "—";
  if (type === "currency") return usd(value);
  if (type === "percent") return `${stripTrailingZeros(round(value, 2))}%`;
  return stringify(value);
}

function usd(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return String(n);
  return v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function round(n, d = 0) {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

function stripTrailingZeros(s) {
  return String(s).replace(/\.0+%?$/, "%").replace(/(\.\d*[1-9])0+%?$/, "$1%");
}

function stringify(v) {
  return typeof v === "number" ? v.toLocaleString() : String(v);
}