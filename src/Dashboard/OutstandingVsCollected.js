import React from 'react';
import DashboardCard from './DashboardCard';
import { PieChart } from '@mui/x-charts/PieChart';

export default function OutstandingVsCollected() {
  const data = [
    { id: 0, label: 'Outstanding', value: 35000 },
    { id: 1, label: 'Collected', value: 15000 },
  ];

  return (
    <DashboardCard title="Outstanding vs Collected">
      <PieChart
        series={[{
          data,
          innerRadius: 10,
          outerRadius: 90,
          paddingAngle: 2,
        }]}
        height={280}
        slotProps={{
          legend: { hidden: false },
        }}
      />
    </DashboardCard>
  );
}
