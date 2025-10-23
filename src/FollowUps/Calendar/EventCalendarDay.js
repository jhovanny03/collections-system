import React from "react";
import { PickersDay } from "@mui/x-date-pickers";
import { Badge } from "@mui/material";
import { format } from "date-fns";

const EventCalendarDay = ({ day, eventsByDate, ...other }) => {
  const dateKey = format(day, "yyyy-MM-dd");
  const hasEvents = !!eventsByDate[dateKey];

  return (
    <Badge
      overlap="circular"
      variant="dot"
      color="primary"
      invisible={!hasEvents}
      sx={{
        '& .MuiBadge-badge': {
          bottom: 2,
          right: 2,
          height: 6,
          minWidth: 6,
          borderRadius: '50%'
        }
      }}
    >
      <PickersDay day={day} {...other} />
    </Badge>
  );
};

export default EventCalendarDay;