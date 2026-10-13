/**
 * Script to test the Admin Trigger and Notification flow.
 *
 * Runs notifyAdmins() with a realistic test OrderData and public screenshot URL.
 * Verifies:
 *  1. Admin WhatsApp dispatch (interactive buttons or plain text fallback)
 *  2. Order snapshot in Redis (order:<orderId>)
 *  3. 6-digit approval code generation in Redis (approval:order:<orderId>)
 *  4. Admin authorized chat ID check
 *
 * Usage:
 *   npx tsx scripts/test-admin-trigger.ts
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
import { loadOrderSnapshot } from "../src/session/orderStore.js";
import { isAuthorizedAdmin, normalizeAdminChatId } from "../src/admin/actions.js";
import type { OrderData } from "../src/shared/types.js";

async function main() {
  console.log("==========================================");
  console.log("🧪 TESTING ADMIN NOTIFICATION & APPROVAL TRIGGER");
  console.log("==========================================");

  const env = getEnv();
  console.log(`📌 Channel: ${env.CHANNEL}`);
  console.log(`📌 Admin Chat IDs configured:`, env.ADMIN_CHAT_IDS);
  console.log(`📌 Meta API Base URL: ${env.META_API_BASE_URL}`);
  console.log(`📌 Meta Phone Number ID: ${env.META_PHONE_NUMBER_ID}`);
  console.log(`📌 Emovur Connector ID: ${env.EMOVUR_CONNECTOR_ID || "not set"}`);

  for (const adminId of env.ADMIN_CHAT_IDS) {
    const isAuth = isAuthorizedAdmin(adminId);
    console.log(`   Admin "${adminId}" (normalized: ${normalizeAdminChatId(adminId)}) -> authorized: ${isAuth}`);
  }

  // Create a realistic sample order
  const timestamp = Date.now().toString().slice(-6);
  const testOrderId = `CTW-TEST-${timestamp}`;

  const testOrder: OrderData = {
    orderId: testOrderId,
    status: "Pending Payment",
    orderType: "bulk",
    tier: "standard",
    productId: "dry_fit_polo",
    qty: 100,
    sizeSplit: { S: 10, M: 30, L: 40, XL: 15, XXL: 5, "3XL": 0 },
    printMethod: "screen_print",
    city: "Indore",
    name: "Test Customer (Admin Trigger Verification)",
    phone: "+918660055898",
    timeline: "standard",
    timelineUrgent: false,
    logoReceived: true,
    logos: [
      {
        fileId: "test_logo_1",
        placement: "left_chest"
      }
    ],
    garmentRate: 290,
    garmentTotal: 29000,
    printEstLow: 2500,
    printEstHigh: 3500,
    grandEstLow: 31500,
    grandEstHigh: 32500,
    advanceDue: 14500,
    customerChatId: "wa:918660055898",
    channel: "whatsapp"
  };

  const sampleProofUrl = env.STATIC_QR_URL || "https://picsum.photos/400/400";

  console.log(`\n🚀 Triggering notifyAdmins() for order: ${testOrderId}...`);
  console.log(`   Customer: ${testOrder.name} (${testOrder.phone})`);
  console.log(`   Advance Due: ₹${testOrder.advanceDue}`);
  console.log(`   Screenshot: ${sampleProofUrl}`);

  await notifyAdmins(testOrder, sampleProofUrl);

  console.log("\n✅ notifyAdmins() execution completed.");

  // Verify Redis Order Snapshot
  console.log("\n🔍 Verifying Redis state...");
  const snapshot = await loadOrderSnapshot(testOrderId);
  if (snapshot) {
    console.log(`   ✅ Order snapshot stored in Redis: order:${testOrderId} (status: ${snapshot.status})`);
  } else {
    console.warn(`   ⚠️ Warning: Order snapshot order:${testOrderId} not found in Redis`);
  }

  // Verify 6-digit approval code
  const code = await getActiveApprovalCode("order", testOrderId);
  if (code) {
    console.log(`   ✅ 6-digit approval code generated: [ ${code} ]`);
    console.log(`      Key: approval:order:${testOrderId} -> ${code} (TTL 2 minutes)`);
  } else {
    console.warn(`   ⚠️ Warning: Active approval code not found for order ${testOrderId}`);
  }

  console.log("\n==========================================");
  console.log("📲 VERIFICATION ON WHATSAPP ADMIN PHONE:");
  console.log(`   1. The admin (${env.ADMIN_CHAT_IDS.join(", ")}) should receive:`);
  console.log(`      - The payment proof image`);
  console.log(`      - The Admin Order Card with details & 6-digit approval code: ${code}`);
  console.log(`      - Interactive buttons [✅ Confirm] [🚩 Issue] OR plain-text fallback.`);
  console.log(`   2. To test approval, the admin can either:`);
  console.log(`      - Tap [✅ Confirm], OR`);
  console.log(`      - Reply with: ${code}, OR`);
  console.log(`      - Reply with: CONFIRM ${testOrderId}`);
  console.log("==========================================\n");
}

main().catch((err) => {
  console.error("❌ Admin trigger test failed:", err);
  process.exit(1);
});
