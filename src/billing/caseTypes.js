// src/billing/caseTypes.js
// Same mapping as mapCaseType in functions/mycaseSync.js (keep in step): MyCase practice
// area -> the case type the team chose for it 90%+ of the time. Others: billing picks.
export const PRACTICE_AREA_TYPES = {
  VAWASPOUSE: "VAWA SPOUSE", VAWA: "VAWA SPOUSE", WIDOWERI360: "VAWA SPOUSE",
  VAWAPARENT: "PARENT VAWA", PARENTVAWA: "PARENT VAWA", VAWACHILD: "CHILD VAWA", CHILDVAWA: "CHILD VAWA",
  TVISA: "T VISA", TVISALABOR: "T VISA", TVISADV: "T VISA", TVISASMUGGLING: "T VISA",
  UVISA: "U VISA", MARRIAGEAOS: "MARRIAGE AOS", N400: "N400",
  I751REGULAR: "I751 REGULAR", I751DIVORCEWAIVER: "I751 REGULAR", I751ECB: "I751 ECB",
  I90: "I90", ASYLUM: "ASYLUM", REMOVALDEFENSE: "REMOVAL DEFENSE",
};

/** The case type for a MyCase practice area (functions/mycaseSync.js caseTypeFromMyCase). */
export const caseTypeFromMyCase = (practiceArea) => {
  const raw = String(practiceArea || "").trim();
  if (!raw || /^[-\s]+$/.test(raw)) return "";
  return PRACTICE_AREA_TYPES[raw.toUpperCase().replace(/[^A-Z0-9]/g, "")] || raw.toUpperCase();
};
