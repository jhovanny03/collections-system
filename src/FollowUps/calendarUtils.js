import dayjs from 'dayjs';

// Transforma cada registro de PaymentPromise en evento legible
export const formatEventData = (data) => {
  return data.map(promise => {
    const start = dayjs(promise.dueDate); // puedes ajustar a promise.date o promise.startDate
    const end = start.add(2, 'hour'); // duración ficticia, se puede personalizar

    return {
      title: promise.clientName || 'Pago sin nombre',
      date: start.toISOString(),
      time: `${start.format('HH:mm')} - ${end.format('HH:mm')}`,
      responsible: promise.createdBy || 'Sistema',
      description: `Estado: ${promise.status || 'Pendiente'}`
    };
  });
};
