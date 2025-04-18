// src/PromisedPaymentCalendar.js
import React, { useEffect, useState } from 'react';
import Calendar from 'react-calendar';
import { collection, getDocs } from 'firebase/firestore';
import db from './firebase';

function PromisedPaymentCalendar() {
  const [clients, setClients] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [promisesOnDate, setPromisesOnDate] = useState([]);

  useEffect(() => {
    const fetchClients = async () => {
      const snapshot = await getDocs(collection(db, 'clients'));
      const allClients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClients(allClients);
    };
    fetchClients();
  }, []);

  const getTileContent = ({ date }) => {
    const match = clients.filter(client => {
      const promiseDate = client.paymentPromise?.date;
      return promiseDate && new Date(promiseDate).toDateString() === date.toDateString();
    });

    if (match.length > 0) {
      return (
        <div style={{ backgroundColor: '#ffc107', borderRadius: '50%', width: '8px', height: '8px', margin: 'auto', marginTop: '2px' }}></div>
      );
    }
    return null;
  };

  const handleDateClick = (date) => {
    setSelectedDate(date);
    const matches = clients.filter(client =>
      client.paymentPromise?.date &&
      new Date(client.paymentPromise.date).toDateString() === date.toDateString()
    );
    setPromisesOnDate(matches);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: 'auto' }}>
      <h2>🗓️ Promised Payment Calendar</h2>
      <Calendar
        onClickDay={handleDateClick}
        value={selectedDate}
        tileContent={getTileContent}
      />

      {promisesOnDate.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h3>💵 Promises on {selectedDate.toDateString()}</h3>
          <ul>
            {promisesOnDate.map(client => (
              <li key={client.id}>
                <strong>{client.firstName} {client.lastName}</strong> – ${client.paymentPromise.amount.toLocaleString()}<br />
                <em>{client.paymentPromise.notes}</em>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default PromisedPaymentCalendar;
