// src/FollowUps/Calendar/EventListDialog.js
import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Slide,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useCalendar } from './CalendarContext';
import { format, isSameDay, parseISO } from 'date-fns';
import { motion } from 'framer-motion';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export function EventListDialog() {
  const {
    events,
    viewDate,
    clearViewDate,
    setViewEventToEdit,
    deleteEvent,
  } = useCalendar();

  const [open, setOpen] = useState(false);
  const [dayEvents, setDayEvents] = useState([]);

  useEffect(() => {
    if (viewDate) {
      const list = events.filter(ev =>
        isSameDay(parseISO(ev.start), new Date(viewDate))
      );
      setDayEvents(list);
      setOpen(true);
    }
  }, [viewDate, events]);

  const handleClose = () => {
    setOpen(false);
    clearViewDate();
  };

  const handleDelete = id => {
    deleteEvent(id);
    setDayEvents(prev => prev.filter(ev => ev.id !== id));
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      TransitionComponent={Transition}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
      >
        <DialogTitle>
          Events on {viewDate && format(new Date(viewDate), 'PPP')}
        </DialogTitle>
        <DialogContent dividers>
          {dayEvents.length === 0 ? (
            <Typography>No events for this day.</Typography>
          ) : (
            <List>
              {dayEvents.map(ev => (
                <ListItem key={ev.id}>
                  <ListItemText
                    primary={ev.title}
                    secondary={`${format(parseISO(ev.start), 'hh:mm a')} - ${format(
                      parseISO(ev.end),
                      'hh:mm a'
                    )}`}
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      onClick={() => setViewEventToEdit(ev)}
                      title="Edit"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      edge="end"
                      onClick={() => handleDelete(ev.id)}
                      title="Delete"
                      sx={{ ml: 1 }}
                    >
                      <DeleteIcon color="error" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
        </DialogActions>
      </motion.div>
    </Dialog>
  );
}
