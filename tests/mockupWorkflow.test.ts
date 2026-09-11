/**
 * Mockup-generation workflow tests: durable storage, free vs paid routing,
 * payment proof + admin approval gating, and idempotency under duplicate
 * callbacks / retries.
 *
 * All external effects are injected or faked:
 *  - Redis  -> in-memory FakeRedis
 *  - AI provider -> capture fake (no paid API call)
 *  - Blob storage -> capture fake uploader (no network)
 *  - Telegram send -> capture fake (no bot API)
 * so the tests exercise real control flow without any live service.
 */
import "./support/testEnv.js";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeRedis } from "./support/fakeRedis.js";
import { FakeSheetStore } from "./support/fakeSheetStore.js";
import { __setRedisForTests } from "../src/session/redisClient.js";
import { __setMockupSheetStoreForTests } from "../src/sheets/mockupGenerations.js";
import { startMockupGeneration } from "../src/mockup/workflow.js";
import {
  approvePaidGeneration,
  rejectPaidGeneration,
  attachPaymentProof,
} from "../src/mockup/paidGeneration.js";
import { loadGeneration } from "../src/mockup/generationStore.js";
import { saveOrderSnapshot } from "../src/session/orderStore.js";
import { deliverMockupForOrder, type MockupDeliveryDeps } from "../src/mockup/deliver.js";
import { __setAfterApprovalDeliverForTests } from "../src/mockup/paidGeneration.js";
import { viewsForAssignments } from "../src/mockup/promptBuilder.js";
import type { BlobUploader } from "../src/storage/blob.js";
import type { OrderData, LogoUpload, MockupView } from "../src/shared/types.js";

let redis: FakeRedis;
let sheet: FakeSheetStore;

beforeEach(() => {
  redis = new FakeRedis();
  __setRedisForTests(redis);
  sheet = new FakeSheetStore();
  __setMockupSheetStoreForTests(sheet);
});

// --- fakes ------------------------------------------------------------

// Fake deterministic compositor: returns one buffer per distinct view the
// assignments touch (mirrors the real generateDeterministicMockups view
// count) and records how many IMAGES it produced, so tests can assert
// front-only=1, front+back=2 without doing real Sharp work.
function captureCompositor(): {
  compositor: NonNullable<MockupDeliveryDeps["compositor"]>;
  count: () => number;
} {
  const state = { images: 0 };
  const compositor: NonNullable<MockupDeliveryDeps["compositor"]> = async (_order, assignments) => {
    const views = viewsForAssignments(assignments) as MockupView[];
    state.images += views.length;
    return views.map((view) => ({ view, buffer: Buffer.from(`composited-${view}`) }));
  };
  return { compositor, count: () => state.images };
}

function captureUploader(): { uploader: BlobUploader; uploads: { pathname: string }[] } {
  const uploads: { pathname: string }[] = [];
  const uploader: BlobUploader = async ({ pathname }) => {
    uploads.push({ pathname });
    return { url: `https://blob.example/${pathname}`, pathname };
  };
  return { uploader, uploads };
}

function captureSend(): { sendPhoto: NonNullable<MockupDeliveryDeps["sendPhoto"]>; sent: string[] } {
  const sent: string[] = [];
  const sendPhoto = async (_chatId: number, _buffer: Buffer, filename: string) => {
    sent.push(filename);
    return `tg-file-${filename}`;
  };
  return { sendPhoto, sent };
}

// A valid PNG magic-number buffer so validateLogoFile accepts the injected logo.
const FAKE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

function deps(): MockupDeliveryDeps & { uploads: { pathname: string }[]; sent: string[]; providerCalls: () => number } {
  const p = captureCompositor();
  const u = captureUploader();
  const s = captureSend();
  return {
    compositor: p.compositor,
    blobUploader: u.uploader,
    sendPhoto: s.sendPhoto,
    fetchLogo: async () => FAKE_PNG,
    uploads: u.uploads,
    sent: s.sent,
    providerCalls: () => p.count(),
  };
}

/**
 * In production, approving a paid generation DISPATCHES work to the
 * standalone /api/mockup-delivery function (see paidGeneration.ts). Tests
 * instead run delivery synchronously with the injected fakes above.
 */
function useInlineApprovalDelivery(d: ReturnType<typeof deps>) {
  __setAfterApprovalDeliverForTests(async (order) => deliverMockupForOrder(order, d));
}

beforeEach(() => {
  // Reset the approval-delivery seam so no test leaks its override.
  __setAfterApprovalDeliverForTests(undefined);
});

// A LEGACY order (no catalogSelection) so garment-reference resolution
// reads the on-disk generic template — no catalog manifest needed here.
function legacyOrder(overrides: Partial<OrderData> = {}, logos?: LogoUpload[]): OrderData {
  return {
    orderId: overrides.orderId ?? "CTW-260815-01",
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
    logos: logos ?? [{ fileId: "logo-front", placement: "left_chest" }],
    garmentRate: 100,
    garmentTotal: 6000,
    printEstLow: 100,
    printEstHigh: 200,
    grandEstLow: 6100,
    grandEstHigh: 6200,
    advanceDue: 6000,
    customerChatId: "tg:5512345678",
    channel: "telegram",
    ...overrides,
  };
}

// Exhausts a chat's free monthly quota using distinct throwaway orders.
async function exhaustFreeQuota(chat: string, prefix: string) {
  for (let i = 1; i <= 3; i++) {
    const o = legacyOrder({ orderId: `${prefix}-free${i}`, customerChatId: chat });
    await startMockupGeneration(o, deps());
  }
}

// --- free vs paid routing --------------------------------------------

test("free path (within monthly quota) generates and durably stores the image", async () => {
  const order = legacyOrder();
  const d = deps();
  const outcome = await startMockupGeneration(order, d);

  assert.equal(outcome.kind, "generated");
  assert.equal(d.providerCalls(), 1, "front-only request generates exactly one image");
  assert.equal(d.uploads.length, 1, "the generated image is uploaded to durable storage");
  assert.equal(d.sent.length, 1, "the image is sent to the customer");
  // Durable storage happened BEFORE (or alongside) sending — the record
  // carries the blob URL.
  const rec = await loadGeneration(order.orderId);
  assert.equal(rec?.free, true);
  assert.equal(rec?.amountInr, 0);
  assert.equal(rec?.status, "completed");
  assert.equal(rec?.outputs.length, 1);
  assert.ok(rec?.outputs[0].url?.startsWith("https://blob.example/mockups/"));

  // A durable audit row exists for this generation, and it's a SINGLE row
  // (created once, then updated in place through the lifecycle).
  const auditRow = await sheet.find(order.orderId);
  assert.ok(auditRow, "an audit row must exist in the MockupGenerations sheet");
  assert.equal(auditRow?.Status, "completed");
  assert.equal(auditRow?.["Free/Paid"], "Free");
  assert.equal(sheet.rows.size, 1, "exactly one audit row for one generation");
  assert.equal(sheet.createCount, 1, "the row was created exactly once (no duplicates)");
});

test("a front+back request counts as ONE generation but produces TWO stored images", async () => {
  const order = legacyOrder({ orderId: "CTW-260815-05" }, [
    { fileId: "logo-front", placement: "left_chest" },
    { fileId: "logo-back", placement: "upper_back" },
  ]);
  const d = deps();
  const outcome = await startMockupGeneration(order, d);

  assert.equal(outcome.kind, "generated");
  assert.equal(d.providerCalls(), 2, "front+back produces two images");
  assert.equal(d.uploads.length, 2, "both views are durably stored");

  const rec = await loadGeneration(order.orderId);
  // ...yet it consumed only ONE quota slot (usage #1 for this chat).
  assert.equal(rec?.free, true);
  assert.equal(rec?.requestedViews.length, 2);
  assert.equal(rec?.outputs.length, 2);
});

test("paid path (quota exhausted) returns payment-required and generates NOTHING", async () => {
  const chat = "tg:7000000001";
  await exhaustFreeQuota(chat, "CTW-260815-1x");

  const paidOrder = legacyOrder({ orderId: "CTW-260815-14", customerChatId: chat });
  const d = deps();
  const outcome = await startMockupGeneration(paidOrder, d);

  assert.equal(outcome.kind, "payment-required");
  if (outcome.kind === "payment-required") {
    assert.equal(outcome.amountInr, 20);
  }
  assert.equal(d.providerCalls(), 0, "paid path must not generate before approval");
  assert.equal(d.uploads.length, 0, "paid path must not upload before approval");

  const rec = await loadGeneration(paidOrder.orderId);
  assert.equal(rec?.status, "awaiting_payment");
  assert.equal(rec?.free, false);
});

// --- payment proof + admin approval ----------------------------------

async function seedPaidAwaitingApproval(chat: string, orderId: string) {
  await exhaustFreeQuota(chat, orderId);
  const paidOrder = legacyOrder({ orderId, customerChatId: chat });
  await saveOrderSnapshot(paidOrder);
  await startMockupGeneration(paidOrder, deps());
  await attachPaymentProof(orderId, "proof-file-id");
  return paidOrder;
}

test("admin approval generates the mockup; before approval nothing generates", async () => {
  const chat = "tg:7000000002";
  const orderId = "CTW-260815-20";
  await seedPaidAwaitingApproval(chat, orderId);

  const beforeApproval = await loadGeneration(orderId);
  assert.equal(beforeApproval?.status, "awaiting_approval");

  const d = deps();
  useInlineApprovalDelivery(d);
  const result = await approvePaidGeneration(orderId, 999);
  assert.equal(result.changed, true);

  const after = await loadGeneration(orderId);
  assert.equal(after?.status, "completed");
  // The provider was invoked exactly once for the (single-view) request.
  assert.equal(d.providerCalls(), 1);
  assert.equal(d.uploads.length, 1);
});

test("admin reject moves to rejected and never generates", async () => {
  const chat = "tg:7000000003";
  const orderId = "CTW-260815-21";
  await seedPaidAwaitingApproval(chat, orderId);

  const result = await rejectPaidGeneration(orderId, 999);
  assert.equal(result.changed, true);

  const after = await loadGeneration(orderId);
  assert.equal(after?.status, "rejected");
});

// --- idempotency / duplicate callbacks -------------------------------

test("duplicate admin Approve does not regenerate or re-charge", async () => {
  const chat = "tg:7000000004";
  const orderId = "CTW-260815-22";
  await seedPaidAwaitingApproval(chat, orderId);

  const d1 = deps();
  useInlineApprovalDelivery(d1);
  const first = await approvePaidGeneration(orderId, 999);
  assert.equal(first.changed, true);
  assert.equal(d1.providerCalls(), 1);

  // Second identical Approve (double-click / duplicate callback).
  const d2 = deps();
  useInlineApprovalDelivery(d2);
  const second = await approvePaidGeneration(orderId, 999);
  assert.equal(second.changed, false, "duplicate approve must be a no-op");
  assert.equal(d2.providerCalls(), 0, "duplicate approve must not regenerate");
});

test("Reject after Approve is refused (approval already won)", async () => {
  const chat = "tg:7000000005";
  const orderId = "CTW-260815-23";
  await seedPaidAwaitingApproval(chat, orderId);

  useInlineApprovalDelivery(deps());
  await approvePaidGeneration(orderId, 999);

  const rejectResult = await rejectPaidGeneration(orderId, 999);
  assert.equal(rejectResult.changed, false);
  const rec = await loadGeneration(orderId);
  assert.notEqual(rec?.status, "rejected");
});

test("duplicate payment proof does not advance state twice", async () => {
  const chat = "tg:7000000006";
  const orderId = "CTW-260815-24";
  await exhaustFreeQuota(chat, orderId);
  const paidOrder = legacyOrder({ orderId, customerChatId: chat });
  await saveOrderSnapshot(paidOrder);
  await startMockupGeneration(paidOrder, deps());

  const r1 = await attachPaymentProof(orderId, "proof-1");
  const r2 = await attachPaymentProof(orderId, "proof-2");
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  const rec = await loadGeneration(orderId);
  assert.equal(rec?.status, "awaiting_approval");
});

test("two admins approving at the same instant generate exactly once", async () => {
  const chat = "tg:7000000007";
  const orderId = "CTW-260815-25";
  await seedPaidAwaitingApproval(chat, orderId);

  const dRace = deps();
  useInlineApprovalDelivery(dRace);
  // Fire both approvals concurrently (race).
  const [ra, rb] = await Promise.all([
    approvePaidGeneration(orderId, 111),
    approvePaidGeneration(orderId, 222),
  ]);

  // Exactly one call performed the work.
  const changedCount = [ra, rb].filter((r) => r.changed).length;
  assert.equal(changedCount, 1, "only one concurrent approve may take effect");
  const totalProviderCalls = dRace.providerCalls();
  assert.equal(totalProviderCalls, 1, "generation must run exactly once under a concurrent approve race");

  const rec = await loadGeneration(orderId);
  assert.equal(rec?.status, "completed");
});

test("re-running a completed generation returns cached URLs and does NOT regenerate", async () => {
  const order = legacyOrder({ orderId: "CTW-260815-30" });
  const d1 = deps();
  await startMockupGeneration(order, d1);
  assert.equal(d1.providerCalls(), 1);

  // A duplicate trigger for the same order (e.g. repeat webhook).
  const d2 = deps();
  const outcome = await startMockupGeneration(order, d2);
  assert.equal(outcome.kind, "already-completed");
  assert.equal(d2.providerCalls(), 0, "completed generation must not regenerate");
});
