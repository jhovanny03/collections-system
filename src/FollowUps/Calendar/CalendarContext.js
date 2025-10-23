// src/FollowUps/Calendar/CalendarContext.js
import React, { createContext, useContext, useState, useEffect } from "react";


const CalendarContext = createContext();

/**
 * CalendarProvider wraps the follow-up section to manage calendar state and events.
 * @param {React.ReactNode} children - Nested components (Follow-Ups list and CalendarApp).
 * @param {Array} initialEvents - Initial events for the calendar.
 */
export function CalendarProvider({ children, initialEvents = [] }) {
  // Core events state, synchronized with initialEvents prop
  const [events, setEvents] = useState(initialEvents);
  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);


  // View and navigation state
  const [view, setView] = useState("month");        // "year" | "month" | "week" | "day" | "agenda"
  const [currentDate, setCurrentDate] = useState(new Date());
  const [agendaMode, setAgendaMode] = useState(false);
  const [use24HourFormat, setUse24HourFormat] = useState(false);
  const [selectedColors, setSelectedColors] = useState([]);
  const [dotBadge, setDotBadge] = useState(true);

  // Compute visible events based on selected color names
  const visibleEvents = selectedColors.length > 0
    ? events.filter(ev => selectedColors.includes(ev.colorName))
    : events;

  // Dialog and date picker for event CRUD
  const [viewEventToEdit, setViewEventToEdit] = useState(null);
  const [viewDate, setViewDate] = useState(null);

  // CRUD operations
  const addEvent    = (ev) => {
    console.log("[CalendarContext] addEvent received:", ev);
    setEvents(prev => [...prev, ev]);
  };
  const editEvent   = (ev) => setEvents(prev => prev.map(x => x.id === ev.id ? ev : x));
  const deleteEvent = (id) => setEvents(prev => prev.filter(x => x.id !== id));

  // Toggle options
  const toggleAgendaMode = () => setAgendaMode(m => !m);
  const toggleTimeFormat = () => setUse24HourFormat(f => !f);
  const toggleDotBadge   = () => setDotBadge(db => !db);

  // Color filter
  const filterByColors = (colors) => setSelectedColors(colors);

  // Dialog controls
  const clearViewEvent    = () => setViewEventToEdit(null);
  const clearViewDate     = () => setViewDate(null);
  const toggleEventDialog = (date) => setViewDate(date);

  return (
    <CalendarContext.Provider value={{
      // Calendar state
      events: visibleEvents,
      view,
      setView,
      currentDate,
      setCurrentDate,
      agendaMode,
      toggleAgendaMode,
      use24HourFormat,
      toggleTimeFormat,
      selectedColors,
      filterByColors,
      dotBadge,
      toggleDotBadge,

      // Dialog state
      viewEventToEdit,
      setViewEventToEdit,
      clearViewEvent,
      viewDate,
      setViewDate,
      clearViewDate,
      toggleEventDialog,

      // CRUD methods
      addEvent,
      editEvent,
      deleteEvent,
    }}>
      {children}
    </CalendarContext.Provider>
  );
}

/**
 * Hook to access calendar context values and actions.
 */
export const useCalendar = () => {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error("useCalendar must be used within CalendarProvider");
  return ctx;
};
