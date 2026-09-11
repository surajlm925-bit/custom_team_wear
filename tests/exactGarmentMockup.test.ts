/**
 * Mockup tests — asserting that logo mockups are generated
 * onto the clean white shirt silhouette templates (polo_front, polo_back, etc.).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMockupEligible, isLegacyOrderWithoutCatalog, resolveGarmentReference } from "../src/mockup/garmentReference.js";
import { generateAiMockups, type MockupImageProvider } from "../src/mockup/generateAi.js";
import type { OrderData, CatalogSelection } from "../src/shared/types.js";
import type { LogoAssignment } from "../src/mockup/promptBuilder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, "../assets/mockup-templates");

function sampleCatalogSelection(): CatalogSelection {
  return {
    catalogVersion: "options-v2",
    tier: "basic",
    groupId: "cotton_polo",
    groupLabel: "Cotton Polo",
    itemId: "val-cp-1-uf-008",
    itemLabel: "Cotton Polo (UF 008)",
    productId: "cotton_polo",
    garmentType: "polo",
    sourceId: "quality-folder",
    sourcePage: 1,
    colorName: "Navy Blue",
    referenceImageKind: "placeholder",
    mockupEligible: true,
  };
}

function baseOrder(patch: Partial<OrderData> = {}): OrderData {
  return {
    orderId: "CTW-260901-01",
    status: "Pending Payment",
    tier: "basic",
    productId: "cotton_polo",
    qty: 60,
    sizeSplit: { S: 10, M: 15, L: 15, XL: 10, XXL: 5, "3XL": 5 },
    printMethod: "screen_print",
    city: "Bangalore",
    name: "Test Customer",
    phone: "9876543210",
    timeline: "flexible",
    timelineUrgent: false,
    logoReceived: true,
    garmentRate: 289,
    garmentTotal: 17340,
    printEstLow: 2400,
    printEstHigh: 3600,
    grandEstLow: 19740,
    grandEstHigh: 20940,
    advanceDue: 8670,
    customerChatId: "tg:12345",
    channel: "telegram",
    logos: [{ fileId: "file_logo_1", placement: "left_chest" }],
    catalogSelection: sampleCatalogSelection(),
    ...patch,
  };
}

interface CapturedCall {
  prompt: string;
  templateImage: Buffer;
  logoImages: Buffer[];
}

function captureProvider(responseBytes = Buffer.from("mockup-out")): {
  provider: MockupImageProvider;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const provider: MockupImageProvider = async (input) => {
    calls.push({ prompt: input.prompt, templateImage: input.templateImage, logoImages: input.logoImages });
    return { imageBuffer: responseBytes, costUsd: 0, model: "test-model" };
  };
  return { provider, calls };
}

const LOGO = Buffer.from("fake-logo-bytes");

// --- eligibility ------------------------------------------------------

test("orders are always mockup-eligible", () => {
  const order = baseOrder();
  assert.equal(isMockupEligible(order), true);
});

test("legacy order (no catalog data) is treated as legacy and is mockup-eligible", () => {
  const order = baseOrder({ catalogSelection: undefined });
  assert.equal(isLegacyOrderWithoutCatalog(order), true);
  assert.equal(isMockupEligible(order), true);
});

// --- white shirt template reaches the provider -----------------------------

test("the white shirt template (bytes) is what reaches the AI provider", async () => {
  const order = baseOrder();
  const whiteShirtTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, "polo_front.png"));

  const { provider, calls } = captureProvider();
  const assignments: LogoAssignment[] = [{ logoIndex: 0, placement: "left_chest" }];
  const results = await generateAiMockups(order, assignments, [LOGO], provider);

  assert.equal(results.length, 1);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].templateImage.equals(whiteShirtTemplate), "provider must receive the white shirt template");
  assert.equal(results[0].referenceSource, "legacy-template");
});

test("brand/style/colour from the selection are woven into the prompt", async () => {
  const selection = sampleCatalogSelection();
  const order = baseOrder({ catalogSelection: selection });
  const { provider, calls } = captureProvider();
  await generateAiMockups(order, [{ logoIndex: 0, placement: "left_chest" }], [LOGO], provider);

  const prompt = calls[0].prompt;
  assert.ok(prompt.includes(selection.itemLabel), "prompt missing the selected style label");
  assert.ok(prompt.includes("Navy Blue"), "prompt missing the selected colour");
});

// --- view counts ------------------------------------------------------

test("front-only placement produces exactly one image", async () => {
  const order = baseOrder();
  const { provider } = captureProvider();
  const results = await generateAiMockups(order, [{ logoIndex: 0, placement: "left_chest" }], [LOGO], provider);
  assert.equal(results.length, 1);
  assert.equal(results[0].view, "front");
});

test("back-only placement produces exactly one image", async () => {
  const order = baseOrder();
  const { provider } = captureProvider();
  const results = await generateAiMockups(order, [{ logoIndex: 0, placement: "upper_back" }], [LOGO], provider);
  assert.equal(results.length, 1);
  assert.equal(results[0].view, "back");
});

test("front+back placements produce exactly two images (one per view)", async () => {
  const order = baseOrder();
  const { provider, calls } = captureProvider();
  const assignments: LogoAssignment[] = [
    { logoIndex: 0, placement: "left_chest" },
    { logoIndex: 1, placement: "upper_back" },
  ];
  const results = await generateAiMockups(order, assignments, [LOGO, LOGO], provider);
  assert.equal(results.length, 2);
  assert.equal(calls.length, 2);
  const views = results.map((r) => r.view).sort();
  assert.deepEqual(views, ["back", "front"]);
});

// --- template resolution --------------------------------------------------

test("an order resolves the white silhouette template as its garment reference", async () => {
  const order = baseOrder({ productId: "dry_fit_polo" });
  const ref = await resolveGarmentReference(order, "front");
  assert.equal(ref.source, "legacy-template");
  assert.equal(ref.descriptor.garmentType, "polo");
  const expectedBytes = fs.readFileSync(path.join(TEMPLATES_DIR, "polo_front.png"));
  assert.ok(ref.buffer.equals(expectedBytes));
});
