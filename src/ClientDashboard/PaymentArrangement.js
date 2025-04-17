import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import db from '../firebase';

export default function PaymentArrangement({ clientId, client, setClient }) {
  const [arrangementStart, setArrangementStart] = useState('');
  const [arrangementEnd, setArrangementEnd] = useState('');
  const [reducedAmount, setReducedAmount] = useState('');

  const formatMonthYear = (value) => {
    const [year, month] = value.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const handleSaveArrangement = async () => {
    if (!arrangementStart || !arrangementEnd || !reducedAmount) return;
    const updatedArrangement = {
      startMonth: formatMonthYear(arrangementStart),
      endMonth: formatMonthYear(arrangementEnd),
      reducedAmount: parseFloat(reducedAmount)
    };
    const clientRef = doc(db, 'clients', clientId);
    await updateDoc(clientRef, {
      paymentArrangement: updatedArrangement
    });
    setClient(prev => ({
      ...prev,
      paymentArrangement: updatedArrangement
    }));
    setArrangementStart('');
    setArrangementEnd('');
    setReducedAmount('');
  };

  const handleDeleteArrangement = async () => {
    const confirmDelete = window.confirm("Are you sure you want to delete this payment arrangement?");
    if (!confirmDelete) return;
    const clientRef = doc(db, 'clients', clientId);
    await updateDoc(clientRef, {
      paymentArrangement: null
    });
    setClient(prev => ({ ...prev, paymentArrangement: null }));
  };

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3>Payment Arrangement</h3>
      {client.paymentArrangement ? (
        <div style={{ marginBottom: '1rem', fontStyle: 'italic' }}>
          Active Arrangement: ${client.paymentArrangement.reducedAmount.toFixed(2)} from {client.paymentArrangement.startMonth} to {client.paymentArrangement.endMonth}
          <br />
          <button onClick={handleDeleteArrangement} style={{ marginTop: '8px', backgroundColor: '#dc3545', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
            Delete Arrangement
          </button>
        </div>
      ) : (
        <p>No active payment arrangement.</p>
      )}
      <label>Start Month:</label>
      <input
        type="month"
        value={arrangementStart}
        onChange={(e) => setArrangementStart(e.target.value)}
        style={{ width: '100%', marginBottom: '8px', padding: '8px' }}
      />
      <label>End Month:</label>
      <input
        type="month"
        value={arrangementEnd}
        onChange={(e) => setArrangementEnd(e.target.value)}
        style={{ width: '100%', marginBottom: '8px', padding: '8px' }}
      />
      <input
        type="number"
        placeholder="Reduced Monthly Amount"
        value={reducedAmount}
        onChange={(e) => setReducedAmount(e.target.value)}
        style={{ width: '100%', marginBottom: '8px', padding: '8px' }}
      />
      <button onClick={handleSaveArrangement} style={{ padding: '8px 16px', backgroundColor: '#17a2b8', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
        Save Arrangement
      </button>
    </div>
  );
}
