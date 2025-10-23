// src/FollowUps/Calendar/DroppableArea.js
import React from 'react';
import { DndContext } from '@dnd-kit/core';
import { useCalendar } from './CalendarContext';

/**
 * DroppableArea wraps calendar views to enable drag-and-drop event creation.
 * Listens for drag end and translates drop position into a new event.
 */
export default function DroppableArea({ children }) {
  const { addEvent } = useCalendar();

  const handleDragEnd = (event) => {
    const { over, delta } = event;
    if (!over) return;
    // TODO: translate `over` target and `delta` into date/time
    // Example stub: add a new event at current date/time
    addEvent({
      id: Date.now().toString(),
      title: 'New Event',
      start: new Date(),
      end: new Date(),
      color: 'primary',
    });
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      {children}
    </DndContext>
  );
}
