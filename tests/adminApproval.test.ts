import test from "node:test";
import assert from "node:assert/strict";
import { FakeRedis } from "./support/fakeRedis.js";
import { __setRedisForTests } from "../src/session/redisClient.js";
import { createApprovalCode, verifyAndConsumeApprovalCode, getActiveApprovalCode } from "../src/admin/approvalCode.js";
import { isAuthorizedAdmin, normalizeAdminChatId } from "../src/admin/actions.js";

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
