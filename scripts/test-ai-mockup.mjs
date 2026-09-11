/**
 * Standalone test: generates a real AI mockup, so you can judge quality
 * before wiring this into the live bot.
 *
 * Usage (Gemini, free tier — default):
 *   set GEMINI_API_KEY=AIza...
 *   node scripts/test-ai-mockup.mjs <path-to-logo-image> [placement] [product]
 *
 * Usage (OpenRouter instead):
 *   set MOCKUP_IMAGE_PROVIDER=openrouter
 *   set OPENROUTER_API_KEY=sk-or-v1-...
 *   node scripts/test-ai-mockup.mjs <path-to-logo-image> [placement] [product]
 *
 * placement: left_chest | center_front | upper_back | sleeve (default: left_chest)
 * product:   dry_fit_round_neck | dry_fit_polo | cotton_round_neck | cotton_polo (default: cotton_polo)
 *
 * Output is saved as ./test-mockup-output-<view>.png in the project root.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Load .env so getEnv() (which requires all bot config vars, not just the
// mockup-related ones) is satisfied when running this script standalone.
const envContent = await readFile(new URL("../.env", import.meta.url), "utf8").catch(() => "");
for (const line of envContent.split(/\r?\n/)) {
  if (!line.trim() || line.startsWith("#")) continue;
  const idx = line.indexOf("=");
  if (idx === -1) continue;
  const key = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).split(" #")[0].trim();
  if (!process.env[key] && value) process.env[key] = value;
}

const logoPath = process.argv[2];
const placement = process.argv[3] || "left_chest";
const product = process.argv[4] || "cotton_polo";
const provider = (process.env.MOCKUP_IMAGE_PROVIDER || "gemini").toLowerCase();

if (!logoPath) {
  console.error("Usage: node scripts/test-ai-mockup.mjs <path-to-logo-image> [placement] [product]");
  process.exit(1);
}
if (provider === "gemini" && !process.env.GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY in environment.");
  process.exit(1);
}
if (provider === "openrouter" && !process.env.OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY in environment.");
  process.exit(1);
}

const { generateAiMockups } = await import("../src/mockup/generateAi.ts");

const logoBuffer = await readFile(path.resolve(logoPath));

console.log(`Generating mockup: product=${product} placement=${placement} logo=${logoPath} provider=${provider}`);
console.log(provider === "gemini" ? "Calling Gemini (free tier)..." : "Calling OpenRouter... (this costs real credits)");

const order = {
  orderId: "CTW-TEST-AI",
  status: "Pending Payment",
  tier: "basic",
  productId: product,
  qty: 60,
  sizeSplit: { S: 10, M: 20, L: 20, XL: 10, XXL: 0, "3XL": 0 },
  printMethod: "dtf",
  city: "Mumbai",
  name: "Test User",
  phone: "9876543210",
  timeline: "standard",
  timelineUrgent: false,
  logoReceived: true,
  logos: [{ fileId: "test", placement }],
  garmentRate: 359,
  garmentTotal: 21540,
  printEstLow: 2000,
  printEstHigh: 3000,
  grandEstLow: 23540,
  grandEstHigh: 24540,
  advanceDue: 10770,
  customerChatId: "tg:123456",
  channel: "telegram",
};

const start = Date.now();
const results = await generateAiMockups(
  order,
  [{ logoIndex: 0, placement }],
  [logoBuffer],
);
const elapsedMs = Date.now() - start;

for (const result of results) {
  const outPath = `test-mockup-output-${result.view}.png`;
  await writeFile(outPath, result.buffer);
  console.log(`Saved ${outPath} (${result.buffer.length} bytes)`);
  console.log(`Cost: ${result.costUsd !== undefined ? `$${result.costUsd}` : "unknown (not reported)"}`);
}
console.log(`Took ${elapsedMs}ms`);
