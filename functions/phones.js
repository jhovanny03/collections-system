// functions/phones.js
// Phone numbers in one format (E.164, "+15551234567") so a RingCentral call can be
// matched to a client. MyCase stores them typed by hand: "(555) 123-4567", "+1555…",
// "555.123.4567 ext 2", foreign numbers with or without "+" / "011".

/** E.164 for a typed number, or null. US/Canada when there is no country code. */
function normalizePhone(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/\s*(ext\.?|x|extension)\s*\d+\s*$/i, ""); // drop an extension
  const plus = s.startsWith("+");
  let d = s.replace(/\D/g, "");
  if (!d) return null;
  if (!plus && d.startsWith("011")) return d.length > 8 ? `+${d.slice(3)}` : null; // dialled internationally from the US
  if (plus) return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (d.length > 11 && d.length <= 15) return `+${d}`; // foreign number typed without "+"
  return null;
}

/** Unique E.164 numbers from a MyCase client row (cell first). */
function phonesOf(row) {
  const out = [];
  for (const k of ["cell_phone", "work_phone", "home_phone"]) {
    const p = normalizePhone(row && row[k]);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

/** "(555) 123-4567" for US numbers, the E.164 form otherwise. */
function displayPhone(e164) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(String(e164 || ""));
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : String(e164 || "");
}

module.exports = { normalizePhone, phonesOf, displayPhone };
