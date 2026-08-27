import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition } from "../src/session/statusMachine.js";

test("forward-only transitions — PRD §8.1", () => {
  assert.equal(canTransition("Pending Payment", "Confirmed"), true);
  assert.equal(canTransition("Pending Payment", "Payment Issue"), true);
});

test("terminal states reject any further transition", () => {
  assert.equal(canTransition("Confirmed", "Payment Issue"), false);
  assert.equal(canTransition("Payment Issue", "Confirmed"), false);
  assert.equal(canTransition("Lead — Abandoned", "Confirmed"), false);
});

test("duplicate/no-op transitions rejected", () => {
  assert.equal(canTransition("Confirmed", "Confirmed"), false);
});

test("backward transitions rejected", () => {
  assert.equal(canTransition("Confirmed", "Pending Payment"), false);
});
