// src/FollowUps/Calendar/CalendarWeekView.js

// Import React hooks for state, refs and effects
import React, { useState, useRef, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';

// Import MUI components for dialog and layout
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  TextField,
  IconButton
} from '@mui/material'; // Added Dialog components

// Import icons for dialog fields
import PersonIcon from '@mui/icons-material/Person';          // Responsible icon
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'; // Date icon
import AccessTimeIcon from '@mui/icons-material/AccessTime';    // Description/time icon
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';

// Hook to access calendar context (events, actions, currentDate)
import { useCalendar } from './CalendarContext';
import DroppableArea from './DroppableArea';
import { useTheme, alpha } from '@mui/material/styles';
import { format } from 'date-fns'; // Added for human-readable date formatting
import { savePaymentPromise } from '../../ClientDashboard/PaymentPromise'; // MOD
import { Link } from 'react-router-dom';
import CloseIcon from '@mui/icons-material/Close';



export default function CalendarWeekView({ onPromise }) {
  // Destructure calendar context
  const {
    events,
    currentDate,
    use24HourFormat,
    addEvent,
    editEvent,
    deleteEvent,
    setViewEventToEdit  // Added: to launch edit dialog from detail view
  } = useCalendar();

  const theme = useTheme();

  // Ref for FullCalendar API access
  const calendarRef = useRef(null); // Added ref to control navigation programmatically

  // State for the currently selected event in the detail dialog
  const [detailEvent, setDetailEvent] = useState(null); // Added state for detail popup

    const [promiseOpen, setPromiseOpen] = useState(false);      // MOD: controla apertura del dialogo Promise
    const [promiseDate, setPromiseDate] = useState('');         // MOD: campo fecha
    const [promiseAmount, setPromiseAmount] = useState('');     // MOD: campo importe
    const [promiseNotes, setPromiseNotes] = useState('');       // MOD: campo notas
    const [promiseEvent, setPromiseEvent] = useState(null);

  // Effect: whenever currentDate changes (via CalendarHeader arrows), navigate FullCalendar
  useEffect(() => {
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      api.gotoDate(currentDate); // Programmatic navigation
    }
  }, [currentDate]);

  // Function to render events as semi-transparent boxes with border
  const renderEvent = (arg) => {
    const rawColor = arg.event.extendedProps.color || theme.palette.primary.main;
    const bgColor = alpha(rawColor, 0.2); // Use alpha for 20% opacity
    return (
      <div style={{
        backgroundColor: bgColor,
        border: `1px solid ${rawColor}`,
        borderRadius: 4,
        padding: '2px 4px',
        fontSize: '0.75rem',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {arg.event.title}
        {arg.timeText && (
          <div style={{ fontSize: '0.7rem', marginTop: 2 }}>
            {arg.timeText}
          </div>
        )}
      </div>
    );
  };

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

  return (
    <>
      {/* Calendar area */}
      <DroppableArea>
        <FullCalendar
          ref={calendarRef}             // Attach ref to calendar instance
          plugins={[timeGridPlugin, interactionPlugin, listPlugin]}
          initialView="timeGridWeek"
          headerToolbar={false}         // Hide default toolbar (we use CalendarHeader)
          locale="en"
          date={currentDate}            // Controlled date based on context
          allDaySlot={false}
          slotDuration="00:30:00"
          slotLabelFormat={{
            hour: 'numeric',
            minute: '2-digit',
            hour12: !use24HourFormat,
          }}
          events={events}
          editable
          droppable
          eventDisplay="block"
          eventBackgroundColor="transparent"
          eventBorderColor="transparent"
          eventContent={renderEvent}     // Custom event rendering

          // Handle date clicks: open new-event editor (unchanged)
          dateClick={(info) =>
            addEvent({
              id: Date.now().toString(),
              title: '',
              start: info.date,
              end: info.date,
              color: theme.palette.primary.main,
            })
          }

          // Handle event clicks: open detail dialog instead of direct edit
          eventClick={(info) => {
            const ev = info.event;
            setDetailEvent({              // Set selected event data for dialog
              id: ev.id,
              title: ev.title,
              responsible: ev.extendedProps.responsible,
              start: ev.start,
              end: ev.end,
              description: ev.extendedProps.description,
              amountDue:   ev.extendedProps.amountDue,
              color: ev.backgroundColor,
              extendedProps: { ...ev.extendedProps }
            });
          }}

          // Handle event drag/drop and resize: update event (unchanged)
          eventDrop={(info) =>
            editEvent({
              id: info.event.id,
              title: info.event.title,
              start: info.event.start,
              end: info.event.end,
              color: info.event.backgroundColor,
            })
          }
          eventResize={(info) =>
            editEvent({
              id: info.event.id,
              title: info.event.title,
              start: info.event.start,
              end: info.event.end,
              color: info.event.backgroundColor,
            })
          }
        />
      </DroppableArea>

      {/* Detail Dialog: shows event info with Edit/Delete buttons */}
      <Dialog
        open={Boolean(detailEvent)}
        onClose={() => setDetailEvent(null)}
      >
        {detailEvent && (
          <>
            <DialogTitle sx={{ m: 0, p: 2, position: 'relative' }}>
              Follow-Ups
              {/* MOD: botón “X” en la esquina superior derecha */}
              <IconButton
                aria-label="close"
                onClick={() => setDetailEvent(null)}
                sx={{
                  position: 'absolute',
                  right: 8,
                  top: 8,
                  color: (theme) => theme.palette.grey[500],
                }}
              >
                <CloseIcon />
              </IconButton>
            </DialogTitle> {/* Title */}
            <DialogContent dividers>
              {/* Responsible field */}
              <Box display="flex" alignItems="center" mb={1}>
                <PersonIcon fontSize="small" sx={{ mr: 1 }} />
                <Typography variant="body2">
                  {detailEvent.title || '—'}
                </Typography>
              </Box>
              {/* Amount Due */}
              <Box display="flex" alignItems="center" mb={1}>
                <AttachMoneyIcon fontSize="small" sx={{ mr: 1 }} />
                <Typography variant="body2">
                   Amount Due: {detailEvent.amountDue != null ? `$${detailEvent.amountDue}` : 'No amount due'}    
                </Typography>
              </Box>
              
              {/* Start date field */}
              <Box display="flex" alignItems="center" mb={1}>
                <CalendarTodayIcon fontSize="small" sx={{ mr: 1 }} />
                <Typography variant="body2">
                  {format(new Date(detailEvent.start), "EEEE d MMMM ")}    
                </Typography>
              </Box>
              {/* Description field */}
              <Box display="flex" alignItems="center">
                <AccessTimeIcon fontSize="small" sx={{ mr: 1 }} />
                <Typography variant="body2">
                  {detailEvent.description || 'No description'}
                </Typography>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => {
                  setViewEventToEdit(detailEvent);    // Edit: open event editor
                  setDetailEvent(null);                // Close dialog
                }}
              >
                Edit
              </Button>
              <Button
                color="error"
                onClick={() => {
                  deleteEvent(detailEvent.id);         // Delete event
                  setDetailEvent(null);                // Close dialog
                }}
              >
                Delete
              </Button>
              {/* MOD: ir al Client Dashboard */}
                                <Button
                                component={Link}
                                  to={`/client/${detailEvent.extendedProps.clientId}`}
                                >
                                  Client Profile
                                </Button>
              <Button onClick={() => setPromiseOpen(true)}> 
              Payment Promise</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
      {/* Payment Promise Dialog */}
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
    </>
  );
}
