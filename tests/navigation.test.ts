import { test } from "node:test";
import assert from "node:assert/strict";
import { rollbackStep, determineStep } from "../src/conversation/orderFlow.js";
import type { OrderDraft } from "../src/conversation/draft.js";

test("determineStep: progresses sequentially for bulk order flow", () => {
  const draft: OrderDraft = {};
  assert.equal(determineStep(draft), "orderType");

  draft.orderType = "bulk";
  assert.equal(determineStep(draft), "garmentSilhouette");

  draft.garmentSilhouette = "collar";
  assert.equal(determineStep(draft), "qty");

  draft.qty = 100;
  assert.equal(determineStep(draft), "city");

  draft.city = "Mumbai";
  assert.equal(determineStep(draft), "name");

  draft.name = "Suraj";
  assert.equal(determineStep(draft), "phone");

  draft.phone = "9876543210";
  assert.equal(determineStep(draft), "timeline");

  draft.timeline = "standard";
  assert.equal(determineStep(draft), "tier");

  draft.tier = "standard";
  assert.equal(determineStep(draft), "catalogFabric");

  draft.fabric = "polyester";
  assert.equal(determineStep(draft), "catalogQuality");

  draft.qualityOptionId = "rec-dfp-finch-superia";
  assert.equal(determineStep(draft), "catalogColor");

  draft.colorName = "White";
  assert.equal(determineStep(draft), "printMethod");

  draft.printMethod = "screen_print";
  assert.equal(determineStep(draft), "logoPlacement");

  // User selects a placement rect
  draft.logos = [{ placement: "left_chest", fileId: "" }];
  assert.equal(determineStep(draft), "logoUpload");

  // User uploads the image file
  draft.logos[0].fileId = "media_logo_1";
  assert.equal(determineStep(draft), "logoMore");

  // User confirms no more logos
  draft.logoReceived = true;
  assert.equal(determineStep(draft), "mockupDecision");

  // User decides on mockup
  draft.mockupDecision = "generate";
  assert.equal(determineStep(draft), "payment");

  // User uploads payment screenshot
  draft.paymentScreenshotId = "screenshot_1";
  assert.equal(determineStep(draft), "completed");
});

test("determineStep: progresses sequentially for sample kit flow", () => {
  const draft: OrderDraft = {};
  assert.equal(determineStep(draft), "orderType");

  draft.orderType = "sample";
  assert.equal(determineStep(draft), "garmentSilhouette");

  draft.garmentSilhouette = "round_neck";
  assert.equal(determineStep(draft), "sampleFabric");

  draft.fabric = "cotton";
  assert.equal(determineStep(draft), "city");

  draft.city = "Bangalore";
  assert.equal(determineStep(draft), "name");

  draft.name = "Aman";
  assert.equal(determineStep(draft), "phone");

  draft.phone = "9876543210";
  assert.equal(determineStep(draft), "timeline");

  // Sample kits skip bulk tier, fabric, quality, color, print, logo, and mockup steps
  draft.timeline = "standard";
  assert.equal(determineStep(draft), "payment");

  draft.paymentScreenshotId = "screenshot_sample";
  assert.equal(determineStep(draft), "completed");
});

test("rollbackStep at start returns false", () => {
  const draft: OrderDraft = {};
  assert.equal(rollbackStep(draft), false);
});

test("rollbackStep rolls back bulk flow step by step", () => {
  const draft: OrderDraft = {
    orderType: "bulk",
    garmentSilhouette: "collar",
    qty: 150,
    sizeSplit: { S: 15, M: 40, L: 45, XL: 30, XXL: 15, "3XL": 5 },
    city: "Mumbai",
    name: "Suraj",
    phone: "9876543210",
    timeline: "standard",
    timelineUrgent: false,
    tier: "standard",
    fabric: "polyester",
    productId: "dry_fit_polo",
    qualityOptionId: "rec-dfp-finch-superia",
    qualityOptionName: "Finch Superia Mars",
    colorName: "Rama Blue",
    printMethod: "screen_print",
    logos: [{ placement: "left_chest", fileId: "file_logo_1" }],
    logoReceived: true,
    mockupDecision: "generate",
  };

  // 1. From payment (mockupDecision made) -> rollback to mockupDecision
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.mockupDecision, undefined);

  // 2. From mockupDecision -> rollback to logoMore
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.logoReceived, undefined);

  // 3. From logoMore -> rollback to logoUpload (clears last logo's fileId)
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.logos?.[0]?.fileId, undefined);

  // 4. From logoUpload -> rollback to logoPlacement (pops the logo)
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.logos?.length, 0);

  // 5. From logoPlacement -> rollback to printMethod
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.printMethod, undefined);

  // 6. From printMethod -> rollback to catalogColor
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.colorName, undefined);

  // 7. From catalogColor -> rollback to catalogQuality
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.qualityOptionId, undefined);

  // 8. From catalogQuality -> rollback to catalogFabric
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.fabric, undefined);
  assert.equal(draft.productId, undefined);

  // 9. From catalogFabric -> rollback to tier
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.tier, undefined);

  // 10. From tier -> rollback to timeline
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.timeline, undefined);

  // 11. From timeline -> rollback to phone
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.phone, undefined);

  // 12. From phone -> rollback to name
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.name, undefined);

  // 13. From name -> rollback to city
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.city, undefined);

  // 14. From city -> rollback to qty
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.qty, undefined);

  // 15. From qty -> rollback to garmentSilhouette
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.garmentSilhouette, undefined);

  // 16. From garmentSilhouette -> rollback to orderType
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.orderType, undefined);

  // 17. At orderType (first step), cannot rollback further
  assert.equal(rollbackStep(draft), false);
});

test("rollbackStep rolls back sample kit flow step by step", () => {
  const draft: OrderDraft = {
    orderType: "sample",
    garmentSilhouette: "round_neck",
    fabric: "cotton",
    qty: 3,
    sizeSplit: { S: 1, M: 1, L: 1, XL: 0, XXL: 0, "3XL": 0 },
    tier: "standard",
    productId: "cotton_round_neck",
    city: "Delhi",
    name: "Rohit",
    phone: "9876543210",
    timeline: "standard",
  };

  // 1. From payment -> rollback to timeline
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.timeline, undefined);

  // 2. From timeline -> rollback to phone
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.phone, undefined);

  // 3. From phone -> rollback to name
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.name, undefined);

  // 4. From name -> rollback to city
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.city, undefined);

  // 5. From city -> rollback to sampleFabric
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.fabric, undefined);
  assert.equal(draft.qty, undefined);

  // 6. From sampleFabric -> rollback to garmentSilhouette
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.garmentSilhouette, undefined);

  // 7. From garmentSilhouette -> rollback to orderType
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.orderType, undefined);

  // 8. At start -> cannot rollback
  assert.equal(rollbackStep(draft), false);
});

test("rollbackStep handles auto-skipped single-quality items correctly", () => {
  const draft: OrderDraft = {
    orderType: "bulk",
    garmentSilhouette: "round_neck",
    qty: 50,
    city: "Delhi",
    name: "Aman",
    phone: "9876543210",
    timeline: "standard",
    tier: "basic",
    fabric: "cotton",
    productId: "cotton_round_neck",
    qualityOptionId: "val-crn-finch-bio-wash",
    qualityOptionName: "Finch Bio Wash",
  };

  // Single-quality item rolls back directly past the auto-selected quality to catalogFabric
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.fabric, undefined);
  assert.equal(draft.productId, undefined);
});
