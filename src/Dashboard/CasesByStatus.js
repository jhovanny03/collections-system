import React from 'react';
import DashboardCard from './DashboardCard';
import { PieChart } from '@mui/x-charts/PieChart';

const data = [
  { id: 0, label: 'Active', value: 60 },
  { id: 1, label: 'Filed', value: 25 },
  { id: 2, label: 'Approved', value: 15 },
];

export default function CasesByStatus() {
  return (
    <DashboardCard title="Cases by Status">
      <PieChart
        height={280}
        series={[{
          data,
          innerRadius: 0,
          outerRadius: 90,
          paddingAngle: 2,
        }]}
      />
    </DashboardCard>
  );
}
