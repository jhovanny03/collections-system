// src/Dashboard/AmountByCaseType.jsx
import React, { useEffect, useMemo, useState } from "react";
import DashboardCard from "./DashboardCard";
import { BarChart } from "@mui/x-charts/BarChart";
import { Box, Typography, useTheme } from "@mui/material";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

// ---- helpers (aligned with your Dashboard.js) ----
const toDate = (v) =>
  v?.toDate?.() ? v.toDate() : isNaN(new Date(v)) ? null : new Date(v);

function monthsSinceStartReporting(start, asOf) {
  return Math.floor((asOf.getFullYear() - start.getFullYear()) * 12 + (asOf.getMonth() - start.getMonth())) + 1;
}

// Same “ReportingSummary-style” amount owed you used for Total Owed
function amountDueReportingStyleAsOf(client, asOf = new Date()) {
  const monthly = Number(client?.installmentAmount || 500);
  const raw = client?.firstInstallmentDate;
  if (!raw || !monthly) return 0;
  const start = raw?.seconds ? new Date(raw.seconds * 1000) : new Date(raw);
  if (!start || isNaN(start)) return 0;

  const paidTotal = (client?.payments || [])
    .map((p) => ({ amount: Number(p?.amount || 0), date: new Date(p?.date) }))
    .filter((p) => !isNaN(p.date) && p.date >= start) // no upper bound (matches your RS logic)
    .reduce((sum, p) => sum + p.amount, 0);

  const months = monthsSinceStartReporting(start, asOf);
  const paidMonths = Math.floor(paidTotal / monthly);
  const missedMonths = Math.max(0, months - paidMonths);

  return missedMonths * monthly;
}

const money = (n) => `$${Math.round(Number(n || 0)).toLocaleString()}`;

export default function AmountByCaseType({ height = 300, clients: clientsProp }) {
  const theme = useTheme();
  const [clients, setClients] = useState(Array.isArray(clientsProp) ? clientsProp : null);

  // Keep in sync if parent passes clients
  useEffect(() => {
    if (Array.isArray(clientsProp)) setClients(clientsProp);
  }, [clientsProp]);

  // Fallback: load from Firestore if not provided
  useEffect(() => {
    if (clients !== null) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "clients"));
        setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("🔥 Error loading clients for AmountByCaseType:", e);
        setClients([]);
      }
    })();
  }, [clients]);

  const rows = useMemo(() => {
    if (!Array.isArray(clients)) return [];
    const today = new Date();

    // Aggregate owed by caseType
    const map = new Map();
    for (const c of clients) {
      const ct = String(c.caseType || "—");
      const owed = amountDueReportingStyleAsOf(c, today);
      if (!owed) continue;
      map.set(ct, (map.get(ct) || 0) + owed);
    }

    // Build array and sort desc
    return Array.from(map.entries())
      .map(([caseType, amount]) => ({ caseType, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [clients]);

  // Prepare chart data
  const xCats = rows.map((r) => r.caseType);
  const yVals = rows.map((r) => Math.round(r.amount));

  return (
    <DashboardCard title="Amount Owed by Case Type">
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No data.</Typography>
      ) : (
        <Box sx={{ px: { xs: 0.5, sm: 1 } }}>
          <BarChart
            height={height}
            margin={{ left: 90, right: 16, top: 16, bottom: 28 }} // extra left so labels never clip
            grid={{ horizontal: true }}
            xAxis={[
              {
                scaleType: "band",
                data: xCats,
                categoryGapRatio: 0.35,
              },
            ]}
            series={[
              {
                label: "Amount Owed",
                data: yVals,
                valueFormatter: (v) => money(v),
              },
            ]}
            slotProps={{
              legend: { hidden: true }, // legend not needed—labels are clear
            }}
            sx={{
              // nicer bars + readable axis
              "& .MuiChartsAxis-tickLabel": { fontSize: 12 },
              "& .MuiBarElement-root": {
                rx: 6, // rounded corners
                fill: theme.palette.primary.main,
              },
              "& .MuiChartsAxis-left .MuiChartsAxis-tickLabel": {
                // allow long case types to wrap-ish by truncation
                textOverflow: "ellipsis",
              },
            }}
          />
        </Box>
      )}
    </DashboardCard>
  );
}