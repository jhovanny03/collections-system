import React from "react";
import { Grid, Card, CardContent, Typography, Box } from "@mui/material";
import {
  User,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Calendar,
} from "lucide-react";

const SummaryCards = () => {
  const stats = [
    {
      label: "Total Clients",
      value: 120,
      icon: <User size={32} color="#3b82f6" />,
    },
    {
      label: "Total Owed",
      value: "$150,000",
      icon: <DollarSign size={32} color="#3b82f6" />,
    },
    {
      label: "Past Due Clients",
      value: 45,
      icon: <AlertCircle size={32} color="#f43f5e" />,
    },
    {
      label: "Active Arrangements",
      value: 20,
      icon: <CheckCircle size={32} color="#10b981" />,
    },
    {
      label: "Promised Payments",
      value: "$30,000",
      icon: <Calendar size={32} color="#f59e0b" />,
    },
  ];

  return (
    <Grid container spacing={2}>
      {stats.map((stat, index) => (
        <Grid item xs={12} sm={6} md={2.4} key={index}>
          <Card
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              p: 2,
            }}
          >
            <Box mb={1}>{stat.icon}</Box>
            <Typography variant="subtitle1">{stat.label}</Typography>
            <Typography variant="h5" fontWeight="bold">
              {stat.value}
            </Typography>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};

export default SummaryCards;
