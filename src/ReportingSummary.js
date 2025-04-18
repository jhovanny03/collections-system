import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import db from './firebase';

function ReportingSummary() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const clientSnap = await getDocs(collection(db, 'clients'));
      const clients = clientSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      let pastDueCount = 0;
      let totalAmountOwed = 0;
      let highBalanceCount = 0;
      let arrangementCount = 0;

      let totalPromisedThisMonth = 0;
      let clientsWithPromise = 0;
      let promisesMade = 0;
      let promisesFulfilled = 0;

      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();

      clients.forEach(client => {
        const invoiceTotal = parseFloat(client?.invoiceTotal || 0);
        const monthlyInstallment = client.installmentAmount || 500;

        let startDate;
        const raw = client.firstInstallmentDate;
        if (!raw) return;

        if (raw?.seconds) {
          startDate = new Date(raw.seconds * 1000);
        } else {
          startDate = new Date(raw);
        }

        const today = new Date();

        const validPayments = (client?.payments || []).filter(p => {
          const d = new Date(p.date);
          return d >= startDate;
        });

        const paidTotal = validPayments.reduce((sum, p) => sum + p.amount, 0);

        const monthsSinceStart = Math.floor(
          (today.getFullYear() - startDate.getFullYear()) * 12 +
          (today.getMonth() - startDate.getMonth()) + 1
        );

        const paidMonths = Math.floor(paidTotal / monthlyInstallment);
        const missedMonths = Math.max(0, monthsSinceStart - paidMonths);
        const amountDue = missedMonths * monthlyInstallment;

        if (missedMonths > 0) {
          pastDueCount++;
          totalAmountOwed += amountDue;
        }

        if (amountDue > 2000) {
          highBalanceCount++;
        }

        if (client.paymentArrangement) {
          arrangementCount++;
        }

        // 🔍 Promises Summary
        const p = client.paymentPromise;
        if (p?.date) {
          const promiseDate = new Date(p.date);
          if (promiseDate.getMonth() === thisMonth && promiseDate.getFullYear() === thisYear) {
            totalPromisedThisMonth += parseFloat(p.amount || 0);
          }

          clientsWithPromise++;
          promisesMade++;

          const isFulfilled = (client.payments || []).some(payment => {
            const payDate = new Date(payment.date);
            return (
              payDate <= promiseDate &&
              parseFloat(payment.amount) >= parseFloat(p.amount)
            );
          });

          if (isFulfilled) {
            promisesFulfilled++;
          }
        }
      });

      const totalClients = clients.length;
      const pastDuePercent = totalClients > 0 ? Math.round((pastDueCount / totalClients) * 100) : 0;

      setSummary({
        totalClients,
        pastDueCount,
        totalAmountOwed,
        pastDuePercent,
        highBalanceCount,
        arrangementCount,
        totalPromisedThisMonth,
        clientsWithPromise,
        promisesMade,
        promisesFulfilled
      });
    };

    fetchData();
  }, []);

  if (!summary) return <p>Loading report...</p>;

  const formatMoney = (value) => `$${value.toLocaleString()}`;

  return (
    <div style={{
      backgroundColor: '#fff',
      padding: '20px',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      marginBottom: '20px'
    }}>
      <h2 style={{ marginBottom: '16px', color: '#2c3e50' }}>📊 Collections Summary</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px' }}>
        <div>
          <p style={{ fontWeight: 'bold', margin: 0 }}>Total Clients</p>
          <p>{summary.totalClients}</p>
        </div>
        <div>
          <p style={{ fontWeight: 'bold', margin: 0 }}>Past Due Clients</p>
          <p>{summary.pastDueCount}</p>
        </div>
        <div>
          <p style={{ fontWeight: 'bold', margin: 0 }}>Total Amount Owed</p>
          <p>{formatMoney(summary.totalAmountOwed)}</p>
        </div>
        <div>
          <p style={{ fontWeight: 'bold', margin: 0 }}>% Past Due</p>
          <p>{summary.pastDuePercent}%</p>
        </div>
        <div>
          <p style={{ fontWeight: 'bold', margin: 0 }}>Clients Owing &gt; $2,000</p>
          <p>{summary.highBalanceCount}</p>
        </div>
        <div>
          <p style={{ fontWeight: 'bold', margin: 0 }}>Clients on Arrangement</p>
          <p>{summary.arrangementCount}</p>
        </div>
        <div>
          <p style={{ fontWeight: 'bold', margin: 0 }}>Clients with Promises</p>
          <p>{summary.clientsWithPromise}</p>
        </div>
        <div>
          <p style={{ fontWeight: 'bold', margin: 0 }}>💰 Promised This Month</p>
          <p>{formatMoney(summary.totalPromisedThisMonth)}</p>
        </div>
        <div>
          <p style={{ fontWeight: 'bold', margin: 0 }}>📊 Promises Made / Fulfilled</p>
          <p>{summary.promisesMade} / {summary.promisesFulfilled}</p>
        </div>
      </div>
    </div>
  );
}

export default ReportingSummary;
