import test from "node:test";
import assert from "node:assert/strict";
import "./support/testEnv.js";
import { FakeRedis } from "./support/fakeRedis.js";
import { __setRedisForTests } from "../src/session/redisClient.js";
import { createApprovalCode, verifyAndConsumeApprovalCode, getActiveApprovalCode } from "../src/admin/approvalCode.js";
import { normalizeAdminChatId, handleAdminAction, handleAdminTextCommand } from "../src/admin/actions.js";
import { saveOrderSnapshot } from "../src/session/orderStore.js";
import type { OrderData } from "../src/shared/types.js";

test("approvalCode: creates 6-digit code and consumes it", async () => {
  const redis = new FakeRedis();
  __setRedisForTests(redis);

  const code = await createApprovalCode("order", "CTW-261012-01", "919999999999");
  assert.match(code, /^\d{6}$/, "code must be 6 digits");

  const active = await getActiveApprovalCode("order", "CTW-261012-01");
  assert.equal(active, code);

  // Consume valid code
  const result = await verifyAndConsumeApprovalCode(code);
  assert.ok(result, "must verify valid code");
  assert.equal(result?.type, "order");
  assert.equal(result?.id, "CTW-261012-01");

  // Re-consuming same code must fail
  const second = await verifyAndConsumeApprovalCode(code);
  assert.equal(second, null, "consumed code cannot be reused");
});

test("approvalCode: invalid code returns null", async () => {
  const redis = new FakeRedis();
  __setRedisForTests(redis);

  const result = await verifyAndConsumeApprovalCode("12345"); // 5 digits
  assert.equal(result, null);

  const result2 = await verifyAndConsumeApprovalCode("abcdef");
  assert.equal(result2, null);
});

test("isAuthorizedAdmin: correctly normalizes wa: and + prefixes", () => {
  assert.equal(normalizeAdminChatId("wa:919876543210"), "919876543210");
  assert.equal(normalizeAdminChatId("+919876543210"), "919876543210");
  assert.equal(normalizeAdminChatId("919876543210"), "919876543210");
});

test("admin approval: button click on confirm is rejected and prompts for 6-digit code", async () => {
  const redis = new FakeRedis();
  __setRedisForTests(redis);

  const sentMessages: Array<{ to: string; text: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: any, init: any) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sentMessages.push({ to: body.to, text: body.text?.body || "" });
    return new Response(JSON.stringify({ messages: [{ id: "mock_id" }] }), { status: 200 });
  }) as any;

  try {
    await handleAdminAction("999", "admin:confirm:CTW-261012-01", {});
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].text, /One-click confirmation is disabled/i);
    assert.match(sentMessages[0].text, /approval code/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin approval: direct 'CONFIRM <orderId>' command is rejected and prompts for 6-digit code", async () => {
  const redis = new FakeRedis();
  __setRedisForTests(redis);

  const sentMessages: Array<{ to: string; text: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: any, init: any) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sentMessages.push({ to: body.to, text: body.text?.body || "" });
    return new Response(JSON.stringify({ messages: [{ id: "mock_id" }] }), { status: 200 });
  }) as any;

  try {
    const handled = await handleAdminTextCommand("999", "CONFIRM CTW-261012-01");
    assert.equal(handled, true);
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].text, /Direct text confirmation is disabled/i);
    assert.match(sentMessages[0].text, /approval code/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin approval: valid 6-digit code confirms order and sends confirmation DM to customer", async () => {
  const redis = new FakeRedis();
  __setRedisForTests(redis);

  // Setup order snapshot
  const orderId = "CTW-261012-99";
  const testOrder: Partial<OrderData> = {
    orderId,
    name: "Aman",
    phone: "+919876543210",
    customerChatId: "wa:919876543210",
    status: "Pending Payment",
  };
  await saveOrderSnapshot(testOrder as OrderData);

  // Create approval code
  const code = await createApprovalCode("order", orderId);

  const sentMessages: Array<{ to: string; text: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: any, init: any) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sentMessages.push({ to: body.to, text: body.text?.body || "" });
    return new Response(JSON.stringify({ messages: [{ id: "mock_id" }] }), { status: 200 });
  }) as any;

  try {
    // Admin sends 6-digit code
    const handled = await handleAdminTextCommand("999", code);
    assert.equal(handled, true);

    // Should have sent confirmation to admin and confirmation DM to customer
    const adminMsg = sentMessages.find((m) => m.to === "999");
    assert.ok(adminMsg, "admin must receive confirmation message");
    assert.match(adminMsg.text, /Code verified/i);

    const customerMsg = sentMessages.find((m) => m.to === "919876543210");
    assert.ok(customerMsg, "customer must receive confirmation DM");
    assert.match(customerMsg.text, new RegExp(`Order ${orderId} confirmed!`, "i"));

    // Code must be consumed
    const consumed = await verifyAndConsumeApprovalCode(code);
    assert.equal(consumed, null, "code should be consumed after verification");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin approval: invalid or expired 6-digit code is rejected without confirming", async () => {
  const redis = new FakeRedis();
  __setRedisForTests(redis);

  const sentMessages: Array<{ to: string; text: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: any, init: any) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sentMessages.push({ to: body.to, text: body.text?.body || "" });
    return new Response(JSON.stringify({ messages: [{ id: "mock_id" }] }), { status: 200 });
  }) as any;

  try {
    const handled = await handleAdminTextCommand("999", "654321");
    assert.equal(handled, true);
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].text, /invalid or has expired/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
