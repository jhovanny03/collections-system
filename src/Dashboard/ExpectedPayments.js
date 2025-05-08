import React from "react";
import { Card, CardContent, Typography } from "@mui/material";

const ExpectedPayments = () => {
  const expectedTotal = 40000;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
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
