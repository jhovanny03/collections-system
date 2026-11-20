import { clientPosition, monthDueCollected } from "./ledger";

// $500/month from Aug 2026, $6,000 to collect after a $1,000 initial payment.
const base = {
  status: "active",
  invoiceTotal: 7000,
  initialPaymentAmount: 1000,
  initialPaymentDate: "2026-07-01",
  firstInstallmentDate: "2026-08-15",
  installmentSchedule: [{ amount: 500, start: "2026-08-01", end: "2046-08-01" }],
};
const pay = (date, amount) => ({ date, amount });
const nov20 = new Date(2026, 10, 20, 12);

describe("installment ledger", () => {
  test("partial payments count: $450 of $500 leaves $50", () => {
    const c = { ...base, payments: [pay("2026-08-15", 500), pay("2026-09-15", 500), pay("2026-10-15", 500), pay("2026-11-16", 450)] };
    const p = clientPosition(c, nov20);
    expect(p.thisMonth).toBe(50);
    expect(p.pastDue).toBe(0);
    expect(p.owedNow).toBe(50);
    expect(p.balance).toBe(6000 - 1950);
  });

  test("past due this month vs owed now", () => {
    // Paid Aug only: Sep and Oct are earlier months, Nov is this month.
    const c = { ...base, payments: [pay("2026-08-15", 500)] };
    const p = clientPosition(c, nov20);
    expect(p.pastDue).toBe(1000);
    expect(p.thisMonth).toBe(500);
    expect(p.owedNow).toBe(1500);
    expect(p.monthsBehind).toBe(3);
  });

  test("before the 15th, this month is not due yet", () => {
    const c = { ...base, payments: [pay("2026-08-15", 500), pay("2026-09-15", 500), pay("2026-10-15", 500)] };
    expect(clientPosition(c, new Date(2026, 10, 10, 12)).owedNow).toBe(0);
  });

  test("plan ended: last installment is the remainder, and the rest is owed", () => {
    const c = { ...base, invoiceTotal: 2200, payments: [pay("2026-08-15", 500)] }; // $1,200: Aug 500, Sep 500, Oct 200
    const p = clientPosition(c, nov20);
    expect(p.owedNow).toBe(700);
    expect(p.thisMonth).toBe(0);
    expect(p.planEnded).toBe(true);
  });
});

describe("due vs collected per month (roll-over)", () => {
  test("a client who owed September is not expected for October", () => {
    const c = { ...base, payments: [pay("2026-08-15", 500)] };
    const oct = monthDueCollected(c, "2026-10", new Date(2026, 9, 31, 23));
    expect(oct.due).toBe(0);
  });

  test("once they pay September during October, October counts as due", () => {
    const c = { ...base, payments: [pay("2026-08-15", 500), pay("2026-10-20", 500)] }; // the Oct 20 payment covers Sep
    const oct = monthDueCollected(c, "2026-10", new Date(2026, 9, 31, 23));
    expect(oct.due).toBe(500);
    expect(oct.collected).toBe(0);
    // paying again in October covers October too
    const c2 = { ...c, payments: [...c.payments, pay("2026-10-28", 500)] };
    expect(monthDueCollected(c2, "2026-10", new Date(2026, 9, 31, 23))).toEqual({ due: 500, collected: 500, clients: 1 });
  });

  test("a client current into the month is due that month", () => {
    const c = { ...base, payments: [pay("2026-08-15", 500), pay("2026-09-15", 500)] };
    expect(monthDueCollected(c, "2026-10", new Date(2026, 9, 31, 23))).toEqual({ due: 500, collected: 0, clients: 1 });
  });
});

describe("aging buckets (from the 1st of the month)", () => {
  const { agingOf } = require("./ledger");
  test("this month's installment is 0-30 even before the 15th", () => {
    const c = { ...base, payments: [pay("2026-08-15", 500), pay("2026-09-15", 500), pay("2026-10-15", 500)] };
    expect(agingOf(c, new Date(2026, 10, 5, 12))).toEqual({ b0: 500, b30: 0, b60: 0, b90: 0, total: 500 });
  });
  test("older months move to 31-60, 61-90, 90+", () => {
    // Plan from Aug; nothing paid. Nov 20: Nov 0-30, Oct 31-60, Sep 61-90, Aug 90+.
    expect(agingOf({ ...base, payments: [] }, nov20)).toEqual({ b0: 500, b30: 500, b60: 500, b90: 500, total: 2000 });
  });
  test("paid in full: nothing owed", () => {
    const c = { ...base, payments: [pay("2026-08-01", 6000)] };
    expect(agingOf(c, nov20).total).toBe(0);
  });
});

describe("plan projection", () => {
  const { planProjection } = require("./ledger");
  test("end month and what each future month still needs", () => {
    // $6,000 at $500 from Aug 2026 -> last installment Jul 2027. Paid Aug-Nov (+ $200 ahead).
    const c = { ...base, payments: ["08", "09", "10", "11"].map((m) => pay(`2026-${m}-15`, 500)).concat([pay("2026-11-16", 200)]) };
    const p = planProjection(c, nov20);
    expect(p.endYm).toBe("2027-07");
    expect(p.monthsLeft).toBe(8);
    expect(p.future["2026-12"]).toBe(300); // $200 paid ahead
    expect(p.future["2027-01"]).toBe(500);
    expect(p.scheduledLeft).toBe(6000 - 2200);
  });
  test("paused or closed: nothing scheduled", () => {
    expect(planProjection({ ...base, status: "paused", payments: [] }, nov20).monthsLeft).toBe(0);
  });
});
