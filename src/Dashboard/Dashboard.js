import React from "react";
import { Container, Grid, Typography } from "@mui/material";
import SummaryCards from "./SummaryCards";
import AmountByCaseType from "./AmountByCaseType";
import CasesByStatus from "./CasesByStatus";
import PaymentsOverTime from "./PaymentsOverTime";
import PastDueLast3Months from "./PastDueLast3Months";
import PaymentsLast3Months from "./PaymentsLast3Months";
import ExpectedPayments from "./ExpectedPayments";
import OutstandingVsCollected from "./OutstandingVsCollected";

const Dashboard = () => {
  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Collections Dashboard
      </Typography>

      {/* Summary Cards Row */}
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={4}>
          <SummaryCards />
        </Grid>
      </Grid>

      {/* Charts Row 1 */}
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} sm={6} md={4}>
          <AmountByCaseType />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <CasesByStatus />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <PaymentsOverTime />
        </Grid>
      </Grid>

      {/* Charts Row 2 */}
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} sm={6} md={4}>
          <PastDueLast3Months />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <PaymentsLast3Months />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <ExpectedPayments />
        </Grid>
      </Grid>

      {/* Final Chart Row */}
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} sm={6} md={4}>
          <OutstandingVsCollected />
        </Grid>
      </Grid>
    </Container>
  );
};

export default Dashboard;
