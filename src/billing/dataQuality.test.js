import { steadyPayment, planEndedReason, expectedAmount, confirmedEntry, servicesMissingPlan } from "./dataQuality";
import { clientPosition } from "./ledger";

const nov20 = new Date(2026, 10, 20, 12);
const base = {
  status: "active",
  invoiceTotal: 13000,
  initialPaymentAmount: 1000,
  initialPaymentDate: "2026-01-01",
  firstInstallmentDate: "2026-02-15",
  installmentSchedule: [{ amount: 350, start: "2026-02-15", end: "2026-03-15" }],
};
const pays = (months, amount) => months.map((m) => ({ date: `2026-${m}-16`, amount }));

describe("data quality", () => {
  test("$500 is expected once the schedule ends", () => {
    expect(expectedAmount(base, "2026-03")).toEqual({ amount: 350, isDefault: false });
    expect(expectedAmount(base, "2026-11")).toEqual({ amount: 500, isDefault: true });
  });

  test("a steady $400 where $500 is expected is listed, starting where the run began", () => {
    const c = { ...base, payments: pays(["02", "03", "04", "05", "06", "07", "08", "09", "10", "11"], 400) };
    const s = steadyPayment(c, nov20);
    expect(s).toMatchObject({ amount: 400, expected: 500, fromYm: "2026-04" }); // after the schedule (Feb–Mar)
  });

  test("not listed: pays $500, too few payments, mixed amounts, already decided, two plans", () => {
    expect(steadyPayment({ ...base, payments: pays(["06", "07", "08", "09", "10", "11"], 500) }, nov20)).toBeNull();
    expect(steadyPayment({ ...base, payments: pays(["10", "11"], 400) }, nov20)).toBeNull();
    expect(steadyPayment({ ...base, payments: [...pays(["06", "08", "10"], 400), ...pays(["07", "09", "11"], 250)] }, nov20)).toBeNull();
    expect(steadyPayment({ ...base, dataQuality: { monthly: { keep: true } }, payments: pays(["06", "07", "08", "09", "10", "11"], 400) }, nov20)).toBeNull();
  });

  test("confirming the amount makes the plan expect it", () => {
    const c = { ...base, payments: pays(["02", "03", "04", "05", "06", "07", "08", "09", "10", "11"], 400) };
    const before = clientPosition(c, nov20).owedNow;
    const fixed = { ...c, installmentSchedule: [...c.installmentSchedule, confirmedEntry(400, "2026-04", "Miguel")] };
    expect(before).toBeGreaterThan(0);
    expect(clientPosition(fixed, nov20).owedNow).toBe(0);
    expect(steadyPayment(fixed, nov20)).toBeNull();
  });

  test("an additional service with its initial tagged but no monthly plan yet", () => {
    const c = { invoiceRoles: { 1: "initial", 2: "installment", 9: "initial" }, invoiceServices: { 9: "Removal defense" }, plans: [{ invoiceId: "2" }] };
    expect(servicesMissingPlan(c)).toEqual(["Removal defense"]);
    expect(servicesMissingPlan({ ...c, plans: [...c.plans, { invoiceId: "10", service: "Removal defense" }] })).toEqual([]);
    expect(servicesMissingPlan({ invoiceRoles: { 1: "initial" }, invoiceServices: { 1: "Main case" } })).toEqual([]);
  });

  test("why a plan ended owing", () => {
    expect(planEndedReason({ ...base, payments: pays(["02", "03"], 350) }, nov20)).toBe("quiet");
    expect(planEndedReason({ ...base, payments: pays(["10", "11"], 500) }, nov20)).toBe("default");
  });
});
