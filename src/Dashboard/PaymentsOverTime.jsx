import React from 'react';
import DashboardCard from './DashboardCard';
import { LineChart } from '@mui/x-charts/LineChart';

const data = [
  { month: 'Jan', value: 12000 },
  { month: 'Feb', value: 15000 },
  { month: 'Mar', value: 9500 },
  { month: 'Apr', value: 18000 },
  { month: 'May', value: 13500 },
];

export default function PaymentsOverTime({ height = 320 }) {
  return (
    <DashboardCard title="Payments Over Time">
      <LineChart
        height={height}
        xAxis={[{ scaleType: 'band', data: data.map(d => d.month) }]}
        series={[{ data: data.map(d => d.value), curve: 'monotoneX' }]}
        grid={{ horizontal: true }}
      />
    </DashboardCard>
  );
}
