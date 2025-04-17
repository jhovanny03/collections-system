import React, { useState } from 'react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import db from './firebase';

export default function InvoiceSection({ client, setClient }) {
  const [invoiceInput, setInvoiceInput] = useState('');
  const [initialPaymentInput, setInitialPaymentInput] = useState('');
  const [initialPaymentDate, setInitialPaymentDate] = useState('');
  const [firstInstallmentDate, setFirstInstallmentDate] = useState('');

  const handleSaveInvoiceAndInitialPayment = async () => {
    const invoice = parseFloat(invoiceInput);
    const initial = parseFloat(initialPaymentInput);

    if (!invoice || !initial || !initialPaymentDate || !firstInstallmentDate) return;

    const clientRef = doc(db, 'clients', client.id);

    const newPayment = {
      amount: initial,
      date: initialPaymentDate,
      recordedAt: new Date().toISOString()
    };

    await updateDoc(clientRef, {
      invoiceTotal: invoice,
      initialPaymentDate,
      firstInstallmentDate,
      payments: arrayUnion(newPayment)
    });

    setClient(prev => ({
      ...prev,
      invoiceTotal: invoice,
      initialPaymentDate,
      firstInstallmentDate,
      payments: [...(prev.payments || []), newPayment]
    }));

    setInvoiceInput('');
    setInitialPaymentInput('');
    setInitialPaymentDate('');
    setFirstInstallmentDate('');
  };

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3>Setup Invoice and Initial Payment</h3>
      <input
        type="number"
        placeholder="Invoice Total"
        value={invoiceInput}
        onChange={(e) => setInvoiceInput(e.target.value)}
        style={{ width: '100%', marginBottom: '8px', padding: '8px' }}
      />
      <input
        type="number"
        placeholder="Initial Payment"
        value={initialPaymentInput}
        onChange={(e) => setInitialPaymentInput(e.target.value)}
        style={{ width: '100%', marginBottom: '8px', padding: '8px' }}
      />
      <label>Initial Payment Date:</label>
      <input
        type="date"
        value={initialPaymentDate}
        onChange={(e) => setInitialPaymentDate(e.target.value)}
        style={{ width: '100%', marginBottom: '8px', padding: '8px' }}
      />
      <label>First Installment Starts On:</label>
      <input
        type="date"
        value={firstInstallmentDate}
        onChange={(e) => setFirstInstallmentDate(e.target.value)}
        style={{ width: '100%', marginBottom: '8px', padding: '8px' }}
      />
      <button
        onClick={handleSaveInvoiceAndInitialPayment}
        style={{ padding: '8px 16px', backgroundColor: '#6f42c1', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
      >
        Save Invoice & Initial Payment
      </button>

      {client.invoiceTotal && (
        <div style={{ marginTop: '1rem', fontStyle: 'italic' }}>
          <p><strong>Current Invoice:</strong> ${parseFloat(client.invoiceTotal).toFixed(2)}</p>
          <p><strong>Initial Payment Date:</strong> {client.initialPaymentDate || 'N/A'}</p>
          <p><strong>Installments Start:</strong> {client.firstInstallmentDate || 'N/A'}</p>
        </div>
      )}
    </div>
  );
}
