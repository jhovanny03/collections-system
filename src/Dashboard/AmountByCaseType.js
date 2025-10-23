import React from 'react';
import DashboardCard from './DashboardCard';
import { BarChart } from '@mui/x-charts/BarChart';

const rows = [
  { caseType: 'VAWA', amount: 50000 },
  { caseType: 'U Visa', amount: 30000 },
  { caseType: 'T Visa', amount: 20000 },
  { caseType: 'Asylum', amount: 15000 },
];

export default function AmountByCaseType() {
  return (
    <DashboardCard title="Amount Owed by Case Type">
      <BarChart
        height={280}
        xAxis={[{ scaleType: 'band', data: rows.map(r => r.caseType) }]}
        series={[{ data: rows.map(r => r.amount) }]}
        grid={{ horizontal: true }}
      />
    </DashboardCard>
  );
}
