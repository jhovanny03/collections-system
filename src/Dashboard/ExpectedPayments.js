import React from "react";
import { Card, CardContent, Typography } from "@mui/material";

const ExpectedPayments = () => {
  const expectedTotal = 40000;

  return (
    <Card sx={{ bgcolor: "background.paper", boxShadow: 3, borderRadius: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Expected Payments This Month
        </Typography>
        <Typography variant="h4" align="center" color="primary">
          ${expectedTotal.toLocaleString()}
        </Typography>
      </CardContent>
    </Card>
  );
};

export default ExpectedPayments;
