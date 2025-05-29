import React from "react";
import { Box, Card, Typography, Grid } from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import WarningIcon from "@mui/icons-material/Warning";
import HandshakeIcon from "@mui/icons-material/Handshake";
import EventNoteIcon from "@mui/icons-material/EventNote";

const cards = [
  {
    title: "Total Clients",
    valueKey: "totalClients",
    icon: <PersonIcon fontSize="large" sx={{ color: "#6366f1" }} />,
    color: "#e0e7ff",
  },
  {
    title: "Total Owed",
    valueKey: "totalOwed",
    icon: <MonetizationOnIcon fontSize="large" sx={{ color: "#10b981" }} />,
    color: "#d1fae5",
    isCurrency: true,
  },
  {
    title: "Past Due Clients",
    valueKey: "pastDueClients",
    icon: <WarningIcon fontSize="large" sx={{ color: "#ef4444" }} />,
    color: "#fee2e2",
  },
  {
    title: "Active Arrangements",
    valueKey: "activeArrangements",
    icon: <HandshakeIcon fontSize="large" sx={{ color: "#0ea5e9" }} />,
    color: "#e0f2fe",
  },
  {
    title: "Promised Payments",
    valueKey: "promisedPayments",
    icon: <EventNoteIcon fontSize="large" sx={{ color: "#f472b6" }} />,
    color: "#fce7f3",
    isCurrency: true,
  },
];

const SummaryCards = ({ data }) => {
  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {cards.map((card) => (
        <Grid item xs={12} sm={6} md={2.4} key={card.title}>
          <Card
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              p: 2,
              borderRadius: 4,
              backgroundColor: card.color,
              height: "100%",
              boxShadow: 3,
            }}
          >
            <Box mb={1}>{card.icon}</Box>
            <Typography variant="body2" fontWeight="bold">
              {card.title}
            </Typography>
            <Typography variant="h6" fontWeight="bold">
              {card.isCurrency
                ? `$${Number(data?.[card.valueKey] || 0).toLocaleString()}`
                : data?.[card.valueKey] || 0}
            </Typography>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};

export default SummaryCards;
