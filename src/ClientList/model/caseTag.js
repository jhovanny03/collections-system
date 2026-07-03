// src/ClientList/model/caseTag.js
export function buildCompactCaseTag(client) {
  const raw = (client.caseTitle || "").trim();
  if (!raw) return null;

  const prefixMatch = raw.match(/^[A-Z]\s*\(\d{2}-\d{2}\)/i);
  const detailMatch = raw.match(/\(([^)]+)\)/);

  const parts = raw.split(/\s+/);
  const city = parts.length ? parts[parts.length - 1] : "";
  const cityAbbrev = city ? city.substring(0, 3).toUpperCase() : "";

  const fullName = `${client.firstName || ""} ${client.lastName || ""}`.trim();
  const detail = (detailMatch ? detailMatch[1] : "")
    .replace(/\s*\+\s*/g, "+")
    .replace(/\s{2,}/g, " ")
    .trim();

  const cleanedDetail = fullName
    ? detail.replace(new RegExp(fullName, "i"), "").trim()
    : detail;

  const prefix = prefixMatch ? prefixMatch[0].replace(/\s+/g, "") : "";
  const segs = [prefix, cleanedDetail, cityAbbrev].filter(Boolean);

  return segs.join(" • ") || null;
}