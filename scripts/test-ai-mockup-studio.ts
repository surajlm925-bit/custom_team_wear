import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { generateAiMockups } from "../src/mockup/generateAi.js";
import type { OrderData } from "../src/shared/types.js";
import type { LogoAssignment } from "../src/mockup/promptBuilder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = path.resolve("C:/Users/Suraj/.gemini/antigravity-ide/brain/975e2ef0-897e-439e-a214-361ede9b6cc2");

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

function createSampleBadge(text: string, primaryColor = "#E65100", secondaryColor = "#FFFFFF"): Promise<Buffer> {
  const svg = `
    <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${primaryColor}" />
          <stop offset="100%" stop-color="#BF360C" />
        </linearGradient>
      </defs>
      <circle cx="256" cy="256" r="230" fill="url(#g)" stroke="${secondaryColor}" stroke-width="12" />
      <polygon points="256,70 310,180 430,195 340,280 365,400 256,340 147,400 172,280 82,195 202,180" fill="${secondaryColor}" />
      <text x="256" y="460" font-family="Arial, sans-serif" font-size="36" font-weight="900" fill="${secondaryColor}" text-anchor="middle" letter-spacing="4">${text}</text>
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function run() {
  console.log("=== Testing Studio Lighting Mockup Generation ===");
  const logo = await createSampleBadge("TITANS FC");

  // Test 1: Navy Blue Polo with Left Chest Logo & Embroidery
  console.log("\n[1/2] Generating Navy Blue Polo (Vision Hex #202335) with 3D Embroidery...");
  const orderPolo: OrderData = {
    orderId: "TEST-NAVY-POLO",
    status: "Pending Payment",
    tier: "basic",
    productId: "cotton_polo",
    qty: 100,
    sizeSplit: { S: 0, M: 50, L: 50, XL: 0, XXL: 0, "3XL": 0 },
    printMethod: "embroidery",
    city: "Mumbai",
    name: "Test Customer",
    phone: "9876543210",
    timeline: "standard",
    timelineUrgent: false,
    logoReceived: true,
    catalogSelection: {
      catalogVersion: "v1",
      tier: "basic",
      groupId: "cotton",
      groupLabel: "Cotton",
      itemId: "val-cp-1-uf-008",
      itemLabel: "UF 008 Cotton Polo",
      productId: "cotton_polo",
      garmentType: "polo",
      sourceId: "catalog",
      sourcePage: 1,
      colorName: "Navy Blue",
      referenceImageKind: "placeholder",
      mockupEligible: true,
    },
    logos: [{ fileId: "logo-1", placement: "left_chest" }],
  } as unknown as OrderData;

  const assignmentsPolo: LogoAssignment[] = [{ logoIndex: 0, placement: "left_chest" }];
  const resultsPolo = await generateAiMockups(orderPolo, assignmentsPolo, [logo]);
  console.log(`Generated ${resultsPolo.length} polo view(s).`);

  for (const r of resultsPolo) {
    const filename = `studio_lighting_navy_polo_${r.view}.png`;
    const outPath = path.join(ARTIFACT_DIR, filename);
    await fs.writeFile(outPath, r.buffer);
    console.log(`Saved: ${outPath} (${r.buffer.length} bytes, cost: $${r.costUsd ?? 0})`);
  }

  // Test 2: Crisp Studio White Cotton Round Neck with Center Front Screen Print
  console.log("\n[2/2] Generating White Cotton Round Neck with Screen Print...");
  const orderWhite: OrderData = {
    orderId: "TEST-WHITE-TEE",
    status: "Pending Payment",
    tier: "basic",
    productId: "cotton_round_neck",
    qty: 100,
    sizeSplit: { S: 0, M: 50, L: 50, XL: 0, XXL: 0, "3XL": 0 },
    printMethod: "screen_print",
    city: "Bangalore",
    name: "Test Customer",
    phone: "9876543210",
    timeline: "standard",
    timelineUrgent: false,
    logoReceived: true,
    catalogSelection: {
      catalogVersion: "v1",
      tier: "basic",
      groupId: "cotton",
      groupLabel: "Cotton",
      itemId: "val-rn-1-finch",
      itemLabel: "Finch Bio Wash Round Neck",
      productId: "cotton_round_neck",
      garmentType: "round_neck",
      sourceId: "catalog",
      sourcePage: 1,
      colorName: "White",
      referenceImageKind: "placeholder",
      mockupEligible: true,
    },
    logos: [{ fileId: "logo-1", placement: "center_front" }],
  } as unknown as OrderData;

  const assignmentsWhite: LogoAssignment[] = [{ logoIndex: 0, placement: "center_front" }];
  const resultsWhite = await generateAiMockups(orderWhite, assignmentsWhite, [logo]);
  console.log(`Generated ${resultsWhite.length} white t-shirt view(s).`);

  for (const r of resultsWhite) {
    const filename = `studio_lighting_white_tee_${r.view}.png`;
    const outPath = path.join(ARTIFACT_DIR, filename);
    await fs.writeFile(outPath, r.buffer);
    console.log(`Saved: ${outPath} (${r.buffer.length} bytes, cost: $${r.costUsd ?? 0})`);
  }

  console.log("\n=== Test Generation Finished Successfully! ===");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
