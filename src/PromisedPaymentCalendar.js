import React, { useEffect, useState, useMemo } from "react";
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
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper as MuiPaper,
} from "@mui/material";
import { Link } from "react-router-dom";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { DateCalendar } from "@mui/x-date-pickers";
import { collection, getDocs } from "firebase/firestore";
import db from "./firebase";
import { format, parseISO } from "date-fns";
import { alpha } from "@mui/material/styles"; // CHANGED

function PromisedPaymentCalendar() {
  const [clients, setClients] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [promisesOnDate, setPromisesOnDate] = useState([]);
  const [selectedPromise, setSelectedPromise] = useState(null);

  // NEW: rango (inicio/fin) del MES ACTIVO que controla lista + KPIs
  const monthRange = (d) => {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return [start, end];
  }; // NEW

  const [activeMonthStart, setActiveMonthStart] = useState(() => monthRange(new Date())[0]); // NEW
  const [activeMonthEnd, setActiveMonthEnd] = useState(() => monthRange(new Date())[1]);     // NEW

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
    const [ms, me] = monthRange(date);     // NEW
    setActiveMonthStart(ms);               // NEW
    setActiveMonthEnd(me);                 // NEW

    const matches = clients.filter(
      (client) =>
        client.paymentPromise?.date &&
        parseISO(client.paymentPromise.date).toDateString() ===
          date.toDateString()
    );
    setPromisesOnDate(matches);
  };
  
  const today = new Date();
  const todayStart = new Date(today);
  todayStart.setHours(0,0,0,0);

  const thisMonth = today.getMonth();
  const thisYear = today.getFullYear();

  // MOD: nueva isMissed usando parseISO y todayStart
const isMissed = (dateStr) => {
  const d = parseISO(dateStr);
  d.setHours(0,0,0,0);
  return d < todayStart;
};

const isTodayPromise = (dateStr) => {
  const d = parseISO(dateStr);
  d.setHours(0, 0, 0, 0);
  return d.getTime() === todayStart.getTime();
};

 /* const summary = clients.reduce(
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
  ); */

  // NEW: clientes con paymentPromise DENTRO del MES ACTIVO
  const clientsInActiveMonth = useMemo(() => {
    return clients.filter((c) => {
      const ds = c?.paymentPromise?.date;
      if (!ds) return false;
      const d = parseISO(ds);
      if (isNaN(d)) return false;
      d.setHours(0, 0, 0, 0);
      return d >= activeMonthStart && d <= activeMonthEnd;
    });
  }, [clients, activeMonthStart, activeMonthEnd]);

  // MOD: summary usando parseISO y todayStart para conteos correctos
/*const summary = clients.reduce(
  (acc, client) => {
    const promise = client.paymentPromise;
    if (!promise?.date) return acc;
    const date = parseISO(promise.date);
    if (isNaN(date)) return acc;

    // Total del mes
    if (
      date.getFullYear() === thisYear &&
      date.getMonth() === thisMonth
    ) {
      acc.totalThisMonth += parseFloat(promise.amount || 0);
    }

    if (date < todayStart) {
    acc.missed += 1;
  } else if (date.getTime() === todayStart.getTime()) {
    acc.today += 1;
  } else if (date > todayStart) {
    acc.upcoming += 1;
  }

    return acc;
  },
  { totalThisMonth: 0, missed: 0, upcoming: 0, today: 0 }
); */

const summary = useMemo(() => {
    const acc = { totalThisMonth: 0, missed: 0, upcoming: 0, today: 0 };
    for (const client of clientsInActiveMonth) {
      const p = client.paymentPromise;
      if (!p?.date) continue;
      const d = parseISO(p.date);
      if (isNaN(d)) continue;
      d.setHours(0, 0, 0, 0);

      // Total del MES ACTIVO (ya estamos filtrados por mes activo)
      const amt = parseFloat(p.amount || 0);
      acc.totalThisMonth += isFinite(amt) ? amt : 0;

      // Missed / Today / Upcoming dentro del MES ACTIVO
      if (d.getTime() === todayStart.getTime()) acc.today += 1;
      else if (d < todayStart) acc.missed += 1;
      else acc.upcoming += 1;
    }
    return acc;
  }, [clientsInActiveMonth, todayStart]);

  return (
    <Container maxWidth={false} disableGutters sx={{ mt: 4, mb: 6, px: 0 }}>
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
              elevation={0}
              sx={(t) => ({
          p: 2,
          textAlign: "center",
          borderRadius: "16px",
          // CHANGED: fondo depende del modo
          backgroundColor:
            t.palette.mode === "dark"
              ? alpha(t.palette.common.white, 0.08)
              : alpha(t.palette.common.black, 0.02),
          backdropFilter: "blur(6px)",
          
          border: `1px solid ${t.palette.divider}`,
        })}
            >
              <Typography
                variant="body2"
                sx={(t) => ({
            color: card.color,
            fontWeight: 600,
            textShadow:
              t.palette.mode === "dark"
                ? "0 0 0.6px rgba(255,255,255,0.7)"
                : "none",
          })}
              >
                {card.label}
              </Typography>
              <Typography variant="h6" sx={(t) => ({
            fontWeight: 700,
            color: t.palette.text.primary,
            textShadow:
              t.palette.mode === "dark"
                ? "0 0 0.6px rgba(255,255,255,0.7)"
                : "none",
          })}>
                {card.value}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

        {/* A) IZQUIERDA: Tabla estilo Follow-Ups filtrada por paymentPromise */}
        {/* ── MOD: Layout flex de altura completa ───────────────────────── */}
     <Box
        sx={{
          display: "flex",
          width: "100%",
          //height: `calc(100vh - 200px)`,  // Ajusta 200px al alto de header + tarjetas
          alignItems: "flex-start",
          px: 2,
        }}
      >
        {/* ── Columna izquierda: LISTA ────────────────────────────── */}
        <Box
          sx={{
            flex: 2,
            mr: 2,
            bgcolor: "background.paper",
            borderRadius: 2,
            boxShadow: 1,
            //overflowY: "auto",
            p: 2,
          }}
        >
          <Typography variant="h6" gutterBottom paddingBottom={2} paddingTop={1}>
            📝 Promised Payments
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Client Name</strong></TableCell>
                  <TableCell><strong>Promise Date</strong></TableCell>
                  <TableCell><strong>Amount</strong></TableCell>
                  <TableCell><strong>Notes</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>  {/* MOD: nueva columna */}
                  <TableCell><strong>Client Profile</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clientsInActiveMonth.map((client) => {
                    // ✅ Usamos SIEMPRE los mismos helpers para que haya un solo criterio
                    const { date: dateStr, amount, notes } = client.paymentPromise;

                    // Normalizamos una sola vez
                    const isTodayRow   = isTodayPromise(dateStr);   // 🟠 hoy
                    const isMissedRow  = isMissed(dateStr);         // 🔴 pasado
                    const isUpcomingRow = !isTodayRow && !isMissedRow; // 🟢 futuro

                    return (
                      <TableRow key={client.id}>
                        <TableCell sx={{ fontWeight: isTodayRow ? "bold" : "normal" }}>
                          {client.name || `${client.firstName} ${client.lastName}`}
                        </TableCell>

                        <TableCell sx={{ fontWeight: isTodayRow ? "bold" : "normal" }}>
                          {format(parseISO(dateStr), "MMMM d, yyyy")}
                        </TableCell>

                        <TableCell sx={{ fontWeight: isTodayRow ? "bold" : "normal" }}>
                          ${parseFloat(amount).toLocaleString()}
                        </TableCell>

                        <TableCell sx={{ fontWeight: isTodayRow ? "bold" : "normal" }}>
                          {notes || "—"}
                        </TableCell>

                        {/* ✅ Chip con estado consistente */}
                        <TableCell>
                          <Chip
                            label={
                              isTodayRow    ? "Today"
                            : isMissedRow   ? "Missed"
                            :                 "Upcoming"
                            }
                            color={
                              isTodayRow    ? "warning"
                            : isMissedRow   ? "error"
                            :                 "success"
                            }
                            size="small"
                          />
                        </TableCell>

                        <TableCell>
                          <Button size="small" component={Link} to={`/client/${client.id}`}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {clientsInActiveMonth.length === 0 && ( // NEW: vacío coherente con filtro
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      No promised payments in this month.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* B) DERECHA: Calendario y detalle debajo */}
        {/* ── Columna derecha: CALENDARIO + DETALLES ────────────── */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Calendario */}
          <Box sx={{ flex: "0 0 auto", mb: 2 }}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DateCalendar
                value={selectedDate}
                onChange={handleDateClick}
                // NEW: al cambiar de mes con las flechas, actualizamos el MES ACTIVO
                onMonthChange={(date) => {
                  const [ms, me] = monthRange(date);
                  setActiveMonthStart(ms);
                  setActiveMonthEnd(me);
                }}
                sx={(t) => ({
                  backgroundColor: t.palette.background.paper,
                  borderRadius: "31px",
                  boxShadow: t.shadows[1],
                  border: `1px solid ${t.palette.divider}`,
                  p: 2,
                  width: "100%",
                  maxWidth: "100%",

                  // Header del calendario
                  "& .MuiPickersCalendarHeader-root": {         // CHANGED
                    color: t.palette.text.primary,
                  },
                  "& .MuiPickersCalendarHeader-label": {        // CHANGED
                    fontWeight: 700,
                  },
                  "& .MuiPickersArrowSwitcher-root .MuiIconButton-root": { // CHANGED
                    color: t.palette.text.primary,
                  },

                  // Encabezados de días (S, M, T...)
                  "& .MuiDayCalendar-weekDayLabel": {           // CHANGED
                    color: t.palette.text.secondary,
                  },

                  // Días
                  "& .MuiPickersDay-root": {                    // CHANGED
                    color: t.palette.text.primary,
                  },
                  "& .MuiPickersDay-root.Mui-disabled": {       // CHANGED
                    color: t.palette.text.disabled,
                  },
                  "& .MuiPickersDay-root.Mui-selected": {       // CHANGED
                    backgroundColor: t.palette.primary.main,
                    color: t.palette.getContrastText(t.palette.primary.main),
                    "&:hover": { backgroundColor: t.palette.primary.dark },
                  },
                  "& .MuiPickersDay-root.MuiPickersDay-today": { // CHANGED
                    borderColor: t.palette.primary.main,
                  },
                })}
              />
            </LocalizationProvider>
          </Box>

      {/* 2) COLUMNA DERECHA: Lista de Promises del día */}
       {/* Detalle de promesas del día */}
          <Box
            sx={(t) => ({
              // CHANGED: fondo y borde dependientes del tema
              flex: 1,
              bgcolor: t.palette.background.paper,            // CHANGED
              borderRadius: 2,
              boxShadow: t.shadows[1],                        // CHANGED
              border: `1px solid ${t.palette.divider}`,       // CHANGED
              p: 2,
              overflowY: "auto",
            })}
          >
          {promisesOnDate.length > 0 ? (
            <>
              <Typography variant="h6" gutterBottom>
                💵 Promises on {selectedDate.toDateString()}
              </Typography>
              <List>
                {promisesOnDate.map((client) => {
                  // MOD: calculamos isToday y isUpcoming
                  const datel  = parseISO(client.paymentPromise.date);
                  const isTodayl      = datel.toDateString() === todayStart.toDateString();
                  const isMissedFlagl = isMissed(client.paymentPromise.date);
                  const isUpcomingl   = !isTodayl && !isMissedFlagl;
                  return (
                  <ListItem
                    key={client.id}
                    onClick={() => setSelectedPromise(client)}
                   sx={(t) => ({
                          // CHANGED: tarjeta adaptable a light/dark
                          mb: 1,
                          px: 2,
                          py: 1.5,
                          backgroundColor:
                            t.palette.mode === "light"
                              ? alpha(t.palette.common.black, 0.02)
                              : alpha(t.palette.common.white, 0.06), // CHANGED
                          border: `1px solid ${t.palette.divider}`, // CHANGED
                          borderRadius: "12px",
                          boxShadow:
                            t.palette.mode === "light"
                              ? "0 2px 6px rgba(0,0,0,0.05)"
                              : "0 1px 2px rgba(0,0,0,0.4)",        // CHANGED
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        })}
                  >
                    <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                        {client.firstName} {client.lastName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        💵 ${parseFloat(client.paymentPromise.amount).toLocaleString()}
                      </Typography>
                      {client.paymentPromise.notes && (
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          📝 {client.paymentPromise.notes}
                        </Typography>
                      )}
                    </Box>
                   {/* MOD: cambiamos el chip para soportar “Today” (naranja) */}
                    <Chip
                      label={
                        isTodayl       ? "Today"
                        : isMissedFlagl ? "Missed"
                        :               "Upcoming"
                      }
                      color={
                        isTodayl       ? "warning"
                        : isMissedFlagl ? "error"
                        :               "success"
                      }
                      size="small"
                    />
                  </ListItem>
          )})}
              </List>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No promises on {selectedDate.toDateString()}
            </Typography>
          )}
       </Box>
        </Box>
      </Box>
      {/* ──────────────────────────────────────────────────────────── */}

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
                  {parseISO(selectedPromise.paymentPromise.date).toDateString()}
                </Typography>
                <Typography variant="body1" gutterBottom>
                  📝 <strong>Notes:</strong>{" "}
                  {selectedPromise.paymentPromise.notes || "None"}
                </Typography>
              </Box>
              {/* MOD: calcular estado Today/Missed/Upcoming */}
              {(() => {
                const dateStr   = selectedPromise.paymentPromise.date;
                const missed    = isMissed(dateStr);
                const todayFlag = isTodayPromise(dateStr);
                return (
             <Chip
                  label={
                    todayFlag ? "Today"
                    : missed    ? "Missed"
                    :             "Upcoming"
                  }
                  color={
                    todayFlag ? "warning"
                    : missed    ? "error"
                    :             "success"
                  }
                  sx={{ mt: 1 }}
                />
              );
          })()}
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
