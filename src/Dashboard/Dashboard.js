import React from "react";
import SummaryCards from "./SummaryCards";
import AmountByCaseType from "./AmountByCaseType";
import CasesByStatus from "./CasesByStatus";
import PaymentsOverTime from "./PaymentsOverTime";
import PastDueLast3Months from "./PastDueLast3Months";
import PaymentsLast3Months from "./PaymentsLast3Months";
import ExpectedPayments from "./ExpectedPayments";
import OutstandingVsCollected from "./OutstandingVsCollected";

const Dashboard = () => {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold text-center">Collections Dashboard</h1>

      <SummaryCards />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AmountByCaseType />
        <CasesByStatus />
      </div>

      <PaymentsOverTime />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PastDueLast3Months />
        <PaymentsLast3Months />
      </div>

      <ExpectedPayments />

      <OutstandingVsCollected />
    </div>
  );
};

export default Dashboard;
