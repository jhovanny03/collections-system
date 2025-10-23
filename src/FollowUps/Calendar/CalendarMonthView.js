import React from 'react';
import { useState, useRef, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  TextField,
  Box,
  IconButton
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person'; // Icon for responsible field
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'; // Icon for date fields
import AccessTimeIcon from '@mui/icons-material/AccessTime'; // Icon for description/time
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import { useCalendar } from './CalendarContext';
import DroppableArea from './DroppableArea';
import { useTheme, alpha } from '@mui/material/styles';
import { format } from 'date-fns'; // Added format for human-readable dates
import { savePaymentPromise } from '../../ClientDashboard/PaymentPromise'; // MOD
import { Link } from 'react-router-dom';
import CloseIcon from '@mui/icons-material/Close';



export default function CalendarMonthView({ onPromise }) {
  const {
    events,
    currentDate,
    setViewEventToEdit,
    addEvent,
    editEvent,
    deleteEvent
  } = useCalendar();
  const theme = useTheme();

  const calendarRef = useRef(null);
  const [detailEvent, setDetailEvent] = useState(null);

   // ─── MOD: estado para controlar el diálogo de Promise Payment ────────
  const [promiseOpen, setPromiseOpen] = useState(false);
  const [promiseDate, setPromiseDate] = useState('');
  const [promiseAmount, setPromiseAmount] = useState('');
  const [promiseNotes, setPromiseNotes] = useState('');
   const [promiseEvent, setPromiseEvent] = useState(null);

useEffect(() => {
  if (calendarRef.current) {
    const api = calendarRef.current.getApi();
    api.gotoDate(currentDate);
  }
}, [currentDate]);

  useEffect(() => {
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      api.removeAllEvents();       // LIMPIA todos los eventos actuales
      api.addEventSource(events);   // VUELVE A AÑADIR el array `events` actualizado
    }
  }, [events]);                    

  // Agrega 20% de opacidad al HEX original
  const getTransparent = (hex) => hex + '33';

  // Render personalizado para cada evento en MonthView
  const renderEvent = (arg) => {
    const color = arg.event.extendedProps.color;
    const bg = getTransparent(color);
    return (
      <div
        style={{
          backgroundColor: bg,
          border: `1px solid ${color}`,
          borderRadius: 4,
          padding: '2px 4px',
          fontSize: '0.75rem',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {arg.event.title}
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
    <DroppableArea>
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, interactionPlugin]} 
        initialView="dayGridMonth"
        headerToolbar={false}
        locale="en"
        date={currentDate}
        events={events}
        editable
        droppable
        eventDisplay="block"
        eventBackgroundColor="transparent"
        eventBorderColor="transparent"
        eventContent={renderEvent}
        dateClick={(info) => {
          setViewEventToEdit({
            id: Date.now().toString(),
            title: '',
            start: info.dateStr,
            end: info.dateStr,
            color: theme.palette.primary.main,
            description: ''
          });
        }}
        eventClick={(info) => {
           const ev = info.event;
            setDetailEvent({
              id:          ev.id,
              title:       ev.title,
              responsible: ev.extendedProps.responsible, // New field
              start:       ev.start,
              end:         ev.end,
              description: ev.extendedProps.description, // New field
              amountDue:   ev.extendedProps.amountDue,
              color:       ev.backgroundColor,
              extendedProps: { ...ev.extendedProps }
          });
        }}
        eventDrop={(info) =>
          editEvent({
            id: info.event.id,
            title: info.event.title,
            start: info.event.startStr,
            end: info.event.endStr,
            color: info.event.backgroundColor
          })
        }
        eventResize={(info) =>
          editEvent({
            id: info.event.id,
            title: info.event.title,
            start: info.event.startStr,
            end: info.event.endStr,
            color: info.event.backgroundColor
          })
        }
        //eventContent={renderEvent}    // <-- aquí se aplica el box transparente
      />
    </DroppableArea>
    
    {/* Details Dialog: appears on any view click */}
      <Dialog open={!!detailEvent} onClose={() => setDetailEvent(null)}>
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
              <Button onClick={() => {
                // Edit button: open editor and close dialog
                setViewEventToEdit(detailEvent);
                setDetailEvent(null);
              }}>Edit</Button>
              <Button color="error" onClick={() => {
                // Delete button: remove event and close dialog
                deleteEvent(detailEvent.id);
                setDetailEvent(null);
              }}>Delete</Button>
                            {/* MOD: ir al Client Dashboard */}
                                <Button
                                component={Link}
                                  to={`/client/${detailEvent.extendedProps.clientId}`}
                                >
                                  Client Profile
                                </Button>
              {/* ─── MOD: Botón Promise Payment ────────────────────── */}
              <Button onClick={() => setPromiseOpen(true)}>
                Payment Promise</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
       {/* ─── MOD: Dialog “Payment Promise” ───────────────────────────── */}
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
           {/* MOD: Reemplazar handler por llamada a savePaymentPromise */}
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
      {/* ──────────────────────────────────────────────────────────────── */}
    </>
  );
}
