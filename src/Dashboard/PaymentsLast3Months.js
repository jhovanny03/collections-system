import React from 'react';
import DashboardCard from './DashboardCard';
import { BarChart } from '@mui/x-charts/BarChart';

const rows = [
  { month: 'March', payments: 18000 },
  { month: 'April', payments: 22000 },
  { month: 'May', payments: 25000 },
];

export default function PaymentsLast3Months() {
  return (
    <DashboardCard title="Payments Last 3 Months">
      <BarChart
        height={280}
        xAxis={[{ scaleType: 'band', data: rows.map(r => r.month) }]}
        series={[{ data: rows.map(r => r.payments) }]}
        grid={{ horizontal: true }}
      />
    </DashboardCard>
  );
}
