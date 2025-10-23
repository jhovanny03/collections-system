import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import db from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import InvoiceSection from "../InvoiceSection";
import BillingOverview from "./BillingOverview";
import RecordPayment from "./RecordPayment";
import PaymentArrangement from "./PaymentArrangement";
import CommunicationLog from "./CommunicationLog";
import PaymentPromise from "./PaymentPromise";
import InstallmentSettings from "./InstallmentSettings";
import InvoiceAdjustments from "./InvoiceAdjustments";
import ClientActions from "./ClientActions";
import LetterDrafter from "./LetterDrafter";

function ClientDashboard() {
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClient = async () => {
      const clientRef = doc(db, "clients", clientId);
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
    <div style={{ padding: "2rem", maxWidth: "900px", margin: "auto" }}>
      {/* Case title section */}
      <h2
        style={{
          fontSize: "1.8rem", // ~10% smaller than before
          fontWeight: "700",
          marginBottom: "1.5rem",
          textAlign: "center",
        }}
      >
        {client.caseTitle || `${client.firstName || ""} ${client.lastName || ""}`}
      </h2>

      {/* Action buttons (Pause / Skip / Close) */}
      <ClientActions client={client} setClient={setClient} />

      <BillingOverview client={client} />

      <InvoiceAdjustments client={client} setClient={setClient} />
      <InvoiceSection client={client} setClient={setClient} />
      <InstallmentSettings client={client} setClient={setClient} />
      <RecordPayment client={client} setClient={setClient} />
      {/* <PaymentArrangement client={client} setClient={setClient} /> */}

      <PaymentPromise client={client} setClient={setClient} />
      <CommunicationLog client={client} setClient={setClient} />

      {/* Letter drafter */}
      <LetterDrafter client={client} />
    </div>
  );
}

export default ClientDashboard;