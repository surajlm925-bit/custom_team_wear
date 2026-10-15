/**
 * Script to test the Email Dispatcher and 2-Step OTP Approval Portal.
 *
 * Verifies:
 *  1. Admin email recipient loading from .env
 *  2. 30-minute approval code generation in Redis
 *  3. Cryptographic HMAC portal token generation
 *  4. Resend email dispatch (or mock simulation)
 *  5. Direct fail-safe URL generation
 *
 * Usage:
 *   npx tsx scripts/test-admin-email-portal.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

// Load .env before imports
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const envFile = path.join(__dirname, "..", ".env");
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[k] = v;
    }
  }
}

import { getEnv } from "../src/config/env.js";
import { notifyAdmins } from "../src/admin/notify.js";
import { getActiveApprovalCode } from "../src/admin/approvalCode.js";
import { createPortalToken, getPortalUrl, getResendOtpUrl } from "../src/admin/approvalToken.js";
import { loadOrderSnapshot } from "../src/session/orderStore.js";
import type { OrderData } from "../src/shared/types.js";

async function main() {
  console.log("==================================================================");
  console.log("🧪 TESTING EMAIL + 2-STEP OTP APPROVAL PORTAL WITH FAIL-SAFE");
  console.log("==================================================================");

  const env = getEnv();
  console.log(`📌 Admin Emails configured:`, env.ADMIN_EMAILS);
  console.log(`📌 Email From: ${env.ADMIN_EMAIL_FROM}`);
  console.log(`📌 Resend API Key: ${env.RESEND_API_KEY ? env.RESEND_API_KEY.slice(0, 7) + "..." : "Not configured (simulation mode)"}`);
  console.log(`📌 Public Base URL: ${env.PUBLIC_BASE_URL || "Default / Vercel system"}`);

  const orderId = `CTW-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-TEST`;

  const testOrder: OrderData = {
    orderId,
    status: "Pending Payment",
    tier: "standard",
    productId: "dry_fit_round_neck",
    catalogItemName: "Standard Cotton Polo",
    catalogColor: "Navy Blue",
    qty: 150,
    sizeSplit: { S: 25, M: 25, L: 25, XL: 25, XXL: 25, "3XL": 25 },
    printMethod: "screen_print",
    city: "Bihar",
    name: "Tunga",
    phone: "918660099382",
    timeline: "standard",
    timelineUrgent: false,
    logoReceived: true,
    logos: [{ fileId: "test_logo_id", placement: "left_chest" }],
    garmentRate: 359,
    garmentTotal: 53850,
    printEstLow: 3750,
    printEstHigh: 5250,
    grandEstLow: 57600,
    grandEstHigh: 59100,
    advanceDue: 26925,
    customerChatId: "wa:918660099382",
    channel: "whatsapp",
    paymentScreenshotUrl: "https://placehold.co/600x800/png?text=Payment+Screenshot+Preview",
  };

  console.log(`\n📦 Triggering notifyAdmins for ${orderId}...`);
  await notifyAdmins(testOrder, testOrder.paymentScreenshotUrl!);

  // Verify in Redis
  const activeCode = await getActiveApprovalCode("order", orderId);
  const snapshot = await loadOrderSnapshot(orderId);
  const token = createPortalToken(orderId);
  const portalUrl = getPortalUrl(orderId, token);
  const resendUrl = getResendOtpUrl(orderId, token);

  console.log("\n✅ VERIFICATION RESULTS:");
  console.log(`   • Order Snapshot in Redis: ${snapshot ? "SAVED ✅" : "MISSING ❌"}`);
  console.log(`   • Active 6-digit OTP in Redis: [ ${activeCode} ] (Valid for 30 minutes)`);
  console.log(`   • Customer Chat ID (Clean): ${snapshot?.customerChatId}`);

  console.log("\n🔗 GENERATED PORTAL LINKS:");
  console.log(`   👉 Primary Review & Approval Portal URL:`);
  console.log(`      ${portalUrl}`);
  console.log(`\n   🔄 Fail-Safe Secondary OTP URL (Beyond 30 mins):`);
  console.log(`      ${resendUrl}`);

  console.log("\n==================================================================");
  console.log("🎉 TEST COMPLETE!");
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
