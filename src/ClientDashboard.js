// New isolated section for Invoice Setup in Client Dashboard
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import db from './firebase';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import InvoiceSection from './InvoiceSection';

function ClientDashboard() {
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logEntry, setLogEntry] = useState('');
  const [arrangementStart, setArrangementStart] = useState('');
  const [arrangementEnd, setArrangementEnd] = useState('');
  const [reducedAmount, setReducedAmount] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');

  useEffect(() => {
    const fetchClient = async () => {
      const clientRef = doc(db, 'clients', clientId);
      const clientSnap = await getDoc(clientRef);
      if (clientSnap.exists()) {
        setClient({ id: clientSnap.id, ...clientSnap.data() });
      }
      setLoading(false);
    };
    fetchClient();
  }, [clientId]);

  const formatMonthYear = (value) => {
    const [year, month] = value.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const handleAddLog = async () => {
    if (!logEntry.trim()) return;
    const auth = getAuth();
    const user = auth.currentUser;
    const newLog = {
      message: logEntry,
      timestamp: new Date().toISOString(),
      user: user?.displayName || user?.email || 'Anonymous'
    };
    const clientRef = doc(db, 'clients', clientId);
    await updateDoc(clientRef, {
      communicationLogs: arrayUnion(newLog)
    });
    setClient(prev => ({
      ...prev,
      communicationLogs: [...(prev.communicationLogs || []), newLog]
    }));
    setLogEntry('');
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

  const invoiceTotal = parseFloat(client?.invoiceTotal || 0);
  const totalPaid = (client?.payments || []).reduce((sum, p) => sum + p.amount, 0);
  const remainingBalance = invoiceTotal - totalPaid;
  const monthlyInstallment = 500;
  const paymentsLeft = Math.ceil(remainingBalance / monthlyInstallment);

  const calculateDueMonths = () => {
    const startDate = client?.firstInstallmentDate ? new Date(client.firstInstallmentDate) : new Date('2023-01-15');
    const today = new Date();
    const paidMonths = Math.floor(totalPaid / monthlyInstallment);
    const dueMonths = [];
    for (let i = paidMonths; i < paidMonths + paymentsLeft; i++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(startDate.getMonth() + i);
      if (dueDate > today) break;
      dueMonths.push(`${dueDate.toLocaleString('default', { month: 'long' })} ${dueDate.getFullYear()}`);
    }
    return dueMonths;
  };

  const dueMonths = calculateDueMonths();

  if (loading) return <p>Loading client details...</p>;
  if (!client) return <p>Client not found.</p>;

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: 'auto' }}>
      <h2>Client Dashboard</h2>

      <div style={{ marginBottom: '2rem' }}>
        <h3>Client Info</h3>
        <p><strong>Name:</strong> {client.firstName} {client.lastName}</p>
        <p><strong>Case Type:</strong> {client.caseType}</p>
        <p><strong>Case Status:</strong> {client.caseStatus}</p>
        <p><strong>Amount Due:</strong> ${parseFloat(client.amountDue || 0).toFixed(2)}</p>
        <p><strong>Months Past Due:</strong> {client.monthsPastDue || 'None'}</p>
        <p><strong>Last Payment Date:</strong> {client.lastPaymentDate || 'N/A'}</p>
        <p><strong>Payment Notes:</strong> {client.paymentNotes || 'None'}</p>
        <p><strong>Invoice Total:</strong> ${invoiceTotal.toFixed(2)}</p>
        <p><strong>Total Paid:</strong> ${totalPaid.toFixed(2)}</p>
        <p><strong>Remaining Balance:</strong> ${remainingBalance.toFixed(2)}</p>
        <p><strong>Payments Left:</strong> {paymentsLeft}</p>
        <p><strong>Expected Due Months:</strong> {dueMonths.length ? dueMonths.join(', ') : 'None'}</p>
      </div>

      <InvoiceSection client={client} setClient={setClient} />

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

      <div style={{ marginBottom: '2rem' }}>
        <h3>Communication Log</h3>
        {(client.communicationLogs || []).map((log, index) => (
          <div key={index} style={{ marginBottom: '1rem', padding: '10px', border: '1px solid #ccc', borderRadius: '6px' }}>
            <div style={{ fontSize: '14px', color: '#555', marginBottom: '6px' }}>
              🟢 Created {new Date(log.timestamp).toLocaleString()} by {log.user}
            </div>
            <div>{log.message}</div>
          </div>
        ))}
        <textarea
          value={logEntry}
          onChange={(e) => setLogEntry(e.target.value)}
          rows={4}
          placeholder="Write a new communication log..."
          style={{ width: '100%', padding: '10px', fontSize: '16px' }}
        />
        <button onClick={handleAddLog} style={{ marginTop: '10px', padding: '8px 16px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Submit Log
        </button>
      </div>
    </div>
  );
}

export default ClientDashboard;
