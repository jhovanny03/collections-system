import { allocationForMonth, clientPosition } from "./ledger";
import { withMyCasePayments } from "./mycaseOverlay";

const base = {
  status: "active",
  invoiceTotal: 7000,
  initialPaymentAmount: 1000,
  initialPaymentDate: "2026-07-01",
  firstInstallmentDate: "2026-08-15",
  installmentSchedule: [{ amount: 500, start: "2026-08-01", end: "2046-08-01" }],
};
const nov20 = new Date(2026, 10, 20, 12);

describe("payment allocation", () => {
  test("each month lists the payments that paid it, oldest month first", () => {
    // Aug paid on time; nothing in Sep; Oct 20 $500 pays Sep; Nov 16 $700 pays Oct + $200 of Nov.
    const c = { ...base, payments: [{ date: "2026-08-15", amount: 500 }, { date: "2026-10-20", amount: 500 }, { date: "2026-11-16", amount: 700, recordedBy: "Miguel" }] };
    const [sep] = allocationForMonth(c, "2026-09", nov20);
    expect(sep.paid).toBe(500);
    expect(sep.pieces.map((p) => p.date.getMonth())).toEqual([9]); // paid in October
    const [oct] = allocationForMonth(c, "2026-10", nov20);
    expect(oct.paid).toBe(500);
    const [nov] = allocationForMonth(c, "2026-11", nov20);
    expect(nov.paid).toBe(200);
    expect(nov.pieces).toEqual([expect.objectContaining({ amount: 200, by: "Miguel" })]);
  });
});

describe("hand-entered clients count MyCase payments, not typed ones", () => {
  const rec = (id, date, amount, role = null) => ({ id, date, amount, invoiceId: "9", role });
  test("MyCase list replaces typed payments; consultation fee left out; IP pays the initial", () => {
    const c = {
      ...base,
      myCaseLink: "https://x.mycase.com/court_cases/123",
      payments: [{ date: "2026-08-15", amount: 9999 }], // typed: ignored
      mycaseReceived: [rec("c", "2026-06-20", 150, "other"), rec("i", "2026-07-01", 1000, "initial"), rec("a", "2026-08-15", 500), rec("b", "2026-09-15", 500), rec("d", "2026-10-15", 500), rec("e", "2026-11-16", 500)],
    };
    const v = withMyCasePayments(c);
    expect(v.payments.map((p) => p.amount)).toEqual([1000, 500, 500, 500, 500]);
    expect(v.typedPayments).toHaveLength(1);
    expect(clientPosition(v, nov20).owedNow).toBe(0);
  });
  test("this month's live MyCase rows count before the sync stores them", () => {
    const c = { ...base, myCaseLink: "https://x.mycase.com/court_cases/123", payments: [], mycaseReceived: [rec("a", "2026-08-15", 500)] };
    const v = withMyCasePayments(c, [{ id: "z", date: "2026-11-16", amount: 500, status: "success", type: "PURCHASE" }, { id: "y", date: "2026-11-17", amount: 500, status: "error" }]);
    expect(v.payments.map((p) => p.paymentId)).toEqual(["mycase_a", "mycase_z"]);
  });
  test("rebuilt clients, and hand-entered clients with no case link or no list, are unchanged", () => {
    const typed = { ...base, payments: [{ date: "2026-08-15", amount: 500 }] };
    expect(withMyCasePayments({ ...typed, invoiceRoles: { 9: "installment" }, myCaseLink: "https://x/court_cases/1", mycaseReceived: [] })).toEqual({ ...typed, invoiceRoles: { 9: "installment" }, myCaseLink: "https://x/court_cases/1", mycaseReceived: [] });
    expect(withMyCasePayments({ ...typed, mycaseReceived: [] }).payments).toEqual(typed.payments);
    expect(withMyCasePayments({ ...typed, myCaseLink: "https://x/court_cases/1" }).payments).toEqual(typed.payments);
  });
});
