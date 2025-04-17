import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import db from '../firebase';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import InvoiceSection from '../InvoiceSection';
import PaymentArrangement from './PaymentArrangement';
import RecordPayment from './RecordPayment';

function ClientDashboard() {
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logEntry, setLogEntry] = useState('');

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

      <PaymentArrangement clientId={clientId} client={client} setClient={setClient} />

      <RecordPayment clientId={clientId} client={client} setClient={setClient} />

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
