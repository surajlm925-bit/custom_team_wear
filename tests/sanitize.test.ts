import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidQty,
  normalizeIndianPhone,
  sanitizeCity,
  sanitizeName,
} from "../src/shared/sanitize.js";

test("formula-injection sanitizer strips leading = + - @ — AC7", () => {
  assert.equal(sanitizeName("=HYPERLINK(\"http://evil.com\")"), "HYPERLINK(\"http://evil.com\")");
  assert.equal(sanitizeName("+1+2"), "1+2");
  assert.equal(sanitizeName("-drop table"), "drop table");
  assert.equal(sanitizeName("@mention"), "mention");
});

test("name/city length caps", () => {
  const longName = "a".repeat(100);
  assert.equal(sanitizeName(longName).length, 60);
  const longCity = "b".repeat(100);
  assert.equal(sanitizeCity(longCity).length, 40);
});

test("phone normalization accepts +91/0 prefixes", () => {
  assert.equal(normalizeIndianPhone("+91 98765 43210"), "9876543210");
  assert.equal(normalizeIndianPhone("09876543210"), "9876543210");
  assert.equal(normalizeIndianPhone("9876543210"), "9876543210");
});

test("phone normalization rejects invalid numbers", () => {
  assert.equal(normalizeIndianPhone("12345"), null);
  assert.equal(normalizeIndianPhone("5876543210"), null); // must start 6-9
  assert.equal(normalizeIndianPhone("98765432101"), null); // 11 digits
});

test("qty validation", () => {
  assert.equal(isValidQty("50"), 50);
  assert.equal(isValidQty("0"), null);
  assert.equal(isValidQty("-5"), null);
  assert.equal(isValidQty("abc"), null);
  assert.equal(isValidQty("100001"), null);
});
