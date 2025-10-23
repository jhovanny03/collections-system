// src/FollowUps/Calendar/AddEditEventDialog.js
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  MenuItem,
  Slide,
} from '@mui/material';
import { useCalendar } from './CalendarContext';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export function AddEditEventDialog() {
  const {
    viewEventToEdit,
    clearViewEvent,
    addEvent,
    editEvent,
    deleteEvent,
  } = useCalendar();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('add');
  const emptyDateStr = format(new Date(), "yyyy-MM-dd'T'HH:mm");

  const [form, setForm] = useState({
    id: '',
    title: '',
    start: emptyDateStr,
    end: emptyDateStr,
    color: 'primary',
    description: '',
  });

  useEffect(() => {
    if (viewEventToEdit) {
      const isNew = !viewEventToEdit.id;
      setMode(isNew ? 'add' : 'edit');
      setForm({
        id: viewEventToEdit.id || Date.now().toString(),
        title: viewEventToEdit.title || '',
        start: viewEventToEdit.start
          ? format(new Date(viewEventToEdit.start), "yyyy-MM-dd'T'HH:mm")
          : emptyDateStr,
        end: viewEventToEdit.end
          ? format(new Date(viewEventToEdit.end), "yyyy-MM-dd'T'HH:mm")
          : emptyDateStr,
        color: viewEventToEdit.color || 'primary',
        description: viewEventToEdit.description || '',
      });
      setOpen(true);
    }
  }, [viewEventToEdit, emptyDateStr]);

  const handleClose = () => {
    setOpen(false);
    clearViewEvent();
  };

  const handleSubmit = () => {
    const data = {
      ...form,
      start: new Date(form.start),
      end: new Date(form.end),
    };
    if (mode === 'add') addEvent(data);
    else editEvent(data);
    handleClose();
  };

  const handleDelete = () => {
    if (mode === 'edit') {
      deleteEvent(form.id);
      handleClose();
    }
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
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
      >
        <DialogTitle>{mode === 'add' ? 'Add Event' : 'Edit Event'}</DialogTitle>
        <DialogContent>
          <TextField
            label="Title"
            fullWidth
            margin="normal"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
          <TextField
            label="Start"
            type="datetime-local"
            fullWidth
            margin="normal"
            InputLabelProps={{ shrink: true }}
            value={form.start}
            onChange={e => setForm(f => ({ ...f, start: e.target.value }))}
          />
          <TextField
            label="End"
            type="datetime-local"
            fullWidth
            margin="normal"
            InputLabelProps={{ shrink: true }}
            value={form.end}
            onChange={e => setForm(f => ({ ...f, end: e.target.value }))}
          />
          <TextField
            label="Color"
            select
            fullWidth
            margin="normal"
            value={form.color}
            onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
          >
            {['1st Attempt','2nd Attempt','Success','3rd Attempt','4th Attempt','5th Attempt'].map(col => (
              <MenuItem key={col} value={col}>{col}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Description"
            fullWidth
            margin="normal"
            multiline
            rows={3}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          {mode === 'edit' && (
            <Button color="error" onClick={handleDelete}>
              Delete
            </Button>
          )}
          <Button variant="contained" onClick={handleSubmit}>
            {mode === 'add' ? 'Add' : 'Save'}
          </Button>
        </DialogActions>
      </motion.div>
    </Dialog>
  );
}
