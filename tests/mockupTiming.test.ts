/**
 * Mockup-timing guard (requirement D): the mockup step must run AFTER the
 * logo-upload step and BEFORE the garment-payment stage, and the order ID
 * must be created before the mockup runs so all assets are tagged to it.
 *
 * This is a structural assertion over orderFlow.ts: driving the full grammY
 * conversation end-to-end in a unit test is disproportionately heavy, so we
 * instead pin the ordering of the well-known markers in the flow source.
 * If someone moves the mockup step back after payment (regressing the bug
 * this fixes), this test fails.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const flowSrc = readFileSync(path.resolve(__dirname, "../src/conversation/orderFlow.ts"), "utf8");

test("order ID is created, then the mockup step runs, then the payment stage — in that order", () => {
  const idxLogoDone = flowSrc.indexOf("draft.logoReceived =");
  // Use the call site, not the import, of nextOrderId.
  const idxOrderId = flowSrc.indexOf("await conversation.external(() => nextOrderId())");
  // In-flow the mockup step is a fire-and-forget dispatch to the standalone
  // /api/mockup-delivery function (it must never run in the webhook budget).
  const idxMockup = flowSrc.indexOf("triggerMockupDelivery(order.orderId)");
  const idxPayment = flowSrc.indexOf("S11 Payment");
  // Call site of the QR generator (not the import at the top of the file).
  const idxQrCall = flowSrc.indexOf("generateUpiQrPng(env.MERCHANT_VPA");

  assert.ok(idxLogoDone > 0, "logo-upload completion marker must exist");
  assert.ok(idxOrderId > 0, "order ID creation must exist");
  assert.ok(idxMockup > 0, "mockup step must exist in the flow");
  assert.ok(idxPayment > 0, "payment stage marker must exist");
  assert.ok(idxQrCall > 0, "UPI QR generation call must exist");

  // Order ID is created after logos are collected.
  assert.ok(idxOrderId > idxLogoDone, "order ID must be created after logo upload");
  // Mockup runs after the order ID exists.
  assert.ok(idxMockup > idxOrderId, "mockup must run after the order ID is created");
  // Mockup runs BEFORE the payment stage / QR.
  assert.ok(idxMockup < idxPayment, "mockup must run before the S11 payment stage");
  assert.ok(idxMockup < idxQrCall, "mockup must run before the UPI QR (payment) is generated");
});

test("the admin confirm handler no longer triggers a post-payment mockup (moved earlier)", () => {
  const adminSrc = readFileSync(path.resolve(__dirname, "../src/admin/actions.ts"), "utf8");
  assert.ok(
    !adminSrc.includes("triggerMockupDelivery"),
    "admin confirm must NOT re-trigger mockup generation (it now happens before payment)",
  );
});

test("mockup generation never runs inline in the webhook budget", () => {
  assert.ok(
    flowSrc.includes("triggerMockupDelivery(order.orderId)"),
    "orderFlow must dispatch mockup work to /api/mockup-delivery",
  );
  assert.ok(
    !flowSrc.includes("startMockupGeneration(order)"),
    "orderFlow must NOT run startMockupGeneration inline (exceeds the webhook budget)",
  );

  // The admin paid-approval path must dispatch too — with claimDecision
  // already consumed, an inline timeout would leave the record stuck in
  // `approved` with no retry.
  const paidSrc = readFileSync(path.resolve(__dirname, "../src/mockup/paidGeneration.ts"), "utf8");
  assert.ok(paidSrc.includes("triggerMockupDelivery"), "paid approve must dispatch via triggerMockupDelivery");
  assert.ok(!paidSrc.includes("deliverMockupForOrder("), "paid approve must not deliver inline");
});

test("the over-quota (paid) path tells the CUSTOMER payment is required", () => {
  const deliverySrc = readFileSync(path.resolve(__dirname, "../api/mockup-delivery.ts"), "utf8");
  assert.ok(
    deliverySrc.includes("COPY.mockupPaidRequired"),
    "mockup-delivery must message the customer when their free mockup quota is exhausted",
  );
});
