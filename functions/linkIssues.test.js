// Run: node --test functions/linkIssues.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { linkHint } = require("./linkIssues");

test("linkHint: reads which case a non-case MyCase link points at", () => {
  assert.deepEqual(linkHint("https://law-firm-of-moumita-rahman-pllc.mycase.com/contacts/clients/61675688"), { contactId: "61675688" });
  assert.deepEqual(linkHint("https://law-firm-of-moumita-rahman-pllc.mycase.com/bills/36907902#:~:text=A%20(03"), { invoiceId: "36907902" });
  assert.deepEqual(linkHint("https://law-firm-of-moumita-rahman-pllc.mycase.com/payment_plans?court_case_id=45403519&x=1"), { caseId: "45403519" });
  assert.deepEqual(linkHint("A (02-25) VIRK, NAGENDER SINGH (T-VISA IN REMOVAL +1 DERIVATIVE)"), {});
  assert.deepEqual(linkHint("https://rahman-law-firm.monday.com/boards/123/views/456"), {});
  assert.deepEqual(linkHint(""), {});
});
