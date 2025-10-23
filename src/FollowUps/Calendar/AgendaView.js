// src/FollowUps/Calendar/AgendaView.js
import React, { useState } from 'react'; 
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Divider,
  IconButton,
  Dialog,                       // MOD: Dialog para Promise Payment
  DialogTitle,                  // MOD
  DialogContent,                // MOD
  DialogActions,                // MOD
  Button,                       // MOD
  TextField  
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import { useCalendar } from './CalendarContext';
import { format, isValid } from 'date-fns';
import { savePaymentPromise } from '../../ClientDashboard/PaymentPromise'; // MOD



export default function AgendaView({ onPromise }) {
  const { events, selectedColors, setViewEventToEdit, deleteEvent } = useCalendar();
  const [detailEvent, setDetailEvent] = useState(null);

  // Estados locales para Promise Payment
  const [promiseOpen, setPromiseOpen] = useState(false);   // MOD
  const [promiseDate, setPromiseDate] = useState('');      // MOD
  const [promiseAmount, setPromiseAmount] = useState('');  // MOD
  const [promiseNotes, setPromiseNotes] = useState('');    // MOD
  const [promiseEvent, setPromiseEvent] = useState(null);  // MOD: evento seleccionado

  const handleSavePromise = async () => {
          if (!promiseEvent) return;
          // a) Llama a la lógica unificada
          await savePaymentPromise(
            promiseEvent.id,      // ID del cliente/evento
            promiseDate,          // fecha escogida
            promiseAmount,        // monto ingresado
            promiseNotes          // notas ingresadas
          );
          // b) Cierra el diálogo
          setPromiseOpen(false);
          // c) Notifica al padre para quitar de la lista de follow-ups
          onPromise && onPromise(promiseEvent.id);
        };

  // Normalize and ensure dates are Date objects
  const normalized = events.map(ev => ({
    ...ev,
    start: ev.start instanceof Date ? ev.start : new Date(ev.start),
    end: ev.end instanceof Date ? ev.end : new Date(ev.end),
  }));

  // Apply color filter
  const filtered = selectedColors.length
    ? normalized.filter(ev => selectedColors.includes(ev.color))
    : normalized;

  // Sort by start date
  // Filter out events with invalid dates and sort by start date
  const sorted = filtered
    .filter(ev => isValid(ev.start) && isValid(ev.end))
    .filter(ev => isValid(ev.start) && isValid(ev.end))
    .sort((a, b) => a.start - b.start);

  return (
    <Box p={2}>
      <Typography variant="h6" gutterBottom>
        Agenda
      </Typography>

      {sorted.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No events
        </Typography>
      ) : (
        <List>
          {sorted.map(ev => (
            <React.Fragment key={ev.id}>
              <ListItem
                secondaryAction={
                  <Box>
                    {/* Promise Payment */}
                    <IconButton
                      edge="end"
                      aria-label="promise-payment"
                      onClick={() => {
                        setPromiseEvent(ev);                         // MOD: guardar evento
                        setPromiseDate(
                          format(ev.start, 'yyyy-MM-dd')           // MOD: prellenar fecha
                        );
                        setPromiseOpen(true);                         // MOD: abrir dialogo
                      }}
                      sx={{ ml: 1 }}
                    >
                      <RequestQuoteIcon color="primary"/>            {/* MOD: icono */}
                    </IconButton>
                    {/* Edit */}
                    <IconButton
                      edge="end"
                      aria-label="edit"
                      onClick={() => setViewEventToEdit(ev)}
                    >
                      <EditIcon />
                    </IconButton>
                    {/* Delete */}
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => deleteEvent(ev.id)}
                      sx={{ ml: 1 }}
                    >
                      <DeleteIcon color="error" />
                    </IconButton>
                
                  </Box>
                }
              >
                <ListItemText
                  primary={ev.title || 'Untitled Event'}
                  secondary={`${format(ev.start, 'PPP p')} - ${format(
                    ev.end,
                    'PPP p'
                  )}`}
                />
              </ListItem>
              <Divider component="li" />
            </React.Fragment>
          ))}
        </List>
      )}
      {/* Dialog: Payment Promise */}
      <Dialog
        open={promiseOpen}
        onClose={() => setPromiseOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Payment Promise</DialogTitle>
        <DialogContent dividers>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField
              label="Promise Date"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={promiseDate}
              onChange={e => setPromiseDate(e.target.value)}
              fullWidth
            />
            <TextField
              label="Amount"
              type="number"
              value={promiseAmount}
              onChange={e => setPromiseAmount(e.target.value)}
              fullWidth
            />
            <TextField
              label="Notes"
              multiline
              rows={4}
              value={promiseNotes}
              onChange={e => setPromiseNotes(e.target.value)}
              fullWidth
            />
            </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPromiseOpen(false)}>Cancel</Button>
          <Button
                                variant="contained"
                                onClick={async () => {
             const clientId = detailEvent.extendedProps?.clientId;
             if (!clientId) {
               console.error("⚠️ clientId no encontrado en extendedProps", detailEvent);
               return;
             }
             // 1) Guardar promesa con ID correcto
             await savePaymentPromise(
               clientId,
               promiseDate,
               promiseAmount,
               promiseNotes
             );
             // 2) Cerrar diálogo
             setPromiseOpen(false);
             // 3) Quitar de la lista de follow-ups
             onPromise && onPromise(clientId);
           }}
                              >
                                Save Promise
                              </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
