import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { generateMockups } from "../src/mockup/generate.js";
import { PLACEMENT_VIEWS, getZoneForPlacement } from "../src/mockup/zones.js";
import { PRODUCT_SILHOUETTE } from "../src/pricing/priceBook.js";

async function makeTestLogo(): Promise<Buffer> {
  const svg = `
    <svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect width="300" height="300" fill="#e63946" />
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function sampleRgb(buffer: Buffer, xf: number, yf: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const x = Math.round(xf * info.width);
  const y = Math.round(yf * info.height);
  const idx = (y * info.width + x) * info.channels;
  return [data[idx], data[idx + 1], data[idx + 2]];
}

test("every product maps to a known silhouette", () => {
  for (const productId of Object.keys(PRODUCT_SILHOUETTE) as (keyof typeof PRODUCT_SILHOUETTE)[]) {
    const silhouette = PRODUCT_SILHOUETTE[productId];
    assert.ok(silhouette === "round_neck" || silhouette === "polo");
  }
});

test("each placement maps to exactly one template view", () => {
  assert.equal(PLACEMENT_VIEWS.left_chest, "front");
  assert.equal(PLACEMENT_VIEWS.center_front, "front");
  assert.equal(PLACEMENT_VIEWS.upper_back, "back");
  assert.equal(PLACEMENT_VIEWS.left_sleeve, "front");
  assert.equal(PLACEMENT_VIEWS.right_sleeve, "front");
});

test("left and right sleeve are distinct, mirrored zones", () => {
  const left = getZoneForPlacement("left_sleeve");
  const right = getZoneForPlacement("right_sleeve");
  assert.notDeepEqual(left, right);
  // Mirrored horizontally: left sleeve sits near the right edge of a
  // front-facing photo (wearer's left arm), right sleeve near the left edge.
  assert.ok(left.x > 0.5);
  assert.ok(right.x < 0.5);
});

test("generateMockups composites the logo at the correct zone (left_chest)", async () => {
  const logo = await makeTestLogo();
  const results = await generateMockups("cotton_polo", "left_chest", logo);
  assert.equal(results.length, 1);
  assert.equal(results[0].view, "front");

  const zone = getZoneForPlacement("left_chest");
  const centerX = zone.x + zone.width / 2;
  const centerY = zone.y + zone.height / 2;
  const [r, g, b] = await sampleRgb(results[0].buffer, centerX, centerY);
  // Test logo is solid #e63946 (230,57,70); allow encoding tolerance.
  assert.ok(Math.abs(r - 230) < 15, `r=${r}`);
  assert.ok(Math.abs(g - 57) < 15, `g=${g}`);
  assert.ok(Math.abs(b - 70) < 15, `b=${b}`);
});

test("generateMockups for upper_back renders the back view", async () => {
  const logo = await makeTestLogo();
  const results = await generateMockups("dry_fit_round_neck", "upper_back", logo);
  assert.equal(results.length, 1);
  assert.equal(results[0].view, "back");
});

test("generateMockups output dimensions match the template dimensions", async () => {
  const logo = await makeTestLogo();
  const [result] = await generateMockups("cotton_round_neck", "center_front", logo);
  const meta = await sharp(result.buffer).metadata();
  assert.equal(meta.width, 1024);
  assert.equal(meta.height, 1024);
});
