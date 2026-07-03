import React, { createContext, useContext, useMemo, useState } from "react";
import { MOCK_MONTH, MOCK_WEEKS } from "./config/mockData";

const Ctx = createContext(null);

export function L10Provider({ children }) {
  const [mode] = useState("mock"); // "mock" | "live"
  const [month, setMonth] = useState(MOCK_MONTH);
  const [tab, setTab] = useState("scorecard");
  const weeks = useMemo(() => MOCK_WEEKS, []);
  const value = useMemo(() => ({ mode, month, setMonth, weeks, tab, setTab }), [mode, month, weeks, tab]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useL10() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useL10 must be used within L10Provider");
  return v;
}