// src/ClientDashboard/PaymentPromise.js
import React, { useState } from 'react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import db from '../firebase';

/** ──────────────────────────────────────────────────────────────
 *  Named export used by Agenda/Week/Month Day calendar views
 *  Keeps behavior identical to before refactor.
 *  - Saves/overwrites the single paymentPromise field
 *  - Appends a comms log entry
 *  - Throws on validation error
 *  ──────────────────────────────────────────────────────────── */
export async function savePaymentPromise(clientId, promiseDate, amount, notes) {
  if (!clientId) throw new Error("Missing client id");
  if (!promiseDate || !amount) throw new Error("Date and amount required");

  const updatedPromise = {
    date: promiseDate,
    amount: parseFloat(amount),
    notes: notes || ''
  };

  const auth = getAuth();
  const user = auth.currentUser;
  const who = user?.displayName || user?.email || 'Anonymous';

  const logMessage =
    `Client promised to pay $${Number(updatedPromise.amount).toLocaleString()} on ${updatedPromise.date}. Notes: ${updatedPromise.notes || 'None'}`;

  const newLog = {
    message: logMessage,
    timestamp: new Date().toISOString(),
    user: who,
  };

  const clientRef = doc(db, 'clients', clientId);
  await updateDoc(clientRef, {
    paymentPromise: updatedPromise,
    communicationLogs: arrayUnion(newLog),
  });

  return { updatedPromise, newLog };
}

/** ──────────────────────────────────────────────────────────────
 *  Default UI component (refreshed styling, same logic)
 *  ──────────────────────────────────────────────────────────── */
export default function PaymentPromise({ client, setClient }) {
  const [promiseDate, setPromiseDate] = useState('');
  const [promiseAmount, setPromiseAmount] = useState('');
  const [promiseNotes, setPromiseNotes] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const onSave = async () => {
    if (!client?.id) return;
    try {
      const { updatedPromise, newLog } = await savePaymentPromise(
        client.id,
        promiseDate,
        promiseAmount,
        promiseNotes
      );

      setClient(prev => ({
        ...prev,
        paymentPromise: updatedPromise,
        communicationLogs: [...(prev.communicationLogs || []), newLog],
      }));

      setPromiseDate('');
      setPromiseAmount('');
      setPromiseNotes('');
      setIsEditing(false);
    } catch (e) {
      console.error(e);
      alert(e.message || 'Failed to save promise');
    }
  };

  const onDelete = async () => {
    if (!client?.id) return;
    if (!window.confirm("Delete this payment promise?")) return;
    const clientRef = doc(db, 'clients', client.id);
    await updateDoc(clientRef, { paymentPromise: null });
    setClient(prev => ({ ...prev, paymentPromise: null }));
  };

  const startEdit = () => {
    if (!client?.paymentPromise) return;
    setPromiseDate(client.paymentPromise.date || '');
    setPromiseAmount(client.paymentPromise.amount || '');
    setPromiseNotes(client.paymentPromise.notes || '');
    setIsEditing(true);
  };

  const isMissed = (() => {
    const d = client?.paymentPromise?.date;
    if (!d) return false;
    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
    return new Date(d) < todayMidnight;
  })();

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3 style={{ marginBottom: '1rem' }}>📅 Payment Promise</h3>

      {client?.paymentPromise && isMissed && (
        <div style={alertBoxRed}>
          🔴 Missed promise from <strong>{client.paymentPromise.date}</strong> – $
          {Number(client.paymentPromise.amount).toLocaleString()}
        </div>
      )}

      {client?.paymentPromise && (
        <div style={cardGreen}>
          <p><strong>Promised on:</strong> {client.paymentPromise.date}</p>
          <p><strong>Amount:</strong> ${Number(client.paymentPromise.amount).toLocaleString()}</p>
          <p><strong>Notes:</strong> {client.paymentPromise.notes || 'None'}</p>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button onClick={startEdit} style={btnBlue}>✏️ Edit</button>
            <button onClick={onDelete} style={btnRed}>🗑️ Delete</button>
          </div>
        </div>
      )}

      {/* Form */}
      <div style={formBox}>
        <label style={labelStyle}>Promise Date</label>
        <input
          type="date"
          value={promiseDate}
          onChange={(e) => setPromiseDate(e.target.value)}
          style={inputStyle}
        />

        <label style={labelStyle}>Amount</label>
        <input
          type="number"
          value={promiseAmount}
          onChange={(e) => setPromiseAmount(e.target.value)}
          style={inputStyle}
        />

        <label style={labelStyle}>Notes</label>
        <textarea
          value={promiseNotes}
          onChange={(e) => setPromiseNotes(e.target.value)}
          rows={3}
          style={inputStyle}
        />

        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button onClick={onSave} style={btnPrimary}>💾 Save Promise</button>
          {isEditing && (
            <button onClick={() => setIsEditing(false)} style={btnGray}>Cancel</button>
          )}
        </div>
      </div>

      {client?.paymentPromise && !isEditing && new Date(client.paymentPromise.date) > new Date() && (
        <div style={{ marginTop: '1.5rem', padding: 10, borderRadius: 6, backgroundColor: '#f1f9ff', border: '1px solid #cce5ff' }}>
          <h4>📆 Upcoming Promise</h4>
          <p>
            <strong>{new Date(client.paymentPromise.date).toLocaleDateString()}</strong> – $
            {Number(client.paymentPromise.amount).toLocaleString()} – Still Pending
          </p>
        </div>
      )}
    </div>
  );
}

/* ── styles (unchanged logic) ────────────────────────────────── */
const cardGreen = {
  backgroundColor: '#e9f7ef',
  border: '1px solid #c3e6cb',
  padding: 12,
  borderRadius: 8,
  marginBottom: '1rem'
};
const alertBoxRed = {
  backgroundColor: '#f8d7da',
  border: '1px solid #f5c6cb',
  color: '#721c24',
  padding: 12,
  borderRadius: 8,
  marginBottom: '1rem'
};
const formBox = {
  backgroundColor: '#f9f9f9',
  border: '1px solid #ddd',
  padding: 12,
  borderRadius: 8,
};
const inputStyle = {
  display: 'block',
  marginBottom: '0.8rem',
  width: '100%',
  padding: 8,
  borderRadius: 4,
  border: '1px solid #ccc'
};
const labelStyle = { fontWeight: 500, marginBottom: '0.2rem', display: 'block' };
const btnPrimary = { padding: '8px 14px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' };
const btnRed = { ...btnPrimary, backgroundColor: '#dc3545' };
const btnBlue = { ...btnPrimary, backgroundColor: '#17a2b8' };
const btnGray = { ...btnPrimary, backgroundColor: '#6c757d' };