import React from 'react';

export default function BillingOverview({ client }) {
  const invoiceTotal = parseFloat(client?.invoiceTotal || 0);
  const monthlyInstallment = client.installmentAmount || 500;

  const rawStart = client.firstInstallmentDate;
  if (!rawStart) return <p>Missing first installment date.</p>;

  // Parse firstInstallmentDate
  let firstInstallmentDate;
  if (rawStart?.seconds) {
    firstInstallmentDate = new Date(rawStart.seconds * 1000);
  } else {
    firstInstallmentDate = new Date(rawStart);
  }

  const today = new Date();

  // Payments made after the first installment date
  const validPayments = (client?.payments || []).filter(p => {
    const paymentDate = new Date(p.date);
    return paymentDate >= firstInstallmentDate;
  });

  const validTotalPaid = validPayments.reduce((sum, p) => sum + p.amount, 0);
  const remainingBalance = invoiceTotal - validTotalPaid;

  // Format last payment
  const getLastPaymentDisplay = () => {
    if (!validPayments.length) return 'N/A';
    const latest = validPayments.reduce((latest, p) => {
      return new Date(p.date) > new Date(latest.date) ? p : latest;
    });
    const dateStr = new Date(latest.date).toLocaleDateString('default', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    return `${dateStr} – $${latest.amount.toLocaleString()}`;
  };

  // Calculate missed months
  const calculateMissedMonths = () => {
    const dueMonths = [];
    const missedRange = { start: null, end: null };

    const monthsSinceStart = Math.floor(
      (today.getFullYear() - firstInstallmentDate.getFullYear()) * 12 +
      (today.getMonth() - firstInstallmentDate.getMonth()) + 1
    );

    const paidInstallments = Math.floor(validTotalPaid / monthlyInstallment);
    const unpaidInstallments = Math.max(0, monthsSinceStart - paidInstallments);

    for (let i = paidInstallments; i < paidInstallments + unpaidInstallments; i++) {
      const dueDate = new Date(firstInstallmentDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      if (dueDate <= today) {
        const label = `${dueDate.toLocaleString('default', { month: 'long' })} ${dueDate.getFullYear()}`;
        dueMonths.push(label);
        if (!missedRange.start) missedRange.start = label;
        missedRange.end = label;
      }
    }

    return {
      dueMonths,
      missedLabel: missedRange.start ? `${missedRange.start} – ${missedRange.end}` : 'None'
    };
  };

  // Calculate future expected due months
  const calculateExpectedMonths = () => {
    const months = [];
    for (let i = 0; i < Math.ceil(remainingBalance / monthlyInstallment); i++) {
      const nextDate = new Date(firstInstallmentDate);
      nextDate.setMonth(nextDate.getMonth() + validPayments.length + i);
      months.push(`${nextDate.toLocaleString('default', { month: 'long' })} ${nextDate.getFullYear()}`);
    }
    return months;
  };

  const { dueMonths, missedLabel } = calculateMissedMonths();
  const expectedMonths = calculateExpectedMonths();
  const formatMoney = (value) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
  const paymentsLeft = Math.ceil(remainingBalance / monthlyInstallment);
  const amountDue = dueMonths.length * monthlyInstallment;

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3>Client Info</h3>
      <p><strong>Name:</strong> {client.firstName} {client.lastName}</p>
      <p><strong>Case Type:</strong> {client.caseType}</p>
      <p><strong>Case Status:</strong> {client.caseStatus}</p>
      <p><strong>Invoice Total:</strong> {formatMoney(invoiceTotal)}</p>
      <p><strong>Total Paid (After Installment Start):</strong> {formatMoney(validTotalPaid)}</p>
      <p><strong>Remaining Balance:</strong> {formatMoney(remainingBalance)}</p>
      <p><strong>Payments Left:</strong> {paymentsLeft}</p>
      <p><strong>Amount Due:</strong> {formatMoney(amountDue)}</p>
      <p><strong>Months Past Due:</strong> {dueMonths.length > 0 ? dueMonths.length : 'None'}</p>
      <p><strong>Missed Months:</strong> {missedLabel}</p>
      <p><strong>Expected Due Months:</strong> {expectedMonths.length > 0 ? expectedMonths.join(', ') : 'None'}</p>
      <p><strong>Last Payment Date:</strong> {getLastPaymentDisplay()}</p>
    </div>
  );
}
