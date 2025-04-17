// billingUtils.js

/**
 * Calculates missed installment months based on expected schedule and actual payments.
 * @param {string} startDateString - The date (YYYY-MM-DD) when installments started.
 * @param {Array} payments - List of payment objects with { amount, date }.
 * @param {number} monthlyAmount - Expected monthly payment amount.
 * @returns {Array} - Array of missed months as 'Month YYYY'.
 */
export function getMissedInstallments(startDateString, payments = [], monthlyAmount = 500) {
    if (!startDateString) return [];
  
    const startDate = new Date(startDateString);
    const today = new Date();
  
    // Generate list of due dates from start date to today
    const dueDates = [];
    const current = new Date(startDate);
  
    while (current < today) {
      dueDates.push(new Date(current));
      current.setMonth(current.getMonth() + 1);
    }
  
    // Track how many full payments have been made
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const fullPaymentsMade = Math.floor(totalPaid / monthlyAmount);
  
    // Determine missed months
    const missedMonths = dueDates.slice(fullPaymentsMade).map(date =>
      date.toLocaleString('default', { month: 'long', year: 'numeric' })
    );
  
    return missedMonths;
  }
  