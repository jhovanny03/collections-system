// src/Dashboard/PaymentsVsPastDueLast6Months.jsx
import React from "react";
import DashboardCard from "./DashboardCard";
import { BarChart } from "@mui/x-charts/BarChart";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
// Datos de ejemplo; cambia a tus agregados reales cuando los tengas
const paid =    [12000, 15000,  9500, 18000, 13500, 16000];
const pastDue = [ 3000,  4000,  6000,  2500,  5000,  4200];

export default function PaymentsVsPastDueLast6Months({ height = 320 }) {
  return (
    <DashboardCard title="Payments vs Past Due (Last 6 Months)">
      <BarChart
        height={height}
        xAxis={[{ scaleType: "band", data: months }]}
        series={[
          { id: "paid",     label: "Paid",     data: paid },
          { id: "pastDue",  label: "Past Due", data: pastDue },
        ]}
        slotProps={{ legend: { position: { vertical: "top", horizontal: "right" } } }}
        layout="verticalBars" // agrupado estándar
        grid={{ horizontal: true }}
      />
    </DashboardCard>
  );
}
