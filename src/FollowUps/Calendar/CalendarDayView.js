// src/FollowUps/Calendar/CalendarDayView.js

// 1) React imports for hooks and features
import React, { useState, useRef, useEffect } from 'react'; // Added useRef/useEffect for navigation and dialog state
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

// 2) MUI components for layout, date pickers and dialog
import {
  Box,
  Typography,
  IconButton,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField
} from '@mui/material'; // Added Dialog components for detail popup

// 3) Icon imports for dialog fields
import PersonIcon from '@mui/icons-material/Person';          // Icon for responsible field
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'; // Icon for date fields
import AccessTimeIcon from '@mui/icons-material/AccessTime';    // Icon for description/time 
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';

// 4) Date picker imports unchanged
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import esLocale from 'date-fns/locale/es';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// 5) Calendar context and styling utilities
import { useCalendar } from './CalendarContext';
import DroppableArea from './DroppableArea';
import { useTheme, alpha } from '@mui/material/styles'; // alpha for transparency
import { format } from 'date-fns'; // format for human-readable dates
import { StaticDatePicker } from '@mui/x-date-pickers/StaticDatePicker';
import { savePaymentPromise } from '../../ClientDashboard/PaymentPromise'; // MOD
import { Link } from 'react-router-dom';
import CloseIcon from '@mui/icons-material/Close';



export default function CalendarDayView({ onPromise }) {
  // 6) Destructure calendar context
  const {
    events,
    currentDate,
    use24HourFormat,
    addEvent,
    editEvent,
    deleteEvent,        // Added delete functionality
    setViewEventToEdit, // Added: to open editor from detail dialog
    setCurrentDate
  } = useCalendar();
  
  const theme = useTheme();

  // 7) State for the selected event in detail dialog
  const [detailEvent, setDetailEvent] = useState(null); // Added detailEvent state

  const [promiseOpen, setPromiseOpen] = useState(false);      // MOD: controla apertura del dialogo Promise
  const [promiseDate, setPromiseDate] = useState('');         // MOD: campo fecha
  const [promiseAmount, setPromiseAmount] = useState('');     // MOD: campo importe
  const [promiseNotes, setPromiseNotes] = useState('');       // MOD: campo notas
  const [promiseEvent, setPromiseEvent] = useState(null);

  // 8) Ref for FullCalendar API access (programmatic navigation)
  const calendarRef = useRef(null); // Added calendarRef

  // 9) Navigate calendar on currentDate change
  useEffect(() => {
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      api.gotoDate(currentDate); // Programmatically navigate
    }
  }, [currentDate]);

  // 10) renderEvent: custom semi-transparent box rendering (existing logic)
  const renderEvent = (arg) => {
    const rawColor = arg.event.extendedProps.color || theme.palette.primary.main;
    const bgColor = alpha(rawColor, 0.2);
    return (
      <div style={{
        backgroundColor: bgColor,
        border: `1px solid ${rawColor}`,
        borderRadius: 4,
        padding: '4px 6px',
        fontSize: '0.75rem',
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {arg.event.title}
        {arg.timeText && (
          <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
            {arg.timeText}
          </Typography>
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


  // 11) Year selector logic unchanged
  const currentYear = currentDate.getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);
  const handleYearChange = (e) =>
    setCurrentDate(new Date(parseInt(e.target.value, 10), currentDate.getMonth(), 1));

  return (
    <>
      {/* Main calendar & sidebar layout */}
      <Box display="flex" gap={2} alignItems="flex-start" p={2}>
        <Box flex={1}>
          <DroppableArea>
            <FullCalendar
              ref={calendarRef}                // Attach ref for API
              plugins={[timeGridPlugin, interactionPlugin]}
              initialView="timeGridDay"
              headerToolbar={false}           // Keep custom header
              locale="en"
              date={currentDate}              // Controlled date prop
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
              eventContent={renderEvent}      // Custom box rendering

              // 12) dateClick: open editor for new event (no change)
              dateClick={(info) =>
                setViewEventToEdit({
                  id: Date.now().toString(),
                  title: '',
                  start: info.date,
                  end: info.date,
                  color: theme.palette.primary.main,
                })
              }

              // 13) eventClick: open detail dialog instead of direct edit
              eventClick={(info) => {
                const ev = info.event;
                setDetailEvent({            // Set data for detail dialog
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

              // 14) eventDrop & eventResize: update event (no change)
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

              height="auto"
            />
          </DroppableArea>
        </Box>

        {/* Sidebar mini-calendar unchanged */}
        <Box sx={{ width: 300, marginLeft: -1 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1} paddingLeft={2}>
            <IconButton size="small" onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
              <ChevronLeft size={16} />
            </IconButton>
            <Typography variant="subtitle1">{format(currentDate, 'MMMM')}</Typography>
            <Select
              value={currentYear}
              onChange={handleYearChange}
              variant="standard"
              size="small"
              sx={{ p: 0, marginBottom: -0.5, marginLeft: -7 }}
            >
              {years.map(y => (
                <MenuItem key={y} value={y}>{y}</MenuItem>
              ))}
            </Select>
            <IconButton size="small" onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
              <ChevronRight size={16} />
            </IconButton>
          </Box>
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={esLocale}>
            <StaticDatePicker
              displayStaticWrapperAs="desktop"
              value={currentDate}
              onChange={date => date && setCurrentDate(date)}
              slotProps={{ actionBar: { actions: [] } }}
              renderInput={() => null}
              sx={{ width: '100%', '& .MuiPickersCalendarHeader-root': { display: 'none' } }}
            />
          </LocalizationProvider>
        </Box>
      </Box>

      {/* Details Dialog: shows event info with Edit/Delete buttons */}
      <Dialog open={Boolean(detailEvent)} onClose={() => setDetailEvent(null)}>
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
              {/* Edit button: opens event editor */}
              <Button onClick={() => {
                setViewEventToEdit(detailEvent); // Launch editor
                setDetailEvent(null);            // Close dialog
              }}>
                Edit
              </Button>
              {/* Delete button: removes event */}
              <Button color="error" onClick={() => {
                deleteEvent(detailEvent.id);     // Delete event
                setDetailEvent(null);            // Close dialog
              }}>
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
