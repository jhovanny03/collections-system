// src/ClientDashboard/ClientDashboard.js
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import db from "../firebase";
import { doc, getDoc } from "firebase/firestore";

import InvoiceSection from "../InvoiceSection";
import CaseSwitcher from "./CaseSwitcher";
import RecordPayment from "./RecordPayment";
import PaymentArrangement from "./PaymentArrangement";
import CommunicationLog from "./CommunicationLog";
import PaymentPromise from "./PaymentPromise";
import InstallmentSettings from "./InstallmentSettings";
import InvoiceAdjustments from "./InvoiceAdjustments";
import ClientActions from "./ClientActions";
import LetterDrafter from "./LetterDrafter";

// ✅ NEW
import CaseOnHoldToggle from "./CaseOnHoldToggle";

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

  // Title text fallback
  const titleText =
    client.caseTitle || `${client.firstName || ""} ${client.lastName || ""}`.trim() || "Client";

  return (
    <div style={{ padding: "2rem", maxWidth: "900px", margin: "auto" }}>
      {/* Case title (clickable when myCaseLink exists) */}
      <h2
        style={{
          fontSize: "1.8rem",
          fontWeight: 700,
          marginBottom: "1.0rem",
          textAlign: "center",
        }}
      >
        {client.myCaseLink ? (
          <a
            href={client.myCaseLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#0b3a75",
              textDecoration: "none",
            }}
            title="Open in MyCase (new tab)"
          >
            {titleText}
            <span
              aria-hidden="true"
              style={{
                marginLeft: 8,
                fontSize: "0.85rem",
                opacity: 0.7,
                verticalAlign: "middle",
              }}
            >
              ↗
            </span>
          </a>
        ) : (
          titleText
        )}
      </h2>

      {/* ✅ Case On Hold toggle + banner */}
      <CaseOnHoldToggle client={client} setClient={setClient} />

      {/* Existing actions (Pause / Skip / Close) */}
      <ClientActions client={client} setClient={setClient} />

      <CaseSwitcher client={client} setClient={setClient} />

      <InvoiceAdjustments client={client} setClient={setClient} />
      <InvoiceSection client={client} setClient={setClient} />
      <InstallmentSettings client={client} setClient={setClient} />
      <RecordPayment client={client} setClient={setClient} />
      {/* <PaymentArrangement client={client} setClient={setClient} /> */}

      <PaymentPromise client={client} setClient={setClient} />
      <CommunicationLog client={client} setClient={setClient} />

      <LetterDrafter client={client} />
    </div>
  );
}

export default ClientDashboard;