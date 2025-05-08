import React from "react";
import { Card, CardContent, Typography } from "@mui/material";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const OutstandingVsCollected = () => {
  const data = [
    { name: "Outstanding", value: 35000 },
    { name: "Collected", value: 15000 },
  ];
  const COLORS = ["#f43f5e", "#10b981"];

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Outstanding vs Collected
        </Typography>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default OutstandingVsCollected;
