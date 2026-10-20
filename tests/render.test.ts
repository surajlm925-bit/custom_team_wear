import { test } from "node:test";
import assert from "node:assert/strict";
import { renderQuoteCard, renderAdminCard } from "../src/shared/render.js";
import type { OrderData } from "../src/shared/types.js";

function sampleBulkOrder(): OrderData {
  return {
    orderId: "CTW-261020-01",
    status: "Pending Payment",
    orderType: "bulk",
    tier: "standard",
    productId: "dry_fit_polo",
    qty: 100,
    sizeSplit: { S: 16, M: 17, L: 17, XL: 17, XXL: 17, "3XL": 16 },
    printMethod: "screen_print",
    city: "Bengaluru",
    name: "Suraj",
    phone: "9876543210",
    timeline: "standard",
    timelineUrgent: false,
    logoReceived: true,
    logos: [{ placement: "left_chest", fileId: "logo_1" }],
    garmentRate: 309,
    garmentTotal: 30900,
    printEstLow: 3500,
    printEstHigh: 7000,
    grandEstLow: 34400,
    grandEstHigh: 37900,
    advanceDue: 15450,
    customerChatId: "wa:919876543210",
    channel: "whatsapp",
    catalogSelection: {
      catalogVersion: "1.0",
      tier: "standard",
      groupId: "standard-polo-drifit",
      groupLabel: "Standard Polo Dry Fit",
      itemId: "rec-dfp-finch-superia",
      itemLabel: "Finch Superia Mars",
      productId: "dry_fit_polo",
      garmentType: "polo",
      sourceId: "standard-polo-drifit-polo",
      sourcePage: 1,
      colorName: "White",
      referenceImageKind: "placeholder",
      mockupEligible: true,
    },
  };
}

function sampleKitOrder(): OrderData {
  return {
    orderId: "CTW-261020-02",
    status: "Pending Payment",
    orderType: "sample",
    tier: "standard",
    productId: "cotton_round_neck",
    qty: 3,
    sizeSplit: { S: 1, M: 1, L: 1, XL: 0, XXL: 0, "3XL": 0 },
    printMethod: "screen_print",
    city: "Mumbai",
    name: "Rohit",
    phone: "9876543210",
    timeline: "standard",
    timelineUrgent: false,
    logoReceived: false,
    logos: [],
    garmentRate: 833,
    garmentTotal: 2499,
    printEstLow: 0,
    printEstHigh: 0,
    grandEstLow: 2499,
    grandEstHigh: 2499,
    advanceDue: 2499,
    customerChatId: "wa:919876543210",
    channel: "whatsapp",
  };
}

test("renderQuoteCard uses 'T-Shirt' terminology and never 'garment'", () => {
  const bulkQuote = renderQuoteCard(sampleBulkOrder());
  assert.ok(bulkQuote.includes("T-Shirt"), "bulk quote must include 'T-Shirt'");
  assert.equal(bulkQuote.toLowerCase().includes("garment"), false, "bulk quote must not use 'garment'");

  const sampleQuote = renderQuoteCard(sampleKitOrder());
  assert.ok(sampleQuote.includes("T-Shirt"), "sample quote must include 'T-Shirt'");
  assert.equal(sampleQuote.toLowerCase().includes("garment"), false, "sample quote must not use 'garment'");
});

test("renderAdminCard uses 'T-Shirt' terminology and never 'garment'", () => {
  const bulkAdmin = renderAdminCard(sampleBulkOrder());
  assert.ok(bulkAdmin.includes("T-Shirt"), "bulk admin card must include 'T-Shirt'");
  assert.equal(bulkAdmin.toLowerCase().includes("garment"), false, "bulk admin card must not use 'garment'");

  const sampleAdmin = renderAdminCard(sampleKitOrder());
  assert.ok(sampleAdmin.includes("T-Shirt"), "sample admin card must include 'T-Shirt'");
  assert.equal(sampleAdmin.toLowerCase().includes("garment"), false, "sample admin card must not use 'garment'");
});

test("renderQuoteCard displays bulk order pricing, size split, and 50% advance correctly", () => {
  const order = sampleBulkOrder();
  const quote = renderQuoteCard(order);

  assert.ok(quote.includes(`100 × ₹309 = *₹30,900*`));
  assert.ok(quote.includes(`Pay today (T-Shirt advance ≈ 50%): ₹15,450`));
  assert.ok(quote.includes("Finch Superia Mars · White"));
});

test("renderQuoteCard displays trial sample kit with 100% full payment", () => {
  const order = sampleKitOrder();
  const quote = renderQuoteCard(order);

  assert.ok(quote.includes("Trial Sample Kit (3 pcs: 1 Value + 1 Recommended + 1 Premium)"));
  assert.ok(quote.includes("Pay today (100% full payment): ₹2,499"));
  assert.ok(quote.includes("Sample kit will be dispatched to your delivery address"));
});
