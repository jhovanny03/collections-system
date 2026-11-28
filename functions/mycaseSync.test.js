// Run: node --test functions/mycaseSync.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { defaultInvoiceRole, caseFlags, buildSetupClient, splitName, runAll, toMirrorDoc, mapCaseType, caseTypeFromMyCase, uninvoicedFee, intakeInvoice, shouldAutoCreate, buildIntakeClient, setupGroup, lastPaymentDate } = require("./mycaseSync");
const { plansWithNewInvoice, firstPlanFields, planViews } = require("./plans");
const { computeImport, classifyPayment } = require("./mycasePayments");

const inv = (o) => ({ id: "1", caseId: "500", number: "#1", description: "", status: "sent", invoiceDate: "2026-01-02", dueDate: "2026-02-15", total: 3000, paid: 0, balance: 3000, ...o });

test("defaultInvoiceRole: IP -> initial, $150 -> other, else billing decides", () => {
  assert.equal(defaultInvoiceRole(inv({ description: "IP" })), "initial");
  assert.equal(defaultInvoiceRole(inv({ description: "ip - retainer" })), "initial");
  assert.equal(defaultInvoiceRole(inv({ description: "Initial payment" })), "initial");
  assert.equal(defaultInvoiceRole(inv({ total: 150 })), "other");
  assert.equal(defaultInvoiceRole(inv({ description: "Monthly payments" })), "installment");
  assert.equal(defaultInvoiceRole(inv({ description: "" })), null);
  assert.equal(defaultInvoiceRole(inv({ description: "SHIP fee" })), null); // "IP" must be a word at the start
});

test("caseFlags: needs setup only when open, owing, and untracked", () => {
  const open = { status: "open" };
  assert.equal(caseFlags(open, [inv({ paid: 1000 })]).needsSetup, true);
  assert.equal(caseFlags(open, [inv({ paid: 1000 })]).openBalance, 2000);
  assert.equal(caseFlags({ status: "closed" }, [inv()]).needsSetup, false);
  assert.equal(caseFlags(open, [inv({ paid: 3000 })]).needsSetup, false);
  assert.equal(caseFlags(open, [inv({ status: "draft" })]).needsSetup, false); // drafts owe nothing yet
  const tracked = caseFlags(open, [inv()], ["c1"]);
  assert.deepEqual({ needsSetup: tracked.needsSetup, trackedClientId: tracked.trackedClientId }, { needsSetup: false, trackedClientId: "c1" });
  assert.equal(caseFlags(open, [inv()], ["c1", "c2"]).trackedClientId, "multiple");
});

test("splitName", () => {
  assert.deepEqual(splitName("Ana Maria Diaz"), { firstName: "Ana Maria", lastName: "Diaz" });
  assert.deepEqual(splitName("Cher"), { firstName: "Cher", lastName: "" });
  assert.deepEqual(splitName(undefined), { firstName: "", lastName: "" });
});

const caseDoc = { id: "500", name: "Diaz - VAWA", status: "open", practiceArea: "VAWA Spouse", clientNames: ["Ana Diaz"] };
const invoices = [
  inv({ id: "10", number: "#10", description: "IP", total: 1500, paid: 1500, invoiceDate: "2026-01-02" }),
  inv({ id: "20", number: "#20", total: 4500, paid: 500, dueDate: "2026-02-15" }),
  inv({ id: "30", number: "#30", total: 150, paid: 150 }),
  inv({ id: "40", number: "#40", status: "draft", total: 999 }),
];
const roles = { 10: "initial", 20: "installment", 30: "other" };
const mpay = (o) => ({ status: "success", amount: 500, ...o });

test("buildSetupClient: fills the fields every existing page reads", () => {
  const doc = buildSetupClient({
    caseDoc, invoices, roles, by: "billing@x.test", now: new Date("2026-03-01T12:00:00Z"),
    plans: [{ invoiceId: "20", monthlyAmount: 500 }],
    payments: [mpay({ invoiceId: "10", amount: 1000, date: "2026-01-03" }), mpay({ invoiceId: "10", date: "2026-01-10" })],
  });
  assert.equal(doc.firstName, "ANA"); assert.equal(doc.lastName, "DIAZ"); // capitals, as the team types them
  assert.equal(doc.caseType, "VAWA SPOUSE");
  assert.equal(doc.myCaseLink, "https://law-firm-of-moumita-rahman-pllc.mycase.com/court_cases/500");
  assert.equal(doc.invoiceTotal, 6000); // IP + installment invoice, not the $150 fee
  assert.equal(doc.initialPaymentAmount, 1500);
  assert.equal(doc.initialPaymentDate, "2026-01-10"); // last IP payment, so it never counts as an installment
  assert.equal(doc.firstInstallmentDate, "2026-02-15"); // defaults to the invoice due date
  assert.equal(doc.installmentAmount, 500);
  assert.deepEqual(doc.invoiceRoles, { 10: "initial", 20: "installment", 30: "other" }); // draft #40 not required
  assert.equal(doc.plans.length, 1);
  assert.deepEqual(doc.payments, []);
  assert.equal(doc.status, "active");
});

test("buildSetupClient: two plans; earliest drives the legacy fields", () => {
  const two = [...invoices, inv({ id: "50", number: "#50", total: 3000, dueDate: "2026-06-15" })];
  const doc = buildSetupClient({
    caseDoc, invoices: two, roles: { ...roles, 50: "installment" },
    plans: [{ invoiceId: "50", monthlyAmount: 300 }, { invoiceId: "20", monthlyAmount: 500, startDate: "2026-03-15" }],
  });
  assert.deepEqual(doc.plans.map((p) => p.invoiceId), ["20", "50"]);
  assert.equal(doc.firstInstallmentDate, "2026-03-15");
  assert.equal(doc.installmentAmount, 500);
  assert.equal(doc.invoiceTotal, 1500 + 4500);
});

test("buildSetupClient: refuses incomplete setups with messages billing can act on", () => {
  assert.throws(() => buildSetupClient({ caseDoc, invoices, roles: { 10: "initial", 20: "installment" }, plans: [{ invoiceId: "20", monthlyAmount: 500 }] }), /Choose a type for invoice #30/);
  assert.throws(() => buildSetupClient({ caseDoc, invoices, roles: { ...roles, 20: "other" }, plans: [] }), /at least one invoice as the installment/);
  assert.throws(() => buildSetupClient({ caseDoc, invoices, roles, plans: [] }), /monthly amount for invoice #20/);
  assert.throws(() => buildSetupClient({ caseDoc, invoices, roles, plans: [{ invoiceId: "20", monthlyAmount: 9999 }] }), /more than the invoice total/);
  assert.throws(() => buildSetupClient({ caseDoc, invoices: [inv({ id: "20", dueDate: null })], roles: { 20: "installment" }, plans: [{ invoiceId: "20", monthlyAmount: 100 }] }), /start date/);
});

test("setup -> import: IP and installment payments land, the $150 fee does not", () => {
  const doc = buildSetupClient({ caseDoc, invoices, roles, plans: [{ invoiceId: "20", monthlyAmount: 500 }],
    payments: [mpay({ invoiceId: "10", amount: 1500, date: "2026-01-03" })] });
  const c = { id: "new", ...doc };
  const m = new Map([["500", [c]]]);
  const feed = (o) => ({ id: "p", status: "success", amount: "500.00", payment_date: "2026-02-15", case_id: "500", ...o });
  assert.equal(classifyPayment(feed({ invoice_id: "10" }), m).kind, "initial");
  assert.equal(classifyPayment(feed({ invoice_id: "30", amount: "150.00" }), m).reason, "other_invoice");
  const inst = classifyPayment(feed({ invoice_id: "20" }), m);
  const plan = computeImport(c, feed({ invoice_id: "20" }), new Date(), { kind: inst.kind });
  assert.equal(plan.allocationRows.length, 1);
  assert.equal(plan.allocationRows[0].dueMonthKey, "2026-02");
});

test("toMirrorDoc keeps ids as strings and amounts as numbers", () => {
  const p = toMirrorDoc("payments", { id: 7, case_id: 500, invoice_id: 20, amount: "500.00", payment_date: "2026-02-15", status: "success" });
  assert.equal(p.id, "7"); assert.equal(p.caseId, "500"); assert.equal(p.amount, 500); assert.equal(p.feed.id, 7);
  const i = toMirrorDoc("invoices", { id: 20, case_id: 500, total_amount: "4500.00", paid_amount: "500.00", balance: "4000.00" });
  assert.equal(i.total, 4500); assert.equal(i.balance, 4000);
});

test("runAll: cases and invoices mirrored, new case flagged, untracked payments mirrored not reviewed", async () => {
  const mirror = { cases: new Map(), invoices: new Map(), payments: new Map() };
  const cursors = {};
  const reviews = [];
  const store = {
    getCursor: async (k) => cursors[k] || null,
    saveCursor: async (c, k) => { cursors[k] = c; },
    upsertMirror: async (k, rows) => rows.forEach((r) => mirror[k].set(String(r.id), { ...(mirror[k].get(String(r.id)) || {}), ...toMirrorDoc(k, r) })),
    loadClientsByCaseId: async () => new Map(),
    refreshCases: async (ids) => {
      let n = 0;
      for (const id of ids) {
        const c = mirror.cases.get(id);
        if (!c) continue;
        const f = caseFlags(c, [...mirror.invoices.values()].filter((i) => i.caseId === id), []);
        Object.assign(c, f);
        if (f.needsSetup) n++;
      }
      return n;
    },
    importPayment: async () => "imported",
    addReview: async (p, r) => reviews.push(r),
  };
  const cur = (id) => ({ after_updated_at: "2026-01-01T00:00:00Z", after_id: id });
  const pages = {
    "/feed/cases": { cases: [{ id: "500", status: "open", name: "Diaz" }, { id: "501", status: "closed", name: "Old" }], next_cursor: cur("501"), has_more: false },
    "/feed/invoices": { invoices: [
      { id: "20", case_id: "500", status: "sent", total_amount: "4500", paid_amount: "0", balance: "4500" },
      { id: "21", case_id: "501", status: "overdue", total_amount: "100", paid_amount: "0", balance: "100" },
    ], next_cursor: cur("21"), has_more: false },
    "/feed/payments": { payments: [{ id: "9", case_id: "500", invoice_id: "20", status: "success", amount: "500.00", payment_date: "2026-02-15" }], next_cursor: cur("9"), has_more: false },
  };
  const fetchImpl = async (url) => ({ ok: true, status: 200, json: async () => pages[new URL(url).pathname] });
  const stats = await runAll({ store, baseUrl: "http://x", token: "t", fetchImpl, log: {} });
  assert.equal(stats.cases, 2);
  assert.equal(stats.invoices, 2);
  assert.equal(stats.needsSetup, 1);
  assert.equal(mirror.cases.get("500").needsSetup, true);
  assert.equal(mirror.cases.get("501").needsSetup, false); // closed, even though it owes
  assert.equal(mirror.payments.size, 1);
  assert.equal(stats.payments.ignored, 1);
  assert.equal(reviews.length, 0);
  assert.ok(cursors.cases && cursors.invoices && cursors.payments);
});

/* ------------------------- case types and intake cases ------------------------- */

test("mapCaseType: MyCase practice areas onto the app's list; unclear ones left blank", () => {
  assert.equal(mapCaseType("VAWA SPOUSE"), "VAWA SPOUSE");
  assert.equal(mapCaseType("VAWA"), "VAWA SPOUSE");
  assert.equal(mapCaseType("T-Visa- Labor"), "T VISA");
  assert.equal(mapCaseType("T-Visa- DV"), "T VISA");
  assert.equal(mapCaseType("I-751 ECB"), "I751 ECB");
  assert.equal(mapCaseType("I-751 Divorce Waiver"), "I751 REGULAR");
  assert.equal(mapCaseType("Marriage - AOS"), "MARRIAGE AOS");
  assert.equal(mapCaseType("VAWA Parent"), "PARENT VAWA");
  assert.equal(mapCaseType("N-400"), "N400");
  assert.equal(mapCaseType("Removal Defense"), "REMOVAL DEFENSE");
  for (const unclear of ["AOS", "NVC Processing", "-", "", null, "DACA"]) assert.equal(mapCaseType(unclear), "");
  assert.equal(caseTypeFromMyCase("T-Visa- Labor"), "T VISA"); // the app name when there is one
  assert.equal(caseTypeFromMyCase("AOS"), "AOS"); // else MyCase's own practice area
  assert.equal(caseTypeFromMyCase("NVC Processing"), "NVC PROCESSING");
  assert.equal(caseTypeFromMyCase("-"), "");
  assert.equal(caseTypeFromMyCase(null), ""); // set it in MyCase; the sync fills it in
});

test("buildSetupClient: case type comes from MyCase only", () => {
  const base = { caseDoc, invoices, roles, plans: [{ invoiceId: "20", monthlyAmount: 500 }] };
  assert.equal(buildSetupClient(base).caseType, "VAWA SPOUSE");
  assert.equal(buildSetupClient({ ...base, caseDoc: { ...caseDoc, practiceArea: "AOS" } }).caseType, "AOS");
  assert.equal(buildSetupClient({ ...base, caseDoc: { ...caseDoc, practiceArea: null } }).caseType, "");
  // Anything billing might send is ignored.
  assert.equal(buildSetupClient({ ...base, caseType: "U VISA" }).caseType, "VAWA SPOUSE");
});

test("flat fee: kept from MyCase; a new intake client owes the uninvoiced part too", () => {
  const k = toMirrorDoc("cases", { id: 51949961, name: "A (11-26) PARMANAN, OMATIE", status: "open", billing_type: "flat", outstanding_balance: "17500.00" });
  assert.equal(k.flatFee, 17500);
  assert.equal(toMirrorDoc("cases", { id: 1, billing_type: "hourly", outstanding_balance: "900" }).flatFee, null);
  const caseWithFee = { ...newCase, flatFee: 17500 };
  const ipPaid = { ...ip, total: 3000, paid: 3000 };
  assert.equal(uninvoicedFee(caseWithFee, [ipPaid]), 14500);
  assert.equal(uninvoicedFee(caseWithFee, [ipPaid, inv({ id: "72", total: 150 })]), 14500); // consultation fee aside
  assert.equal(uninvoicedFee(caseWithFee, [ipPaid, inv({ id: "73", total: 14500 })]), 0); // billing's monthly invoice
  assert.equal(uninvoicedFee({ ...newCase, flatFee: null }, [ipPaid]), 0);
  assert.equal(caseFlags(caseWithFee, [ipPaid], []).uninvoicedFee, 14500);

  const c = buildIntakeClient({ caseDoc: caseWithFee, invoices: [ipPaid], payments: [{ status: "success", amount: 3000, invoiceId: "71", date: "2026-11-17" }] });
  assert.deepEqual([c.invoiceTotal, c.initialPaymentAmount, c.mycaseFlatFee], [17500, 3000, 17500]);
  // No flat fee in MyCase: the intake invoice is the total, as before.
  assert.equal(buildIntakeClient({ caseDoc: newCase, invoices: [ipPaid], payments: [] }).invoiceTotal, 3000);
});

const newCase = { id: "777", name: "A (11-26) LOPEZ, MARIA (T-VISA - Labor)", status: "open", practiceArea: "T-Visa- Labor", openedDate: "2026-11-16", clientNames: ["Maria Lopez"] };
const ip = inv({ id: "71", caseId: "777", number: "#71", total: 1200, paid: 1200, balance: 0, invoiceDate: "2026-11-16", dueDate: "2026-11-16" });

test("intake: a new case with only its initial-payment invoice is created automatically", () => {
  assert.equal(intakeInvoice([ip]).id, "71");
  assert.equal(intakeInvoice([ip, inv({ id: "72", total: 150 })]).id, "71"); // consultation fee aside
  assert.equal(intakeInvoice([ip, inv({ id: "73", total: 4800 })]), null); // billing already added more
  assert.equal(intakeInvoice([inv({ description: "Monthly payments" })]), null);
  assert.equal(intakeInvoice([]), null);
  assert.equal(shouldAutoCreate(newCase, [ip]), true); // even though it is already paid in full
  assert.equal(shouldAutoCreate({ ...newCase, status: "closed" }, [ip]), false);
  assert.equal(shouldAutoCreate({ ...newCase, openedDate: "2025-03-01" }, [ip]), false); // old backlog stays on Case Setup

  const flags = caseFlags(newCase, [ip], []);
  assert.deepEqual({ autoCreate: flags.autoCreate, needsSetup: flags.needsSetup }, { autoCreate: true, needsSetup: false });
  assert.equal(caseFlags(newCase, [ip], [{ id: "mycase_777", awaitingPlan: true }]).needsPlan, true);
  assert.equal(caseFlags(newCase, [ip], [{ id: "mycase_777", awaitingPlan: false }]).needsPlan, false);
  assert.equal(caseFlags(newCase, [ip], ["mycase_777"]).autoCreate, false);
});

test("intake client: same fields as a hand-entered client, no plan yet", () => {
  const doc = buildIntakeClient({
    caseDoc: newCase, invoices: [ip], now: new Date("2026-11-16T15:00:00Z"),
    payments: [{ status: "success", amount: 1200, invoiceId: "71", date: "2026-11-16" }],
  });
  for (const k of ["firstName", "lastName", "myCaseLink", "caseType", "caseStatus", "status", "createdAt", "caseTitle", "payments",
    "invoiceUpdatedAt", "firstInstallmentDate", "initialPaymentDate", "invoiceUpdatedBy", "initialPaymentAmount", "invoiceTotal"]) {
    assert.ok(k in doc, `missing ${k}`);
  }
  assert.deepEqual([doc.firstName, doc.lastName, doc.caseType, doc.caseStatus, doc.status], ["MARIA", "LOPEZ", "T VISA", "ACTIVE", "active"]);
  assert.equal(doc.caseTitle, newCase.name);
  assert.equal(doc.myCaseLink, "https://law-firm-of-moumita-rahman-pllc.mycase.com/court_cases/777");
  assert.deepEqual([doc.invoiceTotal, doc.initialPaymentAmount, doc.initialPaymentDate], [1200, 1200, "2026-11-16"]);
  assert.equal(doc.firstInstallmentDate, null); // shown as current, nothing due, until billing adds the plan
  assert.deepEqual(doc.invoiceRoles, { 71: "initial" });
  assert.equal(doc.awaitingPlan, true);
});

test("intake client: IP payment counts; a payment on the later installment invoice waits for billing", () => {
  const client = { id: "mycase_777", ...buildIntakeClient({ caseDoc: newCase, invoices: [ip], payments: [] }) };
  const byCase = new Map([["777", [client]]]);
  const pay = (o) => ({ id: "p", status: "success", case_id: "777", amount: "1200.00", payment_date: "2026-11-16", ...o });
  assert.deepEqual((({ action, kind }) => ({ action, kind }))(classifyPayment(pay({ invoice_id: "71" }), byCase)), { action: "import", kind: "initial" });
  assert.equal(classifyPayment(pay({ invoice_id: "88", amount: "400.00" }), byCase).reason, "untagged_invoice");

  // Billing tags invoice 88 as Installment on MyCase Review: it becomes the first plan.
  const plans = plansWithNewInvoice(client, { id: "88", number: "#88", total: 4800, dueDate: "2026-12-15" }, { monthlyAmount: 400 });
  const after = { ...client, invoiceRoles: { ...client.invoiceRoles, 88: "installment" }, plans, ...firstPlanFields(client, plans[0]) };
  assert.deepEqual([after.invoiceTotal, after.firstInstallmentDate, after.installmentAmount, after.awaitingPlan], [6000, "2026-12-15", 400, false]);
  assert.equal(after.installmentSchedule[0].amount, 400);
  assert.equal(planViews(after).length, 1);
  const r = computeImport(after, pay({ invoice_id: "88", amount: "400.00", payment_date: "2026-12-15" }));
  assert.equal(r.allocationRows[0].dueMonthKey, "2026-12");
  assert.equal(r.allocationRows[0].allocationStatus, "paid");
  // A client that is not waiting for a plan still needs its main plan first.
  assert.throws(() => plansWithNewInvoice({ plans: [] }, { id: "88", total: 4800, dueDate: "2026-12-15" }, { monthlyAmount: 400 }), /main plan/);
});

test("Case Setup groups: potential clients and cases marked closed are set apart", () => {
  assert.equal(setupGroup({ name: "Potential Case: Ansolin Pyram" }), "potential");
  assert.equal(setupGroup({ name: "potential client: X" }), "potential");
  assert.equal(setupGroup({ name: "Case Evaluation: Y" }), "potential");
  assert.equal(setupGroup({ name: "CLOSED (03-24) DOE, JANE" }), "closed");
  assert.equal(setupGroup({ name: "[Closed] F (01-23) X" }), "closed");
  assert.equal(setupGroup({ name: "A (03-24) DOE, JANE", caseStage: "Closed" }), "closed");
  assert.equal(setupGroup({ name: "A (03-24) DOE, JANE", caseStage: "Approved" }), "client"); // approved still owes
  assert.equal(setupGroup({ name: "F (10-24) SMITH, JOHN (POTENTIAL RFE)" }), "client"); // only a leading prefix counts

  const pays = [{ status: "success", amount: 500, date: "2025-03-15" }, { status: "success", amount: 500, date: "2026-01-15" },
    { status: "failed", amount: 500, date: "2026-06-15" }, { status: "success", amount: -500, date: "2026-07-01" }];
  assert.equal(lastPaymentDate(pays), "2026-01-15");
  assert.equal(lastPaymentDate([]), null);
  const f = caseFlags({ id: "1", status: "open", name: "Potential Case: Z" }, [inv({ paid: 0 })], [], pays);
  assert.deepEqual([f.setupGroup, f.lastPaymentDate, f.needsSetup], ["potential", "2026-01-15", true]);
  assert.equal("lastPaymentDate" in caseFlags({ id: "1", status: "open" }, [inv()], []), false); // not looked up: left as stored
});

test("intake: a potential client's quote is never auto-created as a client", () => {
  const potential = { ...newCase, name: "Potential Case: Maria Lopez" };
  assert.equal(shouldAutoCreate(potential, [ip]), false);
  assert.equal(caseFlags(potential, [ip], []).autoCreate, false);
  assert.equal(shouldAutoCreate({ ...newCase, caseStage: "Closed" }, [ip]), false);
  assert.equal(shouldAutoCreate(newCase, [ip]), true); // once renamed, it is picked up
});

test("paid in full, no plan needed: a later installment invoice can still become the first plan", () => {
  const client = { id: "mycase_777", ...buildIntakeClient({ caseDoc: newCase, invoices: [ip], payments: [] }), awaitingPlan: false, noPlanNeeded: true };
  const plans = plansWithNewInvoice(client, { id: "88", number: "#88", total: 2400, dueDate: "2027-01-15" }, { monthlyAmount: 200 });
  const after = { ...client, plans, ...firstPlanFields(client, plans[0]) };
  assert.deepEqual([after.invoiceTotal, after.firstInstallmentDate, after.noPlanNeeded, after.awaitingPlan], [3600, "2027-01-15", false, false]);
});

test("Add plan with adjustments: $350 the first month, $1,000 for 6 months, $500 otherwise", () => {
  const doc = buildSetupClient({
    caseDoc, invoices, roles, by: "billing@x.test",
    plans: [{ invoiceId: "20", monthlyAmount: 500, startDate: "2026-02-15", adjustments: [
      { amount: 350, start: "2026-02", months: 1, note: "first month" },
      { amount: 1000, start: "2026-05", months: 6 },
    ] }],
    payments: [mpay({ invoiceId: "10", amount: 1500, date: "2026-01-10" })],
  });
  assert.deepEqual(doc.installmentSchedule.map((e) => [e.amount, e.start, e.end]), [
    [350, "2026-02-01", "2026-02-28"],
    [500, "2026-03-01", "2026-04-30"],
    [1000, "2026-05-01", "2026-10-31"],
    [500, "2026-11-01", "2046-02-01"],
  ]);
  assert.equal(doc.plans[0].adjustments.length, 2);
  assert.equal(doc.plans[0].adjustments[0].by, "billing@x.test");
  // A $350 payment in February pays February in full.
  const client = { id: "c", ...doc, payments: [{ amount: 1500, date: "2026-01-10", kind: "initial", invoiceId: "10" }] };
  const r = computeImport(client, { id: "p1", status: "success", amount: "350.00", payment_date: "2026-02-15", case_id: "500", invoice_id: "20" });
  assert.deepEqual([r.allocationRows[0].dueMonthKey, r.allocationRows[0].allocationStatus, r.allocationRows[0].expectedInstallmentAmount], ["2026-02", "paid", 350]);
  // Bad adjustments are refused with the invoice named.
  assert.throws(() => buildSetupClient({ caseDoc, invoices, roles, plans: [{ invoiceId: "20", monthlyAmount: 500, adjustments: [{ amount: 0, start: "2026-03" }] }] }), /Invoice #20: Enter the adjusted monthly amount/);
  assert.throws(() => buildSetupClient({ caseDoc, invoices, roles, plans: [{ invoiceId: "20", monthlyAmount: 500, adjustments: [{ amount: 300, start: "2025-12" }] }] }), /starts before the plan/);
  assert.throws(() => buildSetupClient({ caseDoc, invoices, roles, plans: [{ invoiceId: "20", monthlyAmount: 500, adjustments: [{ amount: 300, start: "2026-03", months: 0 }] }] }), /how many months/);
});

test("initial payment not completed: which invoice, and which group", () => {
  const { initialFlags } = require("./mycaseSync");
  const k = { status: "open", name: "A (11-26) DOE, JANE (T-VISA)" };
  const ip = { id: "1", status: "partial", total: 4500, paid: 2000, invoiceDate: "2026-11-01" };
  const plan = { id: "2", status: "sent", total: 6000, paid: 0, invoiceDate: "2026-11-05" };
  // Not in Collections, started paying the first invoice
  assert.equal(initialFlags(k, [ip, plan], null, null).initialState, "started");
  assert.equal(initialFlags(k, [ip, plan], null, null).initialDue, 2500);
  // Nothing paid yet
  assert.equal(initialFlags(k, [{ ...ip, paid: 0 }], null, null).initialState, "notStarted");
  // Rebuilt client: only the invoice tagged "initial" counts
  const rebuilt = { invoiceRoles: { 1: "initial", 2: "installment" } };
  assert.equal(initialFlags(k, [ip, plan], rebuilt, "c1").initialState, "client");
  assert.equal(initialFlags(k, [plan], { invoiceRoles: { 2: "installment" } }, "c1").initialState, null);
  // Hand-entered client: the invoice for exactly the initial amount
  assert.equal(initialFlags(k, [ip, plan], { initialPaymentAmount: 4500 }, "c1").initialInvoiceId, "1");
  // Paid in full, potential client, closed
  assert.equal(initialFlags(k, [{ ...ip, paid: 4500 }], null, null).initialState, null);
  assert.equal(initialFlags({ ...k, name: "Potential Case: Jane Doe" }, [ip], null, null).initialState, "potential");
  assert.equal(initialFlags({ ...k, status: "closed" }, [ip], null, null).initialState, null);
});

test("an initial payment split over two invoices is added up", () => {
  const { initialFlags } = require("./mycaseSync");
  const k = { status: "open", name: "A (11-25) DOE, JANE" };
  const a = { id: "1", status: "paid", total: 1350, paid: 1350, invoiceDate: "2025-11-07" };
  const b = { id: "2", status: "overdue", total: 3000, paid: 1500, invoiceDate: "2026-03-01" };
  const f = initialFlags(k, [a, b], { invoiceRoles: { 1: "initial", 2: "initial" } }, "c1");
  assert.equal(f.initialState, "client");
  assert.equal(f.initialTotal, 4350);
  assert.equal(f.initialPaid, 2850);
  assert.equal(f.initialDue, 1500);
  assert.equal(f.initialInvoiceId, "2");
});

test("a new intake case that paid its initial and has no plan invoice yet still needs setup", () => {
  const now = new Date(2026, 10, 27);
  const fresh = { id: "9", status: "open", name: "A (10-26) X, Y (T-VISA)", openedDate: "2026-10-01" };
  const ip = inv({ caseId: "9", total: 3000, paid: 3000, balance: 0 });
  const f = caseFlags(fresh, [ip], [], null, now);
  assert.equal(f.needsSetup, true);
  assert.equal(f.setupReason, "paidNoPlan");
  assert.equal(caseFlags({ ...fresh, openedDate: "2025-01-10" }, [ip], [], null, now).needsSetup, false); // old case: done, not new intake
  assert.equal(caseFlags(fresh, [ip], ["c1"], null, now).needsSetup, false); // already in Collections
  assert.equal(caseFlags({ ...fresh, name: "Potential Case: X" }, [ip], [], null, now).needsSetup, false);
  assert.equal(caseFlags(fresh, [inv({ caseId: "9", paid: 1000 })], [], null, now).setupReason, "unpaid");
  assert.equal(caseFlags(fresh, [inv({ caseId: "9", total: 150, paid: 150, balance: 0 })], [], null, now).needsSetup, false); // consultation only
});
