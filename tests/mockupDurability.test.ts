/**
 * Durability & correctness tests for the mockup workflow corrections:
 *
 *  1. Blob storage is mandatory — a failed upload must PREVENT Telegram
 *     delivery, mark the generation failed, and persist the failure.
 *  2. A failed internal generation RELEASES the free quota — a retry
 *     (same generationId) and a brand-new request both stay free until
 *     three free generations have actually SUCCEEDED that month.
 *  3. The MockupGenerations sheet upserts ONE row per generation — status
 *     changes and retries update the same row (no duplicates).
 *  4. A paid generation stays ₹20 across internal-failure retries (never
 *     asks for or charges another ₹20).
 */
import "./support/testEnv.js";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeRedis } from "./support/fakeRedis.js";
import { FakeSheetStore } from "./support/fakeSheetStore.js";
import { __setRedisForTests } from "../src/session/redisClient.js";
import { __setMockupSheetStoreForTests } from "../src/sheets/mockupGenerations.js";
import { startMockupGeneration } from "../src/mockup/workflow.js";
import { attachPaymentProof, approvePaidGeneration, __setAfterApprovalDeliverForTests } from "../src/mockup/paidGeneration.js";
import { deliverMockupForOrder } from "../src/mockup/deliver.js";
import { loadGeneration } from "../src/mockup/generationStore.js";
import { peekUsage } from "../src/mockup/quota.js";
import { saveOrderSnapshot } from "../src/session/orderStore.js";
import type { MockupDeliveryDeps } from "../src/mockup/deliver.js";
import { viewsForAssignments } from "../src/mockup/promptBuilder.js";
import type { BlobUploader } from "../src/storage/blob.js";
import type { OrderData, MockupView } from "../src/shared/types.js";

let redis: FakeRedis;
let sheet: FakeSheetStore;

beforeEach(() => {
  redis = new FakeRedis();
  __setRedisForTests(redis);
  sheet = new FakeSheetStore();
  __setMockupSheetStoreForTests(sheet);
});

const FAKE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const CHAT = "tg:5512345678";

function legacyOrder(orderId: string, chat = CHAT): OrderData {
  return {
    orderId,
    status: "Confirmed",
    tier: "basic",
    productId: "cotton_round_neck",
    qty: 60,
    sizeSplit: { S: 10, M: 15, L: 15, XL: 10, XXL: 5, "3XL": 5 },
    printMethod: "dtf",
    city: "Pune",
    name: "Test",
    phone: "9876543210",
    timeline: "standard",
    timelineUrgent: false,
    logoReceived: true,
    logos: [{ fileId: "logo-front", placement: "left_chest" }],
    garmentRate: 100,
    garmentTotal: 6000,
    printEstLow: 100,
    printEstHigh: 200,
    grandEstLow: 6100,
    grandEstHigh: 6200,
    advanceDue: 6000,
    customerChatId: chat,
    channel: "telegram",
  };
}

function okCompositor(): NonNullable<MockupDeliveryDeps["compositor"]> {
  return async (_order, assignments) => {
    const views = viewsForAssignments(assignments) as MockupView[];
    return views.map((view) => ({ view, buffer: Buffer.from(`composited-${view}`) }));
  };
}

function okUploader(): BlobUploader {
  return async ({ pathname }) => ({ url: `https://blob.example/${pathname}`, pathname });
}

function failingUploader(): BlobUploader {
  return async () => {
    throw new Error("blob upload failed (simulated outage)");
  };
}

function deps(overrides: Partial<MockupDeliveryDeps> = {}): { d: MockupDeliveryDeps; sent: string[] } {
  const sent: string[] = [];
  const d: MockupDeliveryDeps = {
    compositor: overrides.compositor ?? okCompositor(),
    blobUploader: overrides.blobUploader ?? okUploader(),
    sendPhoto: async (_chatId, _buf, filename) => {
      sent.push(filename);
      return `tg-${filename}`;
    },
    fetchLogo: async () => FAKE_PNG,
  };
  return { d, sent };
}

// --- 1. Blob mandatory ------------------------------------------------

test("a Blob upload failure PREVENTS Telegram delivery and marks the generation failed", async () => {
  const order = legacyOrder("CTW-260815-40");
  const { d, sent } = deps({ blobUploader: failingUploader() });

  const outcome = await startMockupGeneration(order, d);

  assert.equal(outcome.kind, "generation-failed");
  assert.equal(sent.length, 0, "no image may be sent to Telegram when storage failed");

  const rec = await loadGeneration(order.orderId);
  assert.equal(rec?.status, "failed");
  assert.ok(rec?.failureReason?.includes("blob upload failed"));
  assert.equal(rec?.outputs.length, 0, "no output URL recorded when storage failed");

  // The failure is persisted to the audit sheet on the same single row.
  const auditRow = await sheet.find(order.orderId);
  assert.equal(auditRow?.Status, "failed");
  assert.ok(String(auditRow?.["Failure Reason"]).includes("blob upload failed"));
});

// --- 2. Free-quota release on failure --------------------------------

test("a failed free generation releases the slot; retry (same id) stays free and succeeds", async () => {
  const order = legacyOrder("CTW-260815-41");

  // First attempt fails at storage.
  const failing = deps({ blobUploader: failingUploader() });
  const first = await startMockupGeneration(order, failing.d);
  assert.equal(first.kind, "generation-failed");

  // The slot was NOT consumed by the failure.
  let usage = await peekUsage(CHAT);
  assert.equal(usage.committedFreeThisMonth, 0, "a failed generation must not consume a free slot");

  // Retry the SAME generation (same order id) — now storage works.
  const ok = deps();
  const retry = await startMockupGeneration(order, ok.d);
  assert.equal(retry.kind, "generated");
  assert.equal(ok.sent.length, 1);

  // Now (and only now) the slot is consumed — exactly once.
  usage = await peekUsage(CHAT);
  assert.equal(usage.committedFreeThisMonth, 1);

  const rec = await loadGeneration(order.orderId);
  assert.equal(rec?.status, "completed");
});

test("after a failure, a brand-new request also stays free (failed attempt didn't burn a slot)", async () => {
  // One successful free generation.
  await startMockupGeneration(legacyOrder("CTW-260815-42"), deps().d);
  // A second request that FAILS at storage.
  const failed = await startMockupGeneration(legacyOrder("CTW-260815-43"), deps({ blobUploader: failingUploader() }).d);
  assert.equal(failed.kind, "generation-failed");

  // Only one slot has actually been consumed (the successful one).
  const usage = await peekUsage(CHAT);
  assert.equal(usage.committedFreeThisMonth, 1);

  // Two more brand-new requests still succeed FREE (slots 2 and 3),
  // proving the failed attempt never counted.
  const r2 = await startMockupGeneration(legacyOrder("CTW-260815-44"), deps().d);
  const r3 = await startMockupGeneration(legacyOrder("CTW-260815-45"), deps().d);
  assert.equal(r2.kind, "generated");
  assert.equal(r3.kind, "generated");
  assert.equal((await loadGeneration("CTW-260815-44"))?.free, true);
  assert.equal((await loadGeneration("CTW-260815-45"))?.free, true);

  // The 4th distinct SUCCESSFUL request is the one that goes paid.
  const paid = await startMockupGeneration(legacyOrder("CTW-260815-46"), deps().d);
  assert.equal(paid.kind, "payment-required");
});

// --- 3. No duplicate sheet rows --------------------------------------

test("duplicate triggers / status changes update ONE sheet row (no duplicates)", async () => {
  const order = legacyOrder("CTW-260815-47");
  await startMockupGeneration(order, deps().d); // reserved -> generating -> completed (several saves)
  // Duplicate trigger (repeat webhook) for the same completed order.
  await startMockupGeneration(order, deps().d);

  assert.equal(sheet.rows.size, 1, "one generation must map to exactly one sheet row");
  assert.equal(sheet.createCount, 1, "the row is created exactly once despite many status updates");
  assert.ok(sheet.updateCount >= 1, "status changes update the same row in place");
});

// --- 4. Paid ₹20 stickiness across internal-failure retries ----------

test("a paid generation stays ₹20 across an internal-failure retry (no second charge)", async () => {
  const chat = "tg:7000000010";
  // Exhaust the 3 free slots with successful generations.
  for (let i = 1; i <= 3; i++) {
    await startMockupGeneration(legacyOrder(`CTW-260815-5${i}`, chat), deps().d);
  }

  const paidOrder = legacyOrder("CTW-260815-60", chat);
  await saveOrderSnapshot(paidOrder);
  const start = await startMockupGeneration(paidOrder, deps().d);
  assert.equal(start.kind, "payment-required");
  if (start.kind === "payment-required") assert.equal(start.amountInr, 20);

  await attachPaymentProof(paidOrder.orderId, "proof-1");

  // Admin approves, but generation FAILS at storage this time.
  const failing = deps({ blobUploader: failingUploader() }).d;
  __setAfterApprovalDeliverForTests(async (order) => deliverMockupForOrder(order, failing));
  const approveFail = await approvePaidGeneration(paidOrder.orderId, 999);
  __setAfterApprovalDeliverForTests(undefined);
  assert.equal(approveFail.ok, false);
  const failedRec = await loadGeneration(paidOrder.orderId);
  assert.equal(failedRec?.status, "failed");
  assert.equal(failedRec?.free, false);
  assert.equal(failedRec?.amountInr, 20, "amount stays ₹20 after a failed paid attempt");

  // Retry via the workflow (same order id) — storage works now. It must
  // NOT return payment-required (no second ₹20) and must generate.
  const retry = await startMockupGeneration(paidOrder, deps().d);
  assert.equal(retry.kind, "generated");

  const done = await loadGeneration(paidOrder.orderId);
  assert.equal(done?.status, "completed");
  assert.equal(done?.amountInr, 20, "still exactly one ₹20 charge, never a second");
  assert.equal(done?.free, false);
});
