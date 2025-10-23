// src/components/CalendarTab.js
import React, { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin    from '@fullcalendar/daygrid';
import timeGridPlugin   from '@fullcalendar/timegrid';
import listPlugin       from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import multimonthPlugin from '@fullcalendar/multimonth';
import { 
  Box, Toolbar, IconButton, Typography, Button, Menu, MenuItem,
  ToggleButton, ToggleButtonGroup, AvatarGroup, Avatar,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider,
  FormControlLabel, Switch
} from '@mui/material';
import {
  ArrowBackIos, ArrowForwardIos, FilterList, ViewList,
  ViewAgenda, CalendarToday, GridView, Settings
} from '@mui/icons-material';
import loadPaymentPromises from '../FollowUps/PaymentPromiseSync'; 
// asume que exportas una función que devuelve tu array de eventos

export default function CalendarTab() {
  // --- estados principales ---
  const [events, setEvents] = useState([]);
  const [view, setView] = useState('timeGridWeek');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [settingsAnchor, setSettingsAnchor] = useState(null);
  const [useDotBadge, setUseDotBadge] = useState(true);
  const [use24h,    setUse24h]    = useState(false);
  const [groupBy,   setGroupBy]   = useState('date');
  const [detailEvt, setDetailEvt] = useState(null);

  // --- carga inicial / sincronización live ---
  useEffect(() => {
    const unsub = loadPaymentPromises((loaded) => {
      // transforma a { id, title, start, end, extendedProps, color, allDay? }
      setEvents(loaded);
    });
    return () => unsub?.();
  }, []);

  // --- Handlers toolbar ---
  const handlePrev = () => calendarRef.current.getApi().prev();
  const handleNext = () => calendarRef.current.getApi().next();
  const handleToday= () => calendarRef.current.getApi().today();
  const handleView = (_, v) => v && setView(v);

  const openSettings = e => setSettingsAnchor(e.currentTarget);
  const closeSettings= () => setSettingsAnchor(null);

  // --- Detalle al click en evento ---
  const handleEventClick = ({ event }) => {
    setDetailEvt({
      id: event.id,
      title: event.title,
      ...event.extendedProps,
      start: event.start,
      end:   event.end,
    });
  };
  const closeDetail = () => setDetailEvt(null);

  // para acceder a la API de FullCalendar
  const calendarRef = React.useRef();

  return (
    <Box>
      {/* == TOOLBAR PERSONALIZADA == */}
      <Toolbar sx={{ justifyContent: 'space-between' }}>
        {/* ⬅️ Fecha grande + mes/año + prev/next/today */}
        <Box display="flex" alignItems="center" gap={1}>
          <Box
            sx={{
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              px:2, py:1, borderRadius:1,
            }}
          >
            <Typography variant="subtitle2">
              {currentDate.toLocaleString('en-US',{month:'short'}).toUpperCase()}
            </Typography>
            <Typography variant="h5">
              {currentDate.getDate()}
            </Typography>
          </Box>
          <Box>
            <Typography variant="h6">
              {currentDate.toLocaleString('en-US',{month:'long',year:'numeric'})}
            </Typography>
            <Typography variant="caption">
              {events.length} events
            </Typography>
          </Box>
          <IconButton onClick={handlePrev}><ArrowBackIos fontSize="small"/></IconButton>
          <IconButton onClick={handleToday}>Today</IconButton>
          <IconButton onClick={handleNext}><ArrowForwardIos fontSize="small"/></IconButton>
        </Box>

        {/* 🗓️ TÍTULO / espacio central */}
        <Typography variant="h6" sx={{ opacity:0.6 }}>pepe</Typography>

        {/* ➡️ Botones de filtro / vistas / avatars / Add / ⚙️ */}
        <Box display="flex" alignItems="center" gap={1}>
          <IconButton><FilterList/></IconButton>

          <ToggleButtonGroup
            size="small"
            value={view}
            exclusive
            onChange={handleView}
          >
            <ToggleButton value="listYear"><ViewList/></ToggleButton>
            <ToggleButton value="timeGridWeek"><ViewAgenda/></ToggleButton>
            <ToggleButton value="dayGridMonth"><CalendarToday/></ToggleButton>
            <ToggleButton value="multimonthYear"><GridView/></ToggleButton>
          </ToggleButtonGroup>

          <AvatarGroup max={4}>
            {/* aquí map de responsables filtrables */}
            {['M','A','R','+1'].map((l,i)=>(
              <Avatar key={i}>{l}</Avatar>
            ))}
          </AvatarGroup>

          <Button variant="contained" size="small">+ Add Event</Button>

          <IconButton onClick={openSettings}><Settings/></IconButton>
          <Menu
            anchorEl={settingsAnchor}
            open={Boolean(settingsAnchor)}
            onClose={closeSettings}
          >
            <MenuItem>
              <FormControlLabel
                control={
                  <Switch
                    checked={useDotBadge}
                    onChange={()=>setUseDotBadge(!useDotBadge)}
                  />
                }
                label="Use dot badge"
              />
            </MenuItem>
            <MenuItem>
              <FormControlLabel
                control={
                  <Switch
                    checked={use24h}
                    onChange={()=>setUse24h(!use24h)}
                  />
                }
                label="Use 24 h"
              />
            </MenuItem>
            <Divider/>
            <Typography sx={{ pl:2, pt:1 }} variant="subtitle2">
              Agenda view group by
            </Typography>
            <MenuItem onClick={()=>setGroupBy('date')}>
              <FormControlLabel
                control={<Switch checked={groupBy==='date'}/>}
                label="Date"
              />
            </MenuItem>
            <MenuItem onClick={()=>setGroupBy('color')}>
              <FormControlLabel
                control={<Switch checked={groupBy==='color'}/>}
                label="Color"
              />
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>

      {/* == FULLCALENDAR  */}
      <Box sx={{ height: 'calc(100vh - 150px)' }}>
        <FullCalendar
          ref={calendarRef}
          plugins={[
            dayGridPlugin,
            timeGridPlugin,
            listPlugin,
            interactionPlugin,
            multimonthPlugin
          ]}
          initialView={view}
          headerToolbar={false}
          events={events}
          dateClick={({ date }) => { /* opcional: mostrar lista de ese día*/ }}
          eventClick={handleEventClick}
          datesSet={({ view, start, end, startStr }) => {
            setCurrentDate(new Date(startStr));
          }}
          dayMaxEventRows={useDotBadge ? 3 : false}
          displayEventTime={!useDotBadge}
          slotLabelFormat={ use24h ? { hour12:false } : undefined }
          views={{
            multimonthYear: {
              type: 'multimonth',
              duration: { months: 12 },
              visibleRange: (currentDate) => ({
                start: new Date(currentDate.getFullYear(),0,1),
                end:   new Date(currentDate.getFullYear()+1,0,1)
              }),
            }
          }}
        />
      </Box>

      {/* == DIALOG DE DETALLE DE EVENTO == */}
      <Dialog open={!!detailEvt} onClose={closeDetail} fullWidth maxWidth="sm">
        <DialogTitle>{detailEvt?.title}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" gutterBottom>
            <strong>Responsible:</strong> {detailEvt?.responsible}
          </Typography>
          <Typography variant="body2" gutterBottom>
            <strong>Start:</strong> {detailEvt?.start.toLocaleString()}
          </Typography>
          <Typography variant="body2" gutterBottom>
            <strong>End:</strong> {detailEvt?.end.toLocaleString()}
          </Typography>
          <Typography variant="body2" gutterBottom>
            {detailEvt?.description}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>{/* editar */}}>Edit</Button>
          <Button color="error" onClick={()=>{/* borrar */}}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
