import React, { useEffect, useState } from "react";
import { Typography, Container, Button, Box } from "@mui/material";
import { Responsive, WidthProvider } from "react-grid-layout";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import SummaryCards from "./SummaryCards";
import AmountByCaseType from "./AmountByCaseType";
import CasesByStatus from "./CasesByStatus";
import PaymentsOverTime from "./PaymentsOverTime";
import PastDueLast3Months from "./PastDueLast3Months";
import PaymentsLast3Months from "./PaymentsLast3Months";
import ExpectedPayments from "./ExpectedPayments";
import OutstandingVsCollected from "./OutstandingVsCollected";

const ResponsiveGridLayout = WidthProvider(Responsive);

const defaultLayout = [
  { i: "ExpectedPayments", x: 0, y: 0, w: 6, h: 3 },
  { i: "OutstandingVsCollected", x: 6, y: 0, w: 6, h: 3 },
  { i: "PaymentsLast3Months", x: 0, y: 1, w: 6, h: 4 },
  { i: "PastDueLast3Months", x: 6, y: 1, w: 6, h: 4 },
  { i: "PaymentsOverTime", x: 0, y: 2, w: 6, h: 4 },
  { i: "CasesByStatus", x: 6, y: 2, w: 6, h: 4 },
  { i: "AmountByCaseType", x: 0, y: 3, w: 12, h: 4 },
];

const Dashboard = () => {
  const [layout, setLayout] = useState(defaultLayout);
  const [clients, setClients] = useState([]);
  const userId = "admin";

  useEffect(() => {
    fetchLayout();
    fetchClients();
  }, []);

  const fetchLayout = async () => {
    try {
      const docRef = doc(db, "dashboardLayouts", userId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const saved = docSnap.data();
        if (saved?.layouts?.lg) {
          setLayout(saved.layouts.lg);
        }
      }
    } catch (error) {
      console.error("🔥 Error loading layout:", error);
    }
  };

  const fetchClients = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "clients"));
      const allClients = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setClients(allClients);
      console.log("✅ Clients loaded:", allClients);
    } catch (error) {
      console.error("🔥 Error loading clients:", error);
    }
  };

  function calculateAmountDue(client) {
    const { firstInstallmentDate, installmentAmount, payments = [] } = client;
    if (!firstInstallmentDate || !installmentAmount) return 0;

    const today = new Date();
    const start = new Date(firstInstallmentDate);

    const monthsPassed =
      (today.getFullYear() - start.getFullYear()) * 12 +
      (today.getMonth() - start.getMonth()) +
      1;

    const expectedTotal = monthsPassed * installmentAmount;

    const actualPaid = payments
      .filter((p) => new Date(p.date) >= start)
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const amountDue = expectedTotal - actualPaid;
    return Math.max(amountDue, 0);
  }

  const totalClients = clients.length;
  const totalOwed = clients.reduce(
    (sum, client) => sum + calculateAmountDue(client),
    0
  );

  const summaryData = {
    totalClients,
    totalOwed,
    pastDueClients: 0, // next
    activeArrangements: 0, // next
    promisedPayments: 0, // next
  };

  const handleLayoutChange = (newLayout) => {
    setLayout(newLayout);
  };

  const handleSaveLayout = async () => {
    try {
      await setDoc(
        doc(db, "dashboardLayouts", userId),
        { layouts: { lg: layout } },
        { merge: false }
      );
      alert("✅ Layout saved!");
    } catch (error) {
      console.error("🔥 Error saving layout:", error);
    }
  };

  const handleResetLayout = async () => {
    setLayout(defaultLayout);
    try {
      await setDoc(
        doc(db, "dashboardLayouts", userId),
        { layouts: { lg: defaultLayout } },
        { merge: false }
      );
      alert("🔄 Layout reset to default!");
    } catch (error) {
      console.error("🔥 Error resetting layout:", error);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Typography variant="h4">Collections Dashboard</Typography>
        <Box display="flex" gap={2}>
          <Button variant="contained" onClick={handleSaveLayout}>
            Save Layout
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            onClick={handleResetLayout}
          >
            Reset Layout
          </Button>
        </Box>
      </Box>

      <SummaryCards data={summaryData} />

      <ResponsiveGridLayout
        className="layout"
        layouts={{ lg: layout }}
        breakpoints={{ lg: 1200, md: 996, sm: 768 }}
        cols={{ lg: 12, md: 10, sm: 6 }}
        rowHeight={80}
        onLayoutChange={handleLayoutChange}
        isResizable={true}
        isDraggable={true}
      >
        <div key="ExpectedPayments" style={widgetStyle}>
          <ExpectedPayments />
        </div>
        <div key="OutstandingVsCollected" style={widgetStyle}>
          <OutstandingVsCollected />
        </div>
        <div key="PaymentsLast3Months" style={widgetStyle}>
          <PaymentsLast3Months />
        </div>
        <div key="PastDueLast3Months" style={widgetStyle}>
          <PastDueLast3Months />
        </div>
        <div key="PaymentsOverTime" style={widgetStyle}>
          <PaymentsOverTime />
        </div>
        <div key="CasesByStatus" style={widgetStyle}>
          <CasesByStatus />
        </div>
        <div key="AmountByCaseType" style={widgetStyle}>
          <AmountByCaseType />
        </div>
      </ResponsiveGridLayout>
    </Container>
  );
};

const widgetStyle = {
  background: "#fff",
  borderRadius: 8,
  padding: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  overflow: "hidden",
};

export default Dashboard;
