/**
 * Deterministic (no-AI) proof-compositing tests.
 *
 * Proves the customer-facing print proof:
 *  - preserves the reference image EXACTLY outside the logo placement zone
 *    (every pixel outside is the untouched base),
 *  - places the ORIGINAL logo pixels inside the zone (logo colour appears
 *    where it should — never recoloured/redrawn),
 *  - produces one output per requested view (front-only → 1, front+back → 2),
 *  - uses the generic template ONLY for a legacy order (no catalog data).
 */
import "./support/testEnv.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  compositeLogosOntoBase,
  generateDeterministicMockups,
} from "../src/mockup/composite.js";
import { getZoneForPlacement } from "../src/mockup/zones.js";
import type { LogoAssignment } from "../src/mockup/promptBuilder.js";
import type { OrderData } from "../src/shared/types.js";

const W = 1000;
const H = 1000;

/** Solid-colour RGB image of W×H. */
async function solidImage(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({ create: { width: W, height: H, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer();
}

/** Solid square logo (side px) in a distinct colour. */
async function squareLogo(side: number, r: number, g: number, b: number): Promise<Buffer> {
  return sharp({ create: { width: side, height: side, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer();
}

/** Reads the RGB of a single pixel from a PNG buffer. */
async function pixelAt(buffer: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return [data[idx], data[idx + 1], data[idx + 2]];
}

const BASE = { r: 200, g: 30, b: 30 }; // distinctive red garment
const LOGO = { r: 20, g: 40, b: 220 }; // distinctive blue logo

test("reference pixels OUTSIDE the logo zone are preserved exactly; logo pixels appear INSIDE the zone", async () => {
  const base = await solidImage(BASE.r, BASE.g, BASE.b);
  // A square logo big enough that, under 'contain' into the (non-square)
  // zone box, it fills the box's shorter dimension and its centre lands on
  // the zone centre.
  const logo = await squareLogo(300, LOGO.r, LOGO.g, LOGO.b);

  const assignments: LogoAssignment[] = [{ logoIndex: 0, placement: "left_chest" }];
  const out = await compositeLogosOntoBase(base, "front", assignments, [logo]);

  // Output keeps the base dimensions.
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, W);
  assert.equal(meta.height, H);

  // A far corner is well outside any zone -> must be the untouched base.
  const corner = await pixelAt(out, 5, 5);
  assert.deepEqual(corner, [BASE.r, BASE.g, BASE.b], "pixel outside the zone must equal the reference exactly");

  // The centre of the left_chest zone -> must be the logo colour.
  const zone = getZoneForPlacement("left_chest");
  const cx = Math.round((zone.x + zone.width / 2) * W);
  const cy = Math.round((zone.y + zone.height / 2) * H);
  const centre = await pixelAt(out, cx, cy);
  assert.deepEqual(centre, [LOGO.r, LOGO.g, LOGO.b], "logo colour must appear at the placement zone centre");
});

test("a point just outside the zone box stays exactly the reference colour", async () => {
  const base = await solidImage(BASE.r, BASE.g, BASE.b);
  const logo = await squareLogo(300, LOGO.r, LOGO.g, LOGO.b);
  const out = await compositeLogosOntoBase(base, "front", [{ logoIndex: 0, placement: "left_chest" }], [logo]);

  const zone = getZoneForPlacement("left_chest");
  const zoneLeft = Math.round(zone.x * W);
  const zoneTop = Math.round(zone.y * H);
  // 5px up-and-left of the zone's top-left corner is outside the overlay.
  const outside = await pixelAt(out, Math.max(0, zoneLeft - 5), Math.max(0, zoneTop - 5));
  assert.deepEqual(outside, [BASE.r, BASE.g, BASE.b]);
});

// --- view counts + legacy fallback (via the full pipeline) ------------

function legacyOrder(logos: OrderData["logos"]): OrderData {
  return {
    orderId: "CTW-LEGACY-01",
    status: "Confirmed",
    tier: "basic",
    productId: "cotton_round_neck",
    // no catalogSelection -> legacy order, allowed to use the generic template
    qty: 60,
    sizeSplit: { S: 10, M: 15, L: 15, XL: 10, XXL: 5, "3XL": 5 },
    printMethod: "dtf",
    city: "Pune",
    name: "Test",
    phone: "9876543210",
    timeline: "standard",
    timelineUrgent: false,
    logoReceived: true,
    logos,
    garmentRate: 100,
    garmentTotal: 6000,
    printEstLow: 100,
    printEstHigh: 200,
    grandEstLow: 6100,
    grandEstHigh: 6200,
    advanceDue: 3000,
    customerChatId: "tg:12345",
    channel: "telegram",
  };
}

test("front-only produces ONE output; front+back produces TWO — legacy order uses the generic template", async () => {
  const logo = await squareLogo(200, LOGO.r, LOGO.g, LOGO.b);

  const frontOnly = await generateDeterministicMockups(
    legacyOrder([{ fileId: "l", placement: "left_chest" }]),
    [{ logoIndex: 0, placement: "left_chest" }],
    [logo],
  );
  assert.equal(frontOnly.length, 1);
  assert.equal(frontOnly[0].view, "front");
  assert.equal(frontOnly[0].referenceSource, "legacy-template");

  const frontAndBack = await generateDeterministicMockups(
    legacyOrder([
      { fileId: "l1", placement: "left_chest" },
      { fileId: "l2", placement: "upper_back" },
    ]),
    [
      { logoIndex: 0, placement: "left_chest" },
      { logoIndex: 1, placement: "upper_back" },
    ],
    [logo, logo],
  );
  assert.equal(frontAndBack.length, 2);
  assert.deepEqual(
    frontAndBack.map((r) => r.view).sort(),
    ["back", "front"],
  );
});
