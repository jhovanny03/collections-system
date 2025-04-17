import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import db from '../firebase';

export default function RecordPayment({ clientId, client, setClient }) {
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');

  const handleRecordPayment = async () => {
    if (!paymentAmount || !paymentDate) return;
    const newPayment = {
      amount: parseFloat(paymentAmount),
      date: paymentDate,
      recordedAt: new Date().toISOString()
    };
    const clientRef = doc(db, 'clients', clientId);
    const updatedPayments = [...(client.payments || []), newPayment];
    await updateDoc(clientRef, {
      payments: updatedPayments
    });
    setClient(prev => ({ ...prev, payments: updatedPayments }));
    setPaymentAmount('');
    setPaymentDate('');
  };

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3>Record Payment</h3>
      <input
        type="date"
        value={paymentDate}
        onChange={(e) => setPaymentDate(e.target.value)}
        style={{ width: '100%', marginBottom: '8px', padding: '8px' }}
      />
      <input
        type="number"
        placeholder="Amount Paid"
        value={paymentAmount}
        onChange={(e) => setPaymentAmount(e.target.value)}
        style={{ width: '100%', marginBottom: '8px', padding: '8px' }}
      />
      <button
        onClick={handleRecordPayment}
        style={{ padding: '8px 16px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
      >
        Record Payment
      </button>

      {(client.payments || []).length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h4>Payment History</h4>
          <ul style={{ paddingLeft: '1rem' }}>
            {client.payments.map((p, index) => (
              <li key={index}>
                ${p.amount.toFixed(2)} on {new Date(p.date).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
