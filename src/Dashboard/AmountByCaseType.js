import React from "react";
import { Card, CardContent, Typography } from "@mui/material";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const AmountByCaseType = () => {
  const data = [
    { caseType: "VAWA", amount: 50000 },
    { caseType: "U Visa", amount: 30000 },
    { caseType: "T Visa", amount: 20000 },
    { caseType: "Asylum", amount: 15000 },
  ];

  return (
    <Card sx={{ bgcolor: "background.paper", boxShadow: 3, borderRadius: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Amount Owed by Case Type
        </Typography>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="caseType" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="amount" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default AmountByCaseType;
