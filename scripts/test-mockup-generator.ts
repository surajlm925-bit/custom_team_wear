/**
 * Standalone automated test script for Mockup Generation.
 *
 * Tests:
 * 1. Generating deterministic Sharp mockups on round neck and polo silhouettes.
 * 2. Testing multiple placements: left_chest, center_front, upper_back, left_sleeve, right_sleeve.
 * 3. Multi-logo compositing (front + back simultaneous).
 * 4. Saving high-resolution output PNGs to ./mockup-test-output/ for visual verification.
 * 5. Testing Vercel Blob storage upload if BLOB_READ_WRITE_TOKEN is configured.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { generateDeterministicMockups } from "../src/mockup/composite.js";
import { generateMockups } from "../src/mockup/generate.js";
import { getZoneForPlacement } from "../src/mockup/zones.js";
import type { OrderData } from "../src/shared/types.js";
import type { LogoAssignment } from "../src/mockup/promptBuilder.js";
import { uploadMockupImage } from "../src/storage/blob.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../mockup-test-output");

// Load .env
const envFile = path.resolve(__dirname, "../.env");
try {
  const content = await fs.readFile(envFile, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    const h = v.indexOf("#");
    if (h > 0 && !v.slice(0, h).includes("://")) v = v.slice(0, h).trim();
    if (!process.env[k] && v) process.env[k] = v;
  }
} catch {}

/**
 * Creates a high-fidelity test badge logo with transparency and gradient styling
 */
async function makeBadgeLogo(text: string, primaryColor = "#0052cc", secondaryColor = "#ffab00"): Promise<Buffer> {
  const svg = `
    <svg width="600" height="600" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${primaryColor}" />
          <stop offset="100%" stop-color="#0747a6" />
        </linearGradient>
        <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="0" dy="8" stdDeviation="12" flood-opacity="0.3"/>
        </filter>
      </defs>
      <!-- Outer Ring -->
      <circle cx="300" cy="300" r="270" fill="none" stroke="${secondaryColor}" stroke-width="16" />
      <circle cx="300" cy="300" r="250" fill="url(#shieldGrad)" filter="url(#shadow)" />
      
      <!-- Shield Emblem -->
      <path d="M 300 120 L 410 180 V 310 C 410 390 300 450 300 450 C 300 450 190 390 190 310 V 180 Z" fill="#ffffff" fill-opacity="0.15" />
      
      <!-- Stars -->
      <polygon points="300,160 312,196 350,196 320,218 331,254 300,232 269,254 280,218 250,196 288,196" fill="${secondaryColor}" />
      
      <!-- Brand Text -->
      <text x="300" y="320" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="52" fill="#ffffff" text-anchor="middle" letter-spacing="3">${text}</text>
      <text x="300" y="365" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="24" fill="${secondaryColor}" text-anchor="middle" letter-spacing="5">ATHLETICS</text>
      <text x="300" y="405" font-family="Arial, Helvetica, sans-serif" font-weight="600" font-size="18" fill="#e0e0e0" text-anchor="middle">EST. 2026</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Creates a back typography sponsor logo
 */
async function makeSponsorLogo(): Promise<Buffer> {
  const svg = `
    <svg width="1000" height="400" viewBox="0 0 1000 400" xmlns="http://www.w3.org/2000/svg">
      <rect width="1000" height="400" rx="40" fill="#172b4d" fill-opacity="0.9" />
      <text x="500" y="180" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="95" fill="#36b37e" text-anchor="middle" letter-spacing="8">SUPERSPORTS</text>
      <text x="500" y="270" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="40" fill="#ffffff" text-anchor="middle" letter-spacing="14">GLOBAL CHAMPIONSHIP</text>
      <line x1="200" y1="310" x2="800" y2="310" stroke="#ffab00" stroke-width="6" />
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function mockOrder(id: string, productId: OrderData["productId"], logos: OrderData["logos"]): OrderData {
  return {
    orderId: id,
    status: "Pending Payment",
    tier: "basic",
    productId,
    qty: 100,
    sizeSplit: { S: 20, M: 30, L: 30, XL: 20, XXL: 0, "3XL": 0 },
    printMethod: "dtf",
    city: "Mumbai",
    name: "Suraj Admin",
    phone: "9876543210",
    timeline: "standard",
    timelineUrgent: false,
    logoReceived: true,
    logos,
    garmentRate: 359,
    garmentTotal: 35900,
    printEstLow: 4000,
    printEstHigh: 6000,
    grandEstLow: 39900,
    grandEstHigh: 41900,
    advanceDue: 17950,
    customerChatId: "tg:5185248767",
    channel: "telegram",
  };
}

async function run() {
  console.log("==================================================");
  console.log("🎨 CUSTOM TEAM WEAR — MOCKUP GENERATION TEST SUITE");
  console.log("==================================================\n");

  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log("1. Generating high-resolution test logos...");
  const chestLogo = await makeBadgeLogo("TITANS", "#0052cc", "#ffab00");
  const sponsorLogo = await makeSponsorLogo();
  const chestLogoPath = path.join(OUT_DIR, "input_chest_logo.png");
  const sponsorLogoPath = path.join(OUT_DIR, "input_sponsor_logo.png");
  await fs.writeFile(chestLogoPath, chestLogo);
  await fs.writeFile(sponsorLogoPath, sponsorLogo);
  console.log(`   ✓ Chest badge saved to: ${chestLogoPath} (${chestLogo.length} bytes)`);
  console.log(`   ✓ Back sponsor logo saved to: ${sponsorLogoPath} (${sponsorLogo.length} bytes)\n`);

  // Test 1: Single Placement (Left Chest) on Round Neck
  console.log("2. Testing Round Neck — Left Chest Badge (Front View)...");
  {
    const order = mockOrder("CTW-RN-CHEST", "dry_fit_round_neck", [{ fileId: "f1", placement: "left_chest" }]);
    const assignments: LogoAssignment[] = [{ logoIndex: 0, placement: "left_chest" }];
    const results = await generateDeterministicMockups(order, assignments, [chestLogo]);

    if (results.length !== 1 || results[0].view !== "front") {
      throw new Error(`Expected 1 front view result, got ${results.length}`);
    }
    const meta = await sharp(results[0].buffer).metadata();
    const outPath = path.join(OUT_DIR, "round_neck_left_chest_front.png");
    await fs.writeFile(outPath, results[0].buffer);
    console.log(`   ✓ Dimensions: ${meta.width}x${meta.height}, format: ${meta.format}, size: ${results[0].buffer.length} bytes`);
    console.log(`   ✓ Output saved: ${outPath}`);
  }

  // Test 2: Center Front on Round Neck
  console.log("\n3. Testing Round Neck — Center Front (Front View)...");
  {
    const order = mockOrder("CTW-RN-CENTER", "dry_fit_round_neck", [{ fileId: "f1", placement: "center_front" }]);
    const assignments: LogoAssignment[] = [{ logoIndex: 0, placement: "center_front" }];
    const results = await generateDeterministicMockups(order, assignments, [chestLogo]);

    const meta = await sharp(results[0].buffer).metadata();
    const outPath = path.join(OUT_DIR, "round_neck_center_front.png");
    await fs.writeFile(outPath, results[0].buffer);
    console.log(`   ✓ Dimensions: ${meta.width}x${meta.height}, size: ${results[0].buffer.length} bytes`);
    console.log(`   ✓ Output saved: ${outPath}`);
  }

  // Test 3: Dual View (Left Chest Front + Upper Back Sponsor) on Polo Shirt
  console.log("\n4. Testing Polo Shirt — Dual Placement (Front: Left Chest + Back: Upper Back)...");
  {
    const order = mockOrder("CTW-POLO-DUAL", "cotton_polo", [
      { fileId: "f1", placement: "left_chest" },
      { fileId: "f2", placement: "upper_back" },
    ]);
    const assignments: LogoAssignment[] = [
      { logoIndex: 0, placement: "left_chest" },
      { logoIndex: 1, placement: "upper_back" },
    ];
    const results = await generateDeterministicMockups(order, assignments, [chestLogo, sponsorLogo]);

    if (results.length !== 2) {
      throw new Error(`Expected 2 views (front + back), got ${results.length}`);
    }

    for (const res of results) {
      const meta = await sharp(res.buffer).metadata();
      const outPath = path.join(OUT_DIR, `polo_dual_${res.view}.png`);
      await fs.writeFile(outPath, res.buffer);
      console.log(`   ✓ [${res.view.toUpperCase()}] Dimensions: ${meta.width}x${meta.height}, size: ${res.buffer.length} bytes`);
      console.log(`   ✓ Saved: ${outPath}`);
    }
  }

  // Test 4: Sleeve Placement on Polo
  console.log("\n5. Testing Polo Shirt — Left Sleeve & Right Sleeve Placements...");
  {
    const zoneLeft = getZoneForPlacement("left_sleeve");
    const zoneRight = getZoneForPlacement("right_sleeve");
    console.log(`   ✓ Zone Left Sleeve:  x=${zoneLeft.x}, y=${zoneLeft.y}, w=${zoneLeft.width}, h=${zoneLeft.height}`);
    console.log(`   ✓ Zone Right Sleeve: x=${zoneRight.x}, y=${zoneRight.y}, w=${zoneRight.width}, h=${zoneRight.height}`);

    const order = mockOrder("CTW-POLO-SLEEVE", "cotton_polo", [{ fileId: "f1", placement: "left_sleeve" }]);
    const assignments: LogoAssignment[] = [{ logoIndex: 0, placement: "left_sleeve" }];
    const results = await generateDeterministicMockups(order, assignments, [chestLogo]);

    const outPath = path.join(OUT_DIR, "polo_left_sleeve_front.png");
    await fs.writeFile(outPath, results[0].buffer);
    console.log(`   ✓ Sleeve mockup saved: ${outPath}`);
  }

  // Test 5: Legacy generateMockups API compatibility
  console.log("\n6. Testing generateMockups legacy adapter API...");
  {
    const legacyRes = await generateMockups("cotton_round_neck", "upper_back", sponsorLogo);
    if (legacyRes.length !== 1 || legacyRes[0].view !== "back") {
      throw new Error("generateMockups failed");
    }
    const outPath = path.join(OUT_DIR, "legacy_round_neck_upper_back.png");
    await fs.writeFile(outPath, legacyRes[0].buffer);
    console.log(`   ✓ Legacy adapter produced back view successfully: ${outPath}`);
  }

  // Test 6: Cloud Blob Upload (if token configured)
  console.log("\n7. Testing Cloud Storage (Vercel Blob) upload of generated mockup...");
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const testBuffer = await fs.readFile(path.join(OUT_DIR, "polo_dual_front.png"));
    const uploadResult = await uploadMockupImage(
      `mockups/test-run-preview/front.png`,
      testBuffer,
      "image/png"
    );
    console.log(`   ✓ Uploaded to Vercel Blob successfully!`);
    console.log(`   ✓ Public CDN URL: ${uploadResult.url}`);
    console.log(`   ✓ Storage Path:   ${uploadResult.pathname}`);
  } else {
    console.log("   [SKIP] BLOB_READ_WRITE_TOKEN not found in environment.");
  }

  console.log("\n==================================================");
  console.log("✅ ALL MOCKUP GENERATION TESTS COMPLETED SUCCESSFULLY!");
  console.log(`📁 All outputs generated in: ${OUT_DIR}`);
  console.log("==================================================");
}

run().catch((err) => {
  console.error("\n❌ Mockup generation test failed:", err);
  process.exit(1);
});
