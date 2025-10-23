// src/FollowUps/Calendar/CalendarYearView.js
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import React from 'react';
import {
  format,
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameDay,
  isSameMonth,
} from 'date-fns';
import { motion } from 'framer-motion';
import { useCalendar } from './CalendarContext';
import { EventListDialog } from './EventListDialog';

export default function CalendarYearView() {
  const { events, currentDate, selectedColors, onSelectDate } = useCalendar();

  // Filter events by selected colors if any
  const filteredEvents = selectedColors.length
    ? events.filter(ev => selectedColors.includes(ev.colorName || ev.color))
    : events;

  const months = eachMonthOfInterval({
    start: startOfYear(currentDate),
    end: endOfYear(currentDate),
  });

  return (
    <Grid container spacing={3} paddingLeft={13} paddingTop={2}>
      {months.map((monthDate) => {
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        // compute 42 slots for uniform grid
        const start = startOfWeek(monthStart, { weekStartsOn: 0 });
        const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });
        let days = eachDayOfInterval({ start, end: endDate });
        const totalSlots = 42;
        if (days.length < totalSlots) {
          const lastDate = days[days.length - 1];
          for (let i = 0; i < totalSlots - days.length; i++) {
            days.push(new Date(lastDate.getTime() + (i + 1) * 86400000));
          }
        }

        return (
          <Grid item xs={12} sm={6} md={3} key={monthDate.toISOString()}>
            <Box
              sx={{
                border: 1,
                borderColor: 'grey.300',
                borderRadius: 2,
                p: 2,
                bgcolor: 'background.paper',
                boxShadow: 1,
              }}
            >
              {/* Month Title */}
              <Typography variant="subtitle1" align="center" gutterBottom>
                {format(monthDate, 'LLLL yyyy')}
              </Typography>

              {/* Weekday Labels */}
              <Box display="grid" gridTemplateColumns="repeat(7, 1fr)" mb={1}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                  <Typography
                    key={d}
                    variant="caption"
                    align="center"
                    sx={{ color: 'text.primary', fontWeight: 'bold' }}
                  >
                    {d}
                  </Typography>
                ))}
              </Box>

              {/* Days Grid */}
              <Box display="grid" gridTemplateColumns="repeat(7, 1fr)" gap={0.5}>
                {days.map(day => {
                  const dayEvents = filteredEvents.filter(ev => isSameDay(ev.date, day));
                  const selected = isSameDay(day, currentDate);
                  const outOfMonth = !isSameMonth(day, monthDate);
                  return (
                    <motion.div key={day.toISOString()} whileHover={{ scale: 1.05 }}>
                      <Box
                        onClick={() => dayEvents.length && onSelectDate(day)}
                        sx={{
                          p: 1,
                          borderRadius: 1,
                          bgcolor: selected ? 'primary.main' : 'transparent',
                          color: selected
                            ? 'primary.contrastText'
                            : outOfMonth
                            ? 'text.disabled'
                            : 'text.primary',
                          cursor: dayEvents.length && !outOfMonth ? 'pointer' : 'default',
                          '&:hover': {
                            bgcolor:
                              dayEvents.length && !selected && !outOfMonth
                                ? 'action.hover'
                                : undefined,
                          },
                        }}
                      >
                        <Typography variant="body2" align="center">
                          {format(day, 'd')}
                        </Typography>
                        {dayEvents.length > 0 && (
                          <Box display="flex" justifyContent="center" mt={0.5}>
                            {dayEvents.slice(0, 3).map((ev, idx) => (
                              <Box
                                key={idx}
                                sx={{
                                  width: 6,
                                  height: 6,
                                  bgcolor: ev.color,
                                  borderRadius: '50%',
                                  mx: 0.5,
                                  opacity: outOfMonth ? 0.5 : 1,
                                }}
                              />
                            ))}
                            {dayEvents.length > 3 && (
                              <Typography variant="caption" color="text.secondary">
                                +{dayEvents.length - 3}
                              </Typography>
                            )}
                          </Box>
                        )}
                      </Box>
                    </motion.div>
                  );
                })}
              </Box>
            </Box>
          </Grid>
        );
      })}
      <EventListDialog />
    </Grid>
  );
}
