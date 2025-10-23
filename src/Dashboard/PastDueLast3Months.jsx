import React from 'react';
import DashboardCard from './DashboardCard';
import { BarChart } from '@mui/x-charts/BarChart';

const rows = [
  { month: 'March', pastDue: 25000 },
  { month: 'April', pastDue: 30000 },
  { month: 'May', pastDue: 20000 },
];

export default function PastDueLast3Months({ height = 300 }) {
  return (
    <DashboardCard title="Past Due Last 3 Months">
      <BarChart
        height={height}
        xAxis={[{ scaleType: 'band', data: rows.map(r => r.month) }]}
        series={[{ data: rows.map(r => r.pastDue) }]}
        grid={{ horizontal: true }}
      />
    </DashboardCard>
  );
}
