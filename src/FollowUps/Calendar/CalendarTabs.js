import React, { useState } from "react";
import { Tabs, Tab, Box } from "@mui/material";
import CalendarYearView from "./CalendarYearView";
import { DateCalendar } from "@mui/x-date-pickers";
import EventCalendarDay from "./EventCalendarDay";
import { format } from "date-fns";

const CalendarTabs = ({ eventsByDate, onDayClick }) => {
  const [tab, setTab] = useState(0);
  const handleChange = (e, newVal) => setTab(newVal);
  const today = new Date();

  return (
    <Box>
      <Tabs value={tab} onChange={handleChange} sx={{ mb: 2 }}>
        <Tab label="Month" />
        <Tab label="Year" />
      </Tabs>
      {tab === 0 && (
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <DateCalendar
            value={today}
            onChange={(date) => onDayClick(date.toISOString().split("T")[0])}
            renderDay={(day, _value, dayProps) => (
              <EventCalendarDay
                {...dayProps}
                day={day}
                eventsByDate={eventsByDate}
                onDaySelect={() => onDayClick(format(day, "yyyy-MM-dd"))}
              />
            )}
          />
        </Box>
      )}
      {tab === 1 && (
        <CalendarYearView
          year={today.getFullYear()}
          eventsByDate={eventsByDate}
          onDayClick={onDayClick}
        />
      )}
    </Box>
  );
};

export default CalendarTabs;