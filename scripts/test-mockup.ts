import fs from "fs";
import "dotenv/config";
import { deliverMockupForOrder } from "../src/mockup/deliver.js";
import { OrderData } from "../src/shared/types.js";

async function run() {
  const adminPhone = "wa:919742595677"; // Sending to the admin for testing
  
  // Minimal order data needed for the mockup generator
  const testOrder: OrderData = {
    orderId: "TEST-MOCKUP-001",
    status: "Pending Payment",
    orderType: "bulk",
    tier: "standard",
    productId: "dry_fit_round_neck",
    qty: 50,
    sizeSplit: { S: 10, M: 20, L: 20, XL: 0, XXL: 0, "3XL": 0 },
    printMethod: "screen_print",
    city: "Bangalore",
    name: "Admin",
    phone: "919742595677",
    timeline: "standard",
    timelineUrgent: false,
    
    // Crucial for mockup:
    logoReceived: true,
    logos: [
      {
        fileId: "dummy-file-id", // will be ignored by our mock fetcher
        placement: "left_chest"
      }
    ],
    
    // Catalog selection gives us the background garment reference
    catalogSelection: {
      catalogVersion: "test",
      tier: "standard",
      groupId: "mens_polos",
      groupLabel: "Men's Polos",
      itemId: "finch-bio-wash",
      itemLabel: "Finch Bio Wash",
      productId: "dry_fit_round_neck",
      garmentType: "round_neck",
      sourceId: "finch",
      sourcePage: 1,
      colorName: "Black",
      referenceImageKind: "placeholder",
      mockupEligible: true,
    },
    
    garmentRate: 200,
    garmentTotal: 10000,
    printEstLow: 1000,
    printEstHigh: 1500,
    grandEstLow: 11000,
    grandEstHigh: 11500,
    advanceDue: 5000,
    customerChatId: adminPhone,
    channel: "whatsapp"
  };

  // Read the user uploaded logo image
  const dummyLogoPng = fs.readFileSync("C:/Users/Suraj/.gemini/antigravity-ide/brain/d8b35a1b-87ac-42cf-824e-bf8c8724581d/.user_uploaded/media_1791647445654.jpg");

  console.log("Starting E2E Mockup Delivery Test...");
  console.log("Mocking logo download, generating composite, uploading to Vercel Blob, but skipping WhatsApp send...");

  try {
    const outcome = await deliverMockupForOrder(testOrder, {
      // Inject a fake fetcher that just returns our dummy logo instead of hitting WhatsApp API
      fetchLogo: async (fileId) => {
        console.log(`[test] Mocked fetchLogo called for fileId: ${fileId}`);
        return dummyLogoPng;
      },
      // Mock sending so we don't spam the admin
      sendPhoto: async (_chatId, url, _filename, _caption) => {
        console.log(`[test] Mocked sendPhoto called! URL: ${url}`);
        return "mock-message-id";
      }
    });

    console.log("Test Outcome:");
    console.log(JSON.stringify(outcome, null, 2));

    if (outcome.delivered) {
      console.log("✅ Mockup delivered successfully! Check your WhatsApp.");
    } else {
      console.log("❌ Mockup not delivered:", outcome.reason);
    }
  } catch (err) {
    console.error("Test script failed:", err);
  }
}

run().catch(console.error);
