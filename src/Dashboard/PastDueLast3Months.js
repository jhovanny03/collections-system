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

const PastDueLast3Months = () => {
  const data = [
    { month: "March", pastDue: 25000 },
    { month: "April", pastDue: 30000 },
    { month: "May", pastDue: 20000 },
  ];

  return (
    <Card sx={{ bgcolor: "background.paper", boxShadow: 3, borderRadius: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Past Due Last 3 Months
        </Typography>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="pastDue" fill="#f43f5e" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default PastDueLast3Months;
