import React, { useState } from 'react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import db from './firebase';

export default function InvoiceSection({ client, setClient }) {
  const [invoiceInput, setInvoiceInput] = useState('');
  const [initialPaymentInput, setInitialPaymentInput] = useState('');
  const [initialPaymentDate, setInitialPaymentDate] = useState('');
  const [firstInstallmentDate, setFirstInstallmentDate] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editMode, setEditMode] = useState(false);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('default', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const handleSaveInvoiceAndInitialPayment = async () => {
    const invoice = parseFloat(invoiceInput);
    const initial = parseFloat(initialPaymentInput);

    if (
      !invoiceInput || !initialPaymentInput ||
      !initialPaymentDate || !firstInstallmentDate ||
      isNaN(invoice) || isNaN(initial) ||
      invoice <= 0 || initial <= 0
    ) {
      setError('Please fill in all fields and ensure values are greater than zero.');
      setSuccess('');
      return;
    }

    const paymentExists = (client.payments || []).some(p => p.date === initialPaymentDate);
    if (paymentExists) {
      setError('A payment already exists for the selected date.');
      setSuccess('');
      return;
    }

    const auth = getAuth();
    const user = auth.currentUser;
    const username = user?.displayName || user?.email || 'Anonymous';

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
      payments: arrayUnion(newPayment),
      invoiceUpdatedBy: username,
      invoiceUpdatedAt: new Date().toISOString()
    });

    setClient(prev => ({
      ...prev,
      invoiceTotal: invoice,
      initialPaymentDate,
      firstInstallmentDate,
      invoiceUpdatedBy: username,
      invoiceUpdatedAt: new Date().toISOString(),
      payments: [...(prev.payments || []), newPayment]
    }));

    setInvoiceInput('');
    setInitialPaymentInput('');
    setInitialPaymentDate('');
    setFirstInstallmentDate('');
    setError('');
    setSuccess('✅ Invoice and initial payment saved successfully!');
    setEditMode(false);

    setTimeout(() => setSuccess(''), 4000);
  };

  const handleDeleteInvoice = async () => {
    const confirmDelete = window.confirm('Are you sure you want to delete this invoice and initial payment info?');
    if (!confirmDelete) return;

    const clientRef = doc(db, 'clients', client.id);
    await updateDoc(clientRef, {
      invoiceTotal: null,
      initialPaymentDate: null,
      firstInstallmentDate: null,
      invoiceUpdatedBy: null,
      invoiceUpdatedAt: null
    });

    setClient(prev => ({
      ...prev,
      invoiceTotal: null,
      initialPaymentDate: null,
      firstInstallmentDate: null,
      invoiceUpdatedBy: null,
      invoiceUpdatedAt: null
    }));

    setSuccess('🗑️ Invoice and initial payment removed.');
    setEditMode(false);

    setTimeout(() => setSuccess(''), 4000);
  };

  const showForm = editMode || !client.invoiceTotal;

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3>Setup Invoice and Initial Payment</h3>

      {error && (
        <div style={{ marginBottom: '10px', color: 'red', fontWeight: 'bold' }}>
          ❌ {error}
        </div>
      )}

      {success && (
        <div style={{ marginBottom: '10px', color: 'green', fontWeight: 'bold' }}>
          {success}
        </div>
      )}

      {showForm ? (
        <>
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
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleSaveInvoiceAndInitialPayment}
              style={{ padding: '8px 16px', backgroundColor: '#6f42c1', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Save Invoice & Initial Payment
            </button>
            <button
              onClick={() => {
                setEditMode(false);
                setInvoiceInput('');
                setInitialPaymentInput('');
                setInitialPaymentDate('');
                setFirstInstallmentDate('');
                setError('');
                setSuccess('');
              }}
              style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginTop: '1rem', fontStyle: 'italic', backgroundColor: '#f8f9fa', padding: '1rem', borderRadius: '6px' }}>
            <h4>📋 Current Invoice Overview</h4>
            <p><strong>Invoice Total:</strong> ${parseFloat(client.invoiceTotal).toFixed(2)}</p>
            <p><strong>Initial Payment Date:</strong> {formatDate(client.initialPaymentDate)}</p>
            <p><strong>Installments Start On:</strong> {formatDate(client.firstInstallmentDate)}</p>
            <p><strong>Last Edited By:</strong> {client.invoiceUpdatedBy || 'Unknown'}</p>
            <p><strong>Last Updated At:</strong> {formatDate(client.invoiceUpdatedAt)}</p>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <button
              onClick={() => setEditMode(true)}
              style={{ marginRight: '10px', backgroundColor: '#ffc107', color: '#000', padding: '8px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              ✏️ Edit Invoice
            </button>
            <button
              onClick={handleDeleteInvoice}
              style={{ backgroundColor: '#dc3545', color: '#fff', padding: '8px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              🗑️ Delete Invoice
            </button>
          </div>
        </>
      )}
    </div>
  );
}
