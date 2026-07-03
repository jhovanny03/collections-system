// src/ClientFollowUps/FollowUpsCalendarView.jsx
import React, { useMemo } from "react";
import { Card, CardContent, Stack, Chip, Box, Typography } from "@mui/material";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";

import { FOLLOW_UP_STATUS } from "./followUps.types";

// Status → color (hex)
function getStatusColorHex(status) {
  switch (status) {
    case FOLLOW_UP_STATUS.ATTEMPTED_NO_CONTACT:
      return "#ed6c02"; // warning.main
    case FOLLOW_UP_STATUS.REACHED_WORKING:
      return "#0288d1"; // info.main
    case FOLLOW_UP_STATUS.PROMISE:
      return "#1976d2"; // primary.main
    case FOLLOW_UP_STATUS.PARTIAL_PAYMENT:
      return "#9c27b0"; // secondary.main (purple)
    case FOLLOW_UP_STATUS.RESOLVED:
      return "#2e7d32"; // success.main
    case FOLLOW_UP_STATUS.PENDING:
    default:
      return "#6c757d"; // neutral
  }
}

// Money for event titles
function fmtMoney(n) {
  const num = Number(n || 0);
  if (!num) return "$0";
  return `$${num.toLocaleString()}`;
}

/**
 * Props:
 *  - items: array of cohort items
 *  - onSelectClient(row): called when user clicks an event (client)
 *  - onSelectDate(dateStr): called when user clicks a date (YYYY-MM-DD)
 */
export default function FollowUpsCalendarView({
  items = [],
  onSelectClient,
  onSelectDate,
}) {
  // Map cohort items -> FullCalendar events
  const events = useMemo(() => {
    return (items || [])
      .filter((it) => !!it.nextFollowUpAt)
      .map((it) => {
        const color = getStatusColorHex(
          it.status || FOLLOW_UP_STATUS.PENDING
        );

        return {
          id: it.id,
          title: `${it.clientName || "(No Name)"} — ${fmtMoney(
            it.amountDueCurrentMonth
          )}`,
          start: it.nextFollowUpAt, // ISO date or datetime
          allDay: true,
          backgroundColor: color,
          borderColor: color,
          textColor: "#ffffff",
          extendedProps: {
            item: it,
          },
        };
      });
  }, [items]);

  // Click on date cell → send YYYY-MM-DD to parent
  const handleDateClick = (info) => {
    const dateStr = info.dateStr; // "YYYY-MM-DD"
    if (typeof onSelectDate === "function") {
      onSelectDate(dateStr);
    }
  };

  // Click on event → tell parent which client
  const handleEventClick = (info) => {
    const item = info.event.extendedProps?.item;
    if (item && typeof onSelectClient === "function") {
      onSelectClient(item);
    }
  };

  return (
    <Card elevation={2}>
      <CardContent sx={{ p: 2 }}>
        {/* Top title + legend */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}
        >
          <Typography variant="h6" fontWeight={600}>
            Follow-Up Calendar
          </Typography>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip
              size="small"
              label="Pending"
              sx={{ backgroundColor: "#6c757d", color: "#fff" }}
            />
            <Chip
              size="small"
              label="Attempted – No Contact"
              sx={{ backgroundColor: "#ed6c02", color: "#fff" }}
            />
            <Chip
              size="small"
              label="Reached – Working"
              sx={{ backgroundColor: "#0288d1", color: "#fff" }}
            />
            <Chip
              size="small"
              label="Promise"
              sx={{ backgroundColor: "#1976d2", color: "#fff" }}
            />
            <Chip
              size="small"
              label="Partial Payment"
              sx={{ backgroundColor: "#9c27b0", color: "#fff" }}
            />
            <Chip
              size="small"
              label="Resolved"
              sx={{ backgroundColor: "#2e7d32", color: "#fff" }}
            />
          </Stack>
        </Stack>

        {/* Calendar wrapper for SaaS look */}
        <Box
          sx={{
            borderRadius: 2,
            overflow: "hidden",
            border: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.06)",
            "& .fc": {
              fontFamily:
                '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            },
            "& .fc-toolbar-title": {
              fontSize: "1.1rem",
              fontWeight: 600,
            },
            "& .fc-col-header-cell": {
              backgroundColor: "#f8fafc",
            },
            "& .fc-day-today": {
              backgroundColor: "rgba(25, 118, 210, 0.05)",
            },
            "& .fc-daygrid-day-number": {
              fontSize: "0.8rem",
            },
            "& .fc-event": {
              borderRadius: "12px",
              padding: "1px 4px",
              fontSize: "0.72rem",
              fontWeight: 500,
            },
          }}
        >
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "",
            }}
            events={events}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            height="auto"
            fixedWeekCount={false}
            dayMaxEvents={3} // "+ more" when many clients same day
          />
        </Box>
      </CardContent>
    </Card>
  );
}