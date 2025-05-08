import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const AmountByCaseType = () => {
  // Dummy data for now
  const data = [
    { caseType: "VAWA", amount: 50000 },
    { caseType: "T Visa", amount: 30000 },
    { caseType: "U Visa", amount: 20000 },
    { caseType: "Asylum", amount: 15000 },
    { caseType: "Marriage AOS", amount: 25000 },
  ];

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h2 className="text-lg font-semibold mb-4 text-center">
        Amount Owed by Case Type
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="caseType" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="amount" fill="#4f46e5" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AmountByCaseType;
