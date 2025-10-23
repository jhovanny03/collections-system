import React from 'react';
import { Typography } from '@mui/material';
import DashboardCard from './DashboardCard';

export default function ExpectedPayments() {
  const expectedTotal = 40000;

  return (
    <DashboardCard title="Expected Payments This Month">
      <Typography
        variant="h4"
        align="center"
        color="primary"
        sx={{ fontWeight: 700 }}
      >
        ${expectedTotal.toLocaleString()}
      </Typography>
    </DashboardCard>
  );
}
