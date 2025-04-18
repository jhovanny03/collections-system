import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import db from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import InvoiceSection from '../InvoiceSection';
import BillingOverview from './BillingOverview';
import RecordPayment from './RecordPayment';
import PaymentArrangement from './PaymentArrangement';
import CommunicationLog from './CommunicationLog';
import PaymentPromise from './PaymentPromise'; // ✅ NEW

function ClientDashboard() {
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <p>Loading client details...</p>;
  if (!client) return <p>Client not found.</p>;

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: 'auto' }}>
      <h2>Client Dashboard</h2>

      <BillingOverview client={client} />

      <InvoiceSection client={client} setClient={setClient} />

      <RecordPayment client={client} setClient={setClient} />

      <PaymentArrangement client={client} setClient={setClient} />

      <PaymentPromise client={client} setClient={setClient} /> {/* ✅ NEW SECTION */}

      <CommunicationLog client={client} setClient={setClient} />
    </div>
  );
}

export default ClientDashboard;
