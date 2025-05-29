import React from "react";
import { Box, useTheme, Typography } from "@mui/material";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Sample data — replace with your actual data source
const data = [
  { month: "Jan", value: 12000 },
  { month: "Feb", value: 15000 },
  { month: "Mar", value: 9500 },
  { month: "Apr", value: 18000 },
  { month: "May", value: 13500 },
];

const PaymentsOverTime = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Box
      sx={{
        backgroundColor: isDark ? "#1e1e1e" : "#fff",
        color: isDark ? "#fff" : "#000",
        p: 2,
        borderRadius: 2,
        boxShadow: 2,
        height: "100%",
      }}
    >
      <Typography variant="subtitle1" gutterBottom>
        Payments Over Time
      </Typography>

      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={isDark ? "#444" : "#ccc"}
          />
          <XAxis dataKey="month" stroke={isDark ? "#ccc" : "#333"} />
          <YAxis stroke={isDark ? "#ccc" : "#333"} />
          <Tooltip
            contentStyle={{
              backgroundColor: isDark ? "#333" : "#fff",
              color: isDark ? "#fff" : "#000",
              border: "none",
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#3f51b5"
            strokeWidth={2}
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
};

export default PaymentsOverTime;
