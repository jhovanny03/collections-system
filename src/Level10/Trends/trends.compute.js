// Transform snapshots → chart series (currency, percent, counts)
const money = (n) => Number(n || 0);
const pct = (n) => Number(n || 0);

export function toSeries(snapshots) {
  const labels = snapshots.map(s => s.dateYmd);

  const mtdPayments   = snapshots.map(s => money(s.metrics?.payments_received_mtd));
  const expectedThisM = snapshots.map(s => money(s.metrics?.expected_payments_month));
  const pctRecovered  = snapshots.map(s => pct(s.metrics?.mtd_pct_past_due_recovered));
  const recoveredCnt  = snapshots.map(s => Number(s.metrics?.clients_recovered_from_pd || 0));

  return {
    labels,
    series: {
      mtdPayments,
      expectedThisM,
      pctRecovered,
      recoveredCnt,
    }
  };
}