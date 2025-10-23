// src/FollowUps/Calendar/Calendar.js
import React from 'react';
import { Box } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { useCalendar } from './CalendarContext';
import CalendarHeader from './CalendarHeader';
import CalendarYearView from './CalendarYearView';
import CalendarMonthView from './CalendarMonthView';
import CalendarWeekView from './CalendarWeekView';
import CalendarDayView from './CalendarDayView';
import AgendaView from './AgendaView';
import AddEditEventDialog from './AddEditEventDialog';
import EventListDialog from './EventListDialog';

const viewVariants = {
  initial: { opacity: 0, x: 50 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.3 } },
  exit:    { opacity: 0, x: -50, transition: { duration: 0.2 } },
};

export default function Calendar() {
  const { view, agendaMode } = useCalendar();

  const renderContent = () => {
    if (agendaMode) return <AgendaView key="agenda" />;
    switch (view) {
      case 'day':   return <CalendarDayView key="day" />;
      case 'week':  return <CalendarWeekView key="week" />;
      case 'month': return <CalendarMonthView key="month" />;
      case 'year':  return <CalendarYearView key="year" />;
      default:      return <CalendarMonthView key="month" />;
    }
  };

  return (
    <Box>
      <CalendarHeader />

      <AnimatePresence exitBeforeEnter>
        <motion.div
          key={agendaMode ? 'agenda' : view}
          variants={viewVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <Box p={2}>
            {renderContent()}
          </Box>
        </motion.div>
      </AnimatePresence>

      <AddEditEventDialog />
      <EventListDialog />
    </Box>
  );
}
