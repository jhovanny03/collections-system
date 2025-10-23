import React from 'react'
import { useCalendar } from './CalendarContext'
import CalendarHeader   from './CalendarHeader'
import CalendarYearView from './CalendarYearView'
import CalendarMonthView  from './CalendarMonthView'
import CalendarWeekView from './CalendarWeekView'
import CalendarDayView  from './CalendarDayView'
import AgendaView       from './AgendaView'
import { AddEditEventDialog } from './AddEditEventDialog';
import { EventListDialog }    from './EventListDialog';
import { AnimatePresence, motion } from 'framer-motion'
import { savePaymentPromise } from '../../ClientDashboard/PaymentPromise';


export default function CalendarApp({ onPromise }) {
  const { view } = useCalendar()
  console.log('[CalendarApp] render, view =', view);

  return (
    <div>
      <CalendarHeader />

      <AnimatePresence exitBeforeEnter>
        {view === 'year' && (
          <motion.div
            key="year"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
          >
            <CalendarYearView />
          </motion.div>
        )}

        {view === 'month' && (
          <motion.div
            key="month"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
          >
            <CalendarMonthView />
            <CalendarMonthView onPromise={onPromise} />
          </motion.div>
        )}

        {view === 'week' && (
          <motion.div
            key="week"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
          >
            <CalendarWeekView />
            <CalendarWeekView onPromise={onPromise} />
          </motion.div>
        )}

        {view === 'day' && (
          <motion.div
            key="day"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
          >
            <CalendarDayView />
            <CalendarDayView onPromise={onPromise} />
          </motion.div>
        )}

        {view === 'agenda' && (
          <motion.div
            key="agenda"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
          >
            <AgendaView />
            <AgendaView onPromise={onPromise} />
          </motion.div>
        )}
      </AnimatePresence>
      

      <AddEditEventDialog />
      <EventListDialog />
    </div>
  )
}
