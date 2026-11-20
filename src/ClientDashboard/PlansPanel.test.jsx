// Run: CI=true npx react-scripts test --watchAll=false src/ClientDashboard/PlansPanel
import React from "react";
import { render, screen, within } from "@testing-library/react";
import PlansPanel from "./PlansPanel";
import { computeBillingSnapshot } from "../Reports/utils/billingCompute";

const twoPlans = {
  id: "m1", status: "active", firstName: "Jose", lastName: "Reyes",
  invoiceTotal: 8000, initialPaymentAmount: 2000, initialPaymentDate: "2026-02-01",
  firstInstallmentDate: "2026-03-15", installmentAmount: 500,
  installmentSchedule: [{ amount: 500, start: "2026-03-01", end: "2046-03-01", note: "" }],
  invoiceRoles: { 901: "initial", 902: "installment", 903: "installment" },
  plans: [
    { invoiceId: "902", invoiceNumber: "902", total: 6000, monthlyAmount: 500, startDate: "2026-03-15" },
    { invoiceId: "903", invoiceNumber: "903", total: 3000, monthlyAmount: 300, startDate: "2026-09-15" },
  ],
  payments: [
    { amount: 2000, date: "2026-02-01", kind: "initial", invoiceId: "901" },
    { amount: 500, date: "2026-03-15", invoiceId: "902" },
    { amount: 300, date: "2026-09-15", invoiceId: "903" },
  ],
};

test("renders nothing for single-plan clients", () => {
  const { container } = render(<PlansPanel client={{ ...twoPlans, plans: [twoPlans.plans[0]] }} />);
  expect(container).toBeEmptyDOMElement();
});

test("shows one card per plan with its own figures, and combined totals", () => {
  render(<PlansPanel client={twoPlans} />);
  expect(screen.getByText("Payment plans (2)")).toBeInTheDocument();
  expect(screen.getByText("MyCase invoice 902")).toBeInTheDocument();
  expect(screen.getByText("MyCase invoice 903")).toBeInTheDocument();
  expect(screen.getByText("Shown in Billing Overview below")).toBeInTheDocument();
  // Monthly total = $500 + $300
  expect(screen.getByText("$800")).toBeInTheDocument();
  // Plan 2's card shows its own monthly amount and the $300 paid to it.
  const plan2 = screen.getByText("Plan 2").closest("div").parentElement;
  expect(within(plan2).getAllByText("$300").length).toBeGreaterThanOrEqual(2);
  // Combined amount due equals the plan-aware AR snapshot used by the reports.
  const due = computeBillingSnapshot(twoPlans).amountDue;
  const label = screen.getByText("Amount due (all plans)");
  expect(label.nextSibling.textContent).toBe(`$${due.toLocaleString()}`);
});
