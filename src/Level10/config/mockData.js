export const MOCK_MONTH = "2025-10";
export const MOCK_WEEKS = [
  { key: "2025-10-06", label: "6-Oct" },
  { key: "2025-10-13", label: "13-Oct" },
  { key: "2025-10-20", label: "20-Oct" },
  { key: "2025-10-27", label: "27-Oct" },
];

// week arrays are [w1,w2,w3,w4] for October 2025
export const MOCK_VALUES = {
  // Overall
  total_cases_in_plans: [305, 308, 310, 312],
  num_in_autopay: [210, 214, 215, 220],
  pct_in_autopay: [69, 70, 69, 71],
  num_in_manual: [95, 94, 95, 92],
  pct_in_manual: [31, 30, 31, 29],
  cases_current: [180, 190, 195, 198],
  cases_past_due: [125, 118, 115, 114],
  cases_lt_60_pd: [90, 86, 88, 85],
  cases_gt_60_pd: [35, 32, 27, 29],
  paused_active: [4, 5, 4, 3],
  welcome_calls_completed: [14, 19, 5, 9],
  autopay_enrollment_rate: [93, 90, 100, 90],

  // Payment Recovery
  payments_received: [15100, 56800, 393900, 54790],
  mtd_payments_received: [30550, 87350, 480250, 535040],
  autopay_collection_rate: [34.58, 34.58, 34.58, 34.58],
  pct_30_60_pd: [7.29, 5.76, 20.72, 15.80],
  pct_60_90_pd: [12.04, 10.84, 12.99, 12.20],
  pct_90_plus_pd: [6.42, 6.36, 6.50, 6.40],
  pd_recovery_30_plus: [18034, 20500, 16890, 46350],
  mtd_pct_pd_recovered: [7.46, 13.20, 18.80, 21.44],
  clients_recovered: [31, 31, 29, 84],
  total_outstanding_ar: [674475, 617675, 782035, 673455],

  // Termination Process
  paused_clients: [4, 1, 5, 3],
  ytd_paused_clients: [98, 94, 100, 104],
  warning_letters: [1, 0, 1, 1],
  terminations_finalized: [5, 5, 6, 4],
  refunds_issued: [9460, 8540, 11365, 4540],
  ytd_refunds: [195533, 204073, 215898, 220438],
};