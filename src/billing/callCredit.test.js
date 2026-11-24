import { callsByClient, creditFor, creditTotals } from "./callCredit";

const call = (at, by, connected = true, clientIds = ["c1"]) => ({ at, by, connected, clientIds, direction: "outbound" });
const calls = callsByClient([
  call("2026-11-17T15:00:00Z", "Miguel Cañas"),
  call("2026-11-19T15:00:00Z", "David Cuellar"),
  call("2026-11-20T15:00:00Z", "Arianna Orantes", false), // no answer: never credited
]);

describe("payment after a call", () => {
  test("credited to the most recent call that reached the client, up to 3 days before", () => {
    expect(creditFor({ clientId: "c1", date: "2026-11-20", amount: 500 }, calls)).toMatchObject({ by: "David Cuellar", daysBefore: 1 });
    expect(creditFor({ clientId: "c1", date: "2026-11-19", amount: 500 }, calls)).toMatchObject({ by: "David Cuellar", daysBefore: 0 });
    expect(creditFor({ clientId: "c1", date: "2026-11-18", amount: 500 }, calls)).toMatchObject({ by: "Miguel Cañas", daysBefore: 1 });
  });
  test("not credited: more than 3 days after, a call after the payment, initial payments, other clients", () => {
    expect(creditFor({ clientId: "c1", date: "2026-11-23", amount: 500 }, calls)).toBeNull(); // last talk Nov 19: 4 days
    expect(creditFor({ clientId: "c1", date: "2026-11-16", amount: 500 }, calls)).toBeNull();
    expect(creditFor({ clientId: "c1", date: "2026-11-20", amount: 4500, initial: true }, calls)).toBeNull();
    expect(creditFor({ clientId: "c2", date: "2026-11-20", amount: 500 }, calls)).toBeNull();
  });
  test("totals per person", () => {
    const t = creditTotals([{ clientId: "c1", date: "2026-11-18", amount: 500 }, { clientId: "c1", date: "2026-11-20", amount: 350 }], calls);
    expect(t.get("Miguel Cañas")).toMatchObject({ count: 1, amount: 500 });
    expect(t.get("David Cuellar")).toMatchObject({ count: 1, amount: 350 });
  });
});
