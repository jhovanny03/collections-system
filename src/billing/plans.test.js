// Run: CI=true npx react-scripts test --watchAll=false src/billing
import {
  planViews, mergeSnapshots, withPlans, isMultiPlan, planIndexForPayment, withMonthlyChange, monthlyOn,
  withAdjustment, withoutAdjustment, planSchedule, describeSchedule, managedPlanIds, planUpdates,
} from "./plans";
import { computeBillingSnapshot } from "../Reports/utils/billingCompute";

const single = {
  id: "s1", status: "active", invoiceTotal: 6000, initialPaymentAmount: 1500, initialPaymentDate: "2026-01-03",
  firstInstallmentDate: "2026-02-15", installmentAmount: 500,
  payments: [
    { amount: 1500, date: "2026-01-03", kind: "initial" },
    { amount: 500, date: "2026-02-15" },
    { amount: 500, date: "2026-03-15" },
  ],
};

// Main plan (#602, $4,500 at $500 from Feb) + removal defense (#902, $3,000 at $300 from Jun).
// The main plan's $500 is in its schedule, as Case Setup now writes it.
const multi = {
  ...single,
  id: "m1",
  installmentSchedule: [{ amount: 500, start: "2026-02-01", end: "2046-02-01", note: "" }],
  invoiceRoles: { 601: "initial", 602: "installment", 902: "installment" },
  plans: [
    { invoiceId: "902", invoiceNumber: "902", total: 3000, monthlyAmount: 300, startDate: "2026-06-15" },
    { invoiceId: "602", invoiceNumber: "602", total: 4500, monthlyAmount: 500, startDate: "2026-02-15" },
  ],
  payments: [
    { amount: 1500, date: "2026-01-03", kind: "initial", invoiceId: "601" },
    { amount: 500, date: "2026-02-15", invoiceId: "602" },
    { amount: 500, date: "2026-03-15", invoiceId: "602" },
    { amount: 300, date: "2026-06-15", invoiceId: "902" },
    { amount: 200, date: "2026-04-01" }, // hand-entered, no invoice -> first plan
  ],
};

const asOf = new Date(2026, 6, 20); // 20 Jul 2026

describe("planViews", () => {
  test("single-plan and legacy clients are returned untouched", () => {
    expect(planViews(single)).toEqual([single]);
    expect(planViews(single)[0]).toBe(single);
    const onePlan = { ...single, plans: [{ invoiceId: "602", total: 4500, monthlyAmount: 500, startDate: "2026-02-15" }] };
    expect(planViews(onePlan)[0]).toBe(onePlan);
    expect(isMultiPlan(single)).toBe(false);
    expect(isMultiPlan(multi)).toBe(true);
  });

  test("splits payments by invoice; first plan keeps the legacy fields", () => {
    const [main, rd] = planViews(multi);
    expect(main.planInvoiceId).toBe("602"); // earliest start first, regardless of stored order
    expect(main.invoiceTotal).toBe(6000);
    expect(main.initialPaymentAmount).toBe(1500);
    expect(main.payments.map((p) => p.amount)).toEqual([1500, 500, 500, 200]);
    expect(rd.planInvoiceId).toBe("902");
    expect(rd.invoiceTotal).toBe(3000);
    expect(rd.initialPaymentAmount).toBe(0);
    expect(rd.initialPaymentDate).toBe("1900-01-01");
    expect(rd.firstInstallmentDate).toBe("2026-06-15");
    expect(rd.installmentAmount).toBe(300);
    expect(rd.installmentSchedule).toEqual([
      { amount: 300, start: "2026-06-01", end: "2046-06-01", note: "Plan for MyCase invoice 902" },
    ]);
    expect(rd.payments.map((p) => p.amount)).toEqual([300]);
    expect(rd.paymentPromise).toBeNull();
    expect(rd.invoiceAdjustments).toEqual([]);
    // Views are single-plan, so plan-aware code never splits them again.
    expect(isMultiPlan(main)).toBe(false);
    expect(isMultiPlan(rd)).toBe(false);
  });

  test("initial payments always belong to the first plan", () => {
    const plans = [{ invoiceId: "602" }, { invoiceId: "902" }];
    expect(planIndexForPayment({ kind: "initial", invoiceId: "902" }, plans)).toBe(0);
    expect(planIndexForPayment({ invoiceId: "902" }, plans)).toBe(1);
    expect(planIndexForPayment({}, plans)).toBe(0);
  });
});

describe("mergeSnapshots", () => {
  test("adds amounts, keeps the worst months and status, earliest oldest-unpaid", () => {
    const a = { amountDue: 500, missedMonths: 1, remainingBalance: 2000, status: "active", isPaidInFull: false,
      oldestUnpaidDueDate: "2026-06-15", lastPayment: { date: "2026-03-15", amount: 500 }, label: "30 days" };
    const b = { amountDue: 600, missedMonths: 2, remainingBalance: 2700, status: "active", isPaidInFull: false,
      oldestUnpaidDueDate: "2026-06-15", lastPayment: { date: "2026-06-15", amount: 300 }, label: "60 days" };
    const m = mergeSnapshots([a, b]);
    expect(m.amountDue).toBe(1100);
    expect(m.remainingBalance).toBe(4700);
    expect(m.missedMonths).toBe(2);
    expect(m.label).toBe("60 days");
    expect(m.isPaidInFull).toBe(false);
    expect(m.oldestUnpaidDueDate).toBe("2026-06-15");
    expect(m.lastPayment).toEqual({ date: "2026-06-15", amount: 300 });
    expect(mergeSnapshots([{ isPaidInFull: true }, { isPaidInFull: false }]).isPaidInFull).toBe(false);
    expect(mergeSnapshots([{ isPaidInFull: true }, { isPaidInFull: true }]).isPaidInFull).toBe(true);
    expect(mergeSnapshots([{ isPastDue: false }, { isPastDue: true }]).isPastDue).toBe(true);
  });
});

describe("withPlans + the real AR snapshot", () => {
  test("single-plan clients get exactly the old result", () => {
    expect(withPlans(single, (c) => computeBillingSnapshot(c, asOf))).toEqual(computeBillingSnapshot(single, asOf));
  });

  test("two plans: each plan judged on its own, then combined", () => {
    const [main, rd] = planViews(multi);
    const sMain = computeBillingSnapshot(main, asOf);
    const sRd = computeBillingSnapshot(rd, asOf);
    const both = withPlans(multi, (c) => computeBillingSnapshot(c, asOf));
    expect(both.amountDue).toBeCloseTo(sMain.amountDue + sRd.amountDue);
    expect(both.remainingBalance).toBeCloseTo(sMain.remainingBalance + sRd.remainingBalance);
    expect(both.missedMonths).toBe(Math.max(sMain.missedMonths, sRd.missedMonths));
    // The removal-defense plan started in June at $300; one payment made, so July is due.
    expect(sRd.amountDue).toBe(300);
    // Payments to the second plan no longer prop up the first plan.
    const lumped = computeBillingSnapshot({ ...multi, plans: undefined }, asOf);
    expect(sMain.amountDue).toBeGreaterThanOrEqual(lumped.amountDue);
  });
});

describe("plan adjustments", () => {
  const rdPlan = multi.plans[0]; // #902, $300 from June 2026, total $3,000

  test("from a month on: new amount from that month, earlier months keep the old one", () => {
    const changed = withMonthlyChange(rdPlan, { amount: 150, effectiveMonth: "2026-08", note: "hardship" });
    expect(planSchedule(changed).map((e) => [e.amount, e.start, e.end])).toEqual([
      [300, "2026-06-01", "2026-07-31"],
      [150, "2026-08-01", "2046-06-01"],
    ]);
    expect(monthlyOn(planSchedule(changed), new Date(2026, 6, 20))).toBe(300);
    expect(monthlyOn(planSchedule(changed), new Date(2026, 8, 20))).toBe(150);
    const again = withMonthlyChange(changed, { amount: 200, effectiveMonth: "2026-11" });
    expect(planSchedule(again).map((e) => e.amount)).toEqual([300, 150, 200]);
    // A later adjustment for the same months replaces the earlier one.
    expect(planSchedule(withMonthlyChange(again, { amount: 175, effectiveMonth: "2026-11" })).map((e) => e.amount)).toEqual([300, 150, 175]);
  });

  test("for N months: $350 the first month, $1,000 for 6 months, normal amount otherwise", () => {
    const main = { invoiceId: "602", invoiceNumber: "602", total: 14500, monthlyAmount: 500, startDate: "2026-12-15" };
    const p = withAdjustment(withAdjustment(main, { amount: 350, start: "2026-12", months: 1 }), { amount: 1000, start: "2027-03", months: 6 });
    expect(planSchedule(p).map((e) => [e.amount, e.start, e.end])).toEqual([
      [350, "2026-12-01", "2026-12-31"],
      [500, "2027-01-01", "2027-02-28"],
      [1000, "2027-03-01", "2027-08-31"],
      [500, "2027-09-01", "2046-12-01"],
    ]);
    expect(describeSchedule(planSchedule(p))).toMatch(/^\$350 .*2026 · \$500 .*–.* · \$1,000 .*–.* · \$500 from .*2027$/);
    // Removing an adjustment brings the normal amount back for those months.
    expect(planSchedule(withoutAdjustment(p, 1)).map((e) => e.amount)).toEqual([350, 500]);
  });

  test("past-due math follows the adjustments, month by month", () => {
    const adjusted = withAdjustment(rdPlan, { amount: 100, start: "2026-07", months: 2 }); // Jul + Aug at $100
    const client = { ...multi, plans: [adjusted, multi.plans[1]] };
    const rd = planViews(client)[1];
    // 20 Jul: June paid ($300); July due at $100.
    expect(computeBillingSnapshot(rd, asOf).amountDue).toBe(100);
    // 20 Sep: July $100 + August $100 + September back to $300.
    expect(computeBillingSnapshot(rd, new Date(2026, 8, 20)).amountDue).toBe(500);
    // The main plan is untouched.
    expect(computeBillingSnapshot(planViews(client)[0], asOf)).toEqual(computeBillingSnapshot(planViews(multi)[0], asOf));
  });

  test("a client from MyCase: the main plan's adjustments reach the schedule every report reads", () => {
    const fromMyCase = { ...multi, source: "mycase" };
    expect(managedPlanIds(fromMyCase)).toEqual(["602", "902"]);
    expect(managedPlanIds(multi)).toEqual(["902"]); // older client: main plan stays in Installment Settings
    const main = withAdjustment(multi.plans[1], { amount: 350, start: "2026-02", months: 1 });
    const upd = planUpdates(fromMyCase, [multi.plans[0], main]);
    expect(upd.installmentSchedule.map((e) => e.amount)).toEqual([350, 500]);
    expect(planUpdates(multi, [multi.plans[0], main]).installmentSchedule).toBeUndefined();
  });

  test("refuses what billing must fix", () => {
    expect(() => withMonthlyChange(rdPlan, { amount: 0, effectiveMonth: "2026-08" })).toThrow(/adjusted monthly amount/);
    expect(() => withMonthlyChange(rdPlan, { amount: 5000, effectiveMonth: "2026-08" })).toThrow(/more than the plan total/);
    expect(() => withMonthlyChange(rdPlan, { amount: 100, effectiveMonth: "" })).toThrow(/month/);
    expect(() => withAdjustment(rdPlan, { amount: 100, start: "2026-01", months: 2 })).toThrow(/before the plan/);
    expect(() => withAdjustment(rdPlan, { amount: 100, start: "2026-08", months: 0 })).toThrow(/how many months/);
  });
});
