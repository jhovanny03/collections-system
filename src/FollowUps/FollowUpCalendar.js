import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { DateCalendar, PickersDay } from "@mui/x-date-pickers";
import Badge from "@mui/material/Badge";
import { format } from "date-fns";

const FollowUpCalendar = ({ clients = [] }) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [promises, setPromises] = useState([]);
  const [selectedPromise, setSelectedPromise] = useState(null);
  const [promiseMap, setPromiseMap] = useState({});

  useEffect(() => {
    const map = {};
    clients.forEach((c) => {
      const date = c.paymentPromise?.date;
      if (!date) return;
      const d = new Date(date);
      if (isNaN(d)) return;
      const key = d.toDateString();
      if (!map[key]) map[key] = [];
      map[key].push(c);
    });
    setPromiseMap(map);
  }, [clients]);

  useEffect(() => {
    const key = selectedDate.toDateString();
    setPromises(promiseMap[key] || []);
  }, [selectedDate, promiseMap]);

  const isMissed = (date) => {
    const today = new Date();
    return new Date(date).setHours(0, 0, 0, 0) < today.setHours(0, 0, 0, 0);
  };

  const renderDay = (day, _value, DayProps) => {
    const key = format(day, "yyyy-MM-dd");
    const hasPromise = !!promiseMap[day.toDateString()];
    return (
      <Badge
        key={key}
        overlap="circular"
        color="primary"
        variant={hasPromise ? "dot" : undefined}
      >
        <PickersDay {...DayProps} day={day} />
      </Badge>
    );
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          mt: 2,
        }}
      >
        {promises.length > 0 && (
          <Box mb={3} width="100%" maxWidth={500}>
            <Typography variant="h6" gutterBottom>
              Payment Promises on {selectedDate.toDateString()}
            </Typography>
            <List>
              {promises.map((client) => (
                <ListItem
                  key={client.id}
                  component={Paper}
                  sx={{
                    mb: 1,
                    p: 2,
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedPromise(client)}
                >
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="subtitle1">
                      {client.firstName} {client.lastName}
                    </Typography>
                    <Typography variant="body2">
                      ${parseFloat(client.paymentPromise.amount).toLocaleString()}
                    </Typography>
                  </Box>
                  <Chip
                    label={isMissed(client.paymentPromise.date) ? "Missed" : "Upcoming"}
                    color={isMissed(client.paymentPromise.date) ? "error" : "success"}
                    size="small"
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        <DateCalendar
          value={selectedDate}
          onChange={(newDate) => setSelectedDate(newDate)}
          renderDay={renderDay}
          sx={{
            backgroundColor: "#fff",
            borderRadius: 2,
            boxShadow: 1,
            p: 2,
            width: "100%",
            maxWidth: 500,
          }}
        />

        <Dialog
          open={!!selectedPromise}
          onClose={() => setSelectedPromise(null)}
          fullWidth
          maxWidth="sm"
        >
          {selectedPromise && (
            <>
              <DialogTitle>
                {selectedPromise.firstName} {selectedPromise.lastName}
              </DialogTitle>
              <DialogContent dividers>
                <Typography gutterBottom>
                  Amount: $
                  {parseFloat(selectedPromise.paymentPromise.amount).toLocaleString()}
                </Typography>
                <Typography gutterBottom>
                  Date: {new Date(selectedPromise.paymentPromise.date).toDateString()}
                </Typography>
                {selectedPromise.paymentPromise.notes && (
                  <Typography gutterBottom>
                    Notes: {selectedPromise.paymentPromise.notes}
                  </Typography>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setSelectedPromise(null)}>Close</Button>
              </DialogActions>
            </>
          )}
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default FollowUpCalendar;