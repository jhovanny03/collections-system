import React from "react";
import { Card, CardContent, Typography } from "@mui/material";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const CasesByStatus = () => {
  const data = [
    { status: "Active", value: 60 },
    { status: "Filed", value: 25 },
    { status: "Approved", value: 15 },
  ];
  const COLORS = ["#3b82f6", "#10b981", "#f59e0b"];

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Cases by Status
        </Typography>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="status"
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
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default CasesByStatus;
