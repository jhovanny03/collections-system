import React from "react";
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Avatar,
  Box,
} from "@mui/material";
import {
  Person,
  AttachMoney,
  Warning,
  CheckCircle,
  CalendarToday,
} from "@mui/icons-material";

const SummaryCards = () => {
  const stats = [
    {
      label: "Total Clients",
      value: 120,
      icon: <Person />,
      color: "primary.main",
    },
    {
      label: "Total Owed",
      value: "$150,000",
      icon: <AttachMoney />,
      color: "success.main",
    },
    {
      label: "Past Due Clients",
      value: 45,
      icon: <Warning />,
      color: "error.main",
    },
    {
      label: "Active Arrangements",
      value: 20,
      icon: <CheckCircle />,
      color: "info.main",
    },
    {
      label: "Promised Payments",
      value: "$30,000",
      icon: <CalendarToday />,
      color: "secondary.main",
    },
  ];

  return (
    <Grid container spacing={3}>
      {stats.map((stat, index) => (
        <Grid item xs={12} sm={6} md={2.4} key={index}>
          <Card
            sx={{
              p: 2,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              bgcolor: "background.paper",
              boxShadow: 3,
              borderRadius: 2,
            }}
          >
            <Avatar sx={{ bgcolor: stat.color, mb: 1 }}>{stat.icon}</Avatar>
            <Typography variant="subtitle2" color="textSecondary">
              {stat.label}
            </Typography>
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
