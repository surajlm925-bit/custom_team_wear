import { test } from "node:test";
import assert from "node:assert/strict";
import { rollbackStep } from "../src/conversation/orderFlow.js";
import type { OrderDraft } from "../src/conversation/draft.js";

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

  // 7. From catalogColor -> rollback to catalogQuality (since Finch Superia has multiple qualities under standard dry_fit_polo)
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

test("rollbackStep handles auto-skipped single-quality items correctly", () => {
  // basic cotton round neck only has 1 quality (val-crn-finch-bio-wash)
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
    // At catalogColor step
  };

  // Since basic cotton round neck only has 1 quality, rolling back from catalogColor
  // should roll all the way back to catalogFabric rather than getting stuck on auto-selected quality
  assert.equal(rollbackStep(draft), true);
  assert.equal(draft.fabric, undefined);
  assert.equal(draft.productId, undefined);
});
