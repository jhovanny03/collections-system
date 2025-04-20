import React, { useEffect, useState } from "react";
import {
  Container,
  Typography,
  Divider,
  Box,
  List,
  ListItem,
  Chip,
  Grid,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import { Link } from "react-router-dom";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { DateCalendar } from "@mui/x-date-pickers";
import { collection, getDocs } from "firebase/firestore";
import db from "./firebase";

function PromisedPaymentCalendar() {
  const [clients, setClients] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [promisesOnDate, setPromisesOnDate] = useState([]);
  const [selectedPromise, setSelectedPromise] = useState(null);

  useEffect(() => {
    const fetchClients = async () => {
      const snapshot = await getDocs(collection(db, "clients"));
      const allClients = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setClients(allClients);
    };
    fetchClients();
  }, []);

  const handleDateClick = (date) => {
    setSelectedDate(date);
    const matches = clients.filter(
      (client) =>
        client.paymentPromise?.date &&
        new Date(client.paymentPromise.date).toDateString() ===
          date.toDateString()
    );
    setPromisesOnDate(matches);
  };

  const today = new Date();
  const thisMonth = today.getMonth();
  const thisYear = today.getFullYear();

  const isMissed = (date) => {
    return new Date(date).setHours(0, 0, 0, 0) < today.setHours(0, 0, 0, 0);
  };

  const summary = clients.reduce(
    (acc, client) => {
      const promise = client.paymentPromise;
      if (!promise?.date || isNaN(new Date(promise.date))) return acc;

      const date = new Date(promise.date);
      const isSameDay = date.toDateString() === today.toDateString();

      if (date.getMonth() === thisMonth && date.getFullYear() === thisYear) {
        acc.totalThisMonth += parseFloat(promise.amount || 0);
      }

      if (isMissed(promise.date)) {
        acc.missed += 1;
      } else {
        acc.upcoming += 1;
      }

      if (isSameDay) {
        acc.today += 1;
      }

      return acc;
    },
    {
      totalThisMonth: 0,
      missed: 0,
      upcoming: 0,
      today: 0,
    }
  );

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
      <Box
        sx={{
          background: "linear-gradient(to right, #4e54c8, #8f94fb)",
          color: "white",
          borderRadius: "12px",
          padding: "2rem",
          mb: 4,
          textAlign: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        }}
      >
        <Typography variant="h4" fontWeight={600}>
          🗓️ Promised Payment Calendar
        </Typography>
        <Typography variant="subtitle1" mt={1} sx={{ opacity: 0.9 }}>
          Track upcoming, missed, and completed payment promises
        </Typography>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          {
            label: "💰 Total Promised",
            value: `$${summary.totalThisMonth.toLocaleString()}`,
            color: "#4e54c8",
          },
          { label: "🔴 Missed", value: summary.missed, color: "#dc3545" },
          { label: "🟢 Upcoming", value: summary.upcoming, color: "#28a745" },
          { label: "📅 Today", value: summary.today, color: "#6c63ff" },
        ].map((card, idx) => (
          <Grid item xs={6} sm={3} key={idx}>
            <Paper
              elevation={3}
              sx={{
                p: 2,
                textAlign: "center",
                borderRadius: "16px",
                background: "rgba(255,255,255,0.75)",
                backdropFilter: "blur(6px)",
                boxShadow: "0 8px 20px rgba(0,0,0,0.05)",
              }}
            >
              <Typography
                variant="body2"
                sx={{ color: card.color, fontWeight: 600 }}
              >
                {card.label}
              </Typography>
              <Typography variant="h6" fontWeight={700}>
                {card.value}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* 📅 MUI Calendar Resized & Centered */}
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <Box sx={{ display: "flex", justifyContent: "center", my: 4 }}>
          <DateCalendar
            value={selectedDate}
            onChange={(newDate) => handleDateClick(newDate)}
            sx={{
              backgroundColor: "#fff",
              borderRadius: "12px",
              boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
              p: 2,
              width: "100%",
              maxWidth: 500,
            }}
          />
        </Box>
      </LocalizationProvider>

      {promisesOnDate.length > 0 && (
        <Box mt={4}>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            💵 Promises on {selectedDate.toDateString()}
          </Typography>
          <List>
            {promisesOnDate.map((client) => (
              <ListItem
                key={client.id}
                onClick={() => setSelectedPromise(client)}
                sx={{
                  mb: 2,
                  px: 3,
                  py: 2,
                  backgroundColor: "#fff",
                  borderRadius: "16px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                  cursor: "pointer",
                  "&:hover": {
                    boxShadow: "0 6px 18px rgba(0,0,0,0.1)",
                    transform: "translateY(-2px)",
                    backgroundColor: "#f9f9ff",
                  },
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {client.firstName} {client.lastName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    💵 $
                    {parseFloat(client.paymentPromise.amount).toLocaleString()}
                  </Typography>
                  {client.paymentPromise.notes && (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      📝 {client.paymentPromise.notes}
                    </Typography>
                  )}
                </Box>
                <Chip
                  label={
                    isMissed(client.paymentPromise.date) ? "Missed" : "Upcoming"
                  }
                  color={
                    isMissed(client.paymentPromise.date) ? "error" : "success"
                  }
                  size="small"
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      <Dialog
        open={!!selectedPromise}
        onClose={() => setSelectedPromise(null)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: "16px", p: 2 } }}
      >
        {selectedPromise && (
          <>
            <DialogTitle sx={{ fontWeight: 700, pb: 0 }}>
              🔍 {selectedPromise.firstName} {selectedPromise.lastName}
            </DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
              <Box sx={{ mb: 1 }}>
                <Typography variant="body1" gutterBottom>
                  💵 <strong>Amount:</strong> $
                  {parseFloat(
                    selectedPromise.paymentPromise.amount
                  ).toLocaleString()}
                </Typography>
                <Typography variant="body1" gutterBottom>
                  📅 <strong>Date:</strong>{" "}
                  {new Date(selectedPromise.paymentPromise.date).toDateString()}
                </Typography>
                <Typography variant="body1" gutterBottom>
                  📝 <strong>Notes:</strong>{" "}
                  {selectedPromise.paymentPromise.notes || "None"}
                </Typography>
              </Box>
              <Chip
                label={
                  isMissed(selectedPromise.paymentPromise.date)
                    ? "Missed"
                    : "Upcoming"
                }
                color={
                  isMissed(selectedPromise.paymentPromise.date)
                    ? "error"
                    : "success"
                }
                sx={{ mt: 1 }}
              />
            </DialogContent>
            <DialogActions sx={{ pr: 3, pb: 2 }}>
              <Button
                variant="contained"
                component={Link}
                to={`/client/${selectedPromise?.id}`}
                onClick={() => setSelectedPromise(null)}
              >
                View Dashboard
              </Button>
              <Button onClick={() => setSelectedPromise(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Container>
  );
}

export default PromisedPaymentCalendar;
