import React, { useState } from 'react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import db from '../firebase';

function PaymentPromise({ client, setClient }) {
  const [promiseDate, setPromiseDate] = useState('');
  const [promiseAmount, setPromiseAmount] = useState('');
  const [promiseNotes, setPromiseNotes] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const handleSavePromise = async () => {
    if (!promiseDate || !promiseAmount) return;

    const updatedPromise = {
      date: promiseDate,
      amount: parseFloat(promiseAmount),
      notes: promiseNotes
    };

    const clientRef = doc(db, 'clients', client.id);

    const auth = getAuth();
    const user = auth.currentUser;
    const logMessage = `Client promised to pay $${updatedPromise.amount.toLocaleString()} on ${updatedPromise.date}. Notes: ${updatedPromise.notes || 'None'}`;

    const newLog = {
      message: logMessage,
      timestamp: new Date().toISOString(),
      user: user?.displayName || user?.email || 'Anonymous'
    };

    await updateDoc(clientRef, {
      paymentPromise: updatedPromise,
      communicationLogs: arrayUnion(newLog)
    });

    setClient(prev => ({
      ...prev,
      paymentPromise: updatedPromise,
      communicationLogs: [...(prev.communicationLogs || []), newLog]
    }));

    setPromiseDate('');
    setPromiseAmount('');
    setPromiseNotes('');
    setIsEditing(false);
  };

  const handleDeletePromise = async () => {
    const confirm = window.confirm("Are you sure you want to delete this payment promise?");
    if (!confirm) return;

    const clientRef = doc(db, 'clients', client.id);
    await updateDoc(clientRef, {
      paymentPromise: null
    });

    setClient(prev => ({
      ...prev,
      paymentPromise: null
    }));
  };

  const handleEditClick = () => {
    if (client.paymentPromise) {
      setPromiseDate(client.paymentPromise.date);
      setPromiseAmount(client.paymentPromise.amount);
      setPromiseNotes(client.paymentPromise.notes || '');
      setIsEditing(true);
    }
  };

  const isPromiseMissed = () => {
    if (!client.paymentPromise?.date) return false;
    const today = new Date();
    const promise = new Date(client.paymentPromise.date);
    return promise < today.setHours(0, 0, 0, 0);
  };

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3>📅 Payment Promise</h3>

      {client.paymentPromise && isPromiseMissed() && !isEditing && (
        <div style={{
          backgroundColor: '#f8d7da',
          color: '#721c24',
          padding: '10px',
          borderRadius: '6px',
          marginBottom: '10px',
          border: '1px solid #f5c6cb'
        }}>
          🔴 Missed promised payment from {client.paymentPromise.date} – ${parseFloat(client.paymentPromise.amount).toLocaleString()}
        </div>
      )}

      {!client.paymentPromise && !isEditing && (
        <p>No payment promise saved.</p>
      )}

      {client.paymentPromise && !isEditing && (
        <div style={{ marginBottom: '10px', backgroundColor: '#e9f7ef', padding: '10px', borderRadius: '6px' }}>
          <strong>Promised on:</strong> {client.paymentPromise.date}<br />
          <strong>Amount:</strong> ${parseFloat(client.paymentPromise.amount).toLocaleString()}<br />
          <strong>Notes:</strong> {client.paymentPromise.notes || 'None'}
          <div style={{ marginTop: '10px' }}>
            <button onClick={handleEditClick} style={btnBlue}>Edit</button>
            <button onClick={handleDeletePromise} style={btnRed}>Delete</button>
          </div>
        </div>
      )}

      {(isEditing || !client.paymentPromise) && (
        <>
          <label>Promise Date:</label>
          <input
            type="date"
            value={promiseDate}
            onChange={(e) => setPromiseDate(e.target.value)}
            style={inputStyle}
          />

          <label>Amount:</label>
          <input
            type="number"
            value={promiseAmount}
            onChange={(e) => setPromiseAmount(e.target.value)}
            style={inputStyle}
          />

          <label>Notes:</label>
          <textarea
            value={promiseNotes}
            onChange={(e) => setPromiseNotes(e.target.value)}
            rows={3}
            style={inputStyle}
          />

          <button onClick={handleSavePromise} style={btnPrimary}>
            Save Promise
          </button>
          {isEditing && (
            <button onClick={() => setIsEditing(false)} style={btnGray}>
              Cancel
            </button>
          )}
        </>
      )}

      {/* 📆 Show upcoming promise (only if in the future) */}
      {client.paymentPromise && !isEditing && new Date(client.paymentPromise.date) > new Date() && (
        <div style={{ marginTop: '2rem' }}>
          <h4>📆 Upcoming Promise</h4>
          <p>
            • <strong>{new Date(client.paymentPromise.date).toLocaleDateString()}</strong> – ${parseFloat(client.paymentPromise.amount).toLocaleString()} – Still Pending
          </p>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  display: 'block',
  marginBottom: '0.5rem',
  width: '100%',
  padding: '8px'
};

const btnPrimary = {
  marginTop: '10px',
  padding: '8px 16px',
  backgroundColor: '#007bff',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  marginRight: '0.5rem'
};

const btnRed = {
  ...btnPrimary,
  backgroundColor: '#dc3545'
};

const btnBlue = {
  ...btnPrimary,
  backgroundColor: '#17a2b8'
};

const btnGray = {
  ...btnPrimary,
  backgroundColor: '#6c757d'
};

export default PaymentPromise;
