// Run: node --test phones.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePhone, phonesOf, displayPhone } = require("./phones");

test("normalizePhone: US numbers in any typed format", () => {
  assert.equal(normalizePhone("(555) 123-4567"), "+15551234567");
  assert.equal(normalizePhone("555.123.4567"), "+15551234567");
  assert.equal(normalizePhone("1-555-123-4567"), "+15551234567");
  assert.equal(normalizePhone("+1 555 123 4567"), "+15551234567");
  assert.equal(normalizePhone("555-123-4567 ext 22"), "+15551234567");
});

test("normalizePhone: foreign numbers keep their country code", () => {
  assert.equal(normalizePhone("+52 55 1234 5678"), "+525512345678");
  assert.equal(normalizePhone("011 52 55 1234 5678"), "+525512345678");
  assert.equal(normalizePhone("525512345678"), "+525512345678");
});

test("normalizePhone: junk is null", () => {
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone("n/a"), null);
  assert.equal(normalizePhone("12345"), null);
});

test("phonesOf / displayPhone", () => {
  assert.deepEqual(phonesOf({ cell_phone: "(555) 123-4567", home_phone: "+15551234567", work_phone: "555 999 0000" }), ["+15551234567", "+15559990000"]);
  assert.equal(displayPhone("+15551234567"), "(555) 123-4567");
  assert.equal(displayPhone("+525512345678"), "+525512345678");
});
