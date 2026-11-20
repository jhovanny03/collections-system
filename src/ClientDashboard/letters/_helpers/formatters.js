// src/ClientDashboard/letters/_helpers/formatters.js
import { asDate } from "../../../utils/dates";
export const money = (n) =>
  `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export const dateLong = (d) =>
  asDate(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });