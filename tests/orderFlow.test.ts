import "./support/testEnv.js";
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { FakeRedis } from "./support/fakeRedis.js";
import { __setRedisForTests } from "../src/session/redisClient.js";
import { handleWhatsAppMessage } from "../src/conversation/orderFlow.js";
import { loadDraft } from "../src/session/draftStore.js";
import { COPY } from "../src/conversation/copy.js";
import { CATALOG_DRIVE_FOLDER_URL } from "../src/catalog/downloads.js";

let redis: FakeRedis;
let sentMessages: Array<{ to: string; type?: string; text?: { body: string }; interactive?: any }> = [];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  redis = new FakeRedis();
  __setRedisForTests(redis);
  sentMessages = [];

  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: any, init: any) => {
    if (init?.body) {
      try {
        const parsed = JSON.parse(String(init.body));
        sentMessages.push(parsed);
      } catch {
        // ignore non-json
      }
    }
    return new Response(JSON.stringify({ messages: [{ id: "mock_wamid" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as any;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const CHAT = "919876543210";

function textMsg(body: string) {
  return { type: "text", text: { body } };
}

function buttonReply(id: string, title: string) {
  return {
    type: "interactive",
    interactive: {
      type: "button_reply",
      button_reply: { id, title },
    },
  };
}

function listReply(id: string, title: string) {
  return {
    type: "interactive",
    interactive: {
      type: "list_reply",
      list_reply: { id, title },
    },
  };
}

function imageMsg(id: string) {
  return {
    type: "image",
    image: { id },
  };
}

test("greeting sends 3 menu buttons including catalog download option", async () => {
  await handleWhatsAppMessage(CHAT, textMsg("Hi"));

  assert.ok(sentMessages.length >= 1);
  const last = sentMessages[sentMessages.length - 1];
  assert.equal(last.interactive?.type, "button");
  const buttons = last.interactive?.action?.buttons;
  assert.equal(buttons.length, 3);
  assert.equal(buttons[0].reply.id, "order:bulk");
  assert.equal(buttons[1].reply.id, "order:sample");
  assert.equal(buttons[2].reply.id, "order:catalogs");
  assert.equal(buttons[2].reply.title, COPY.catalogsMenuTitle);
});

test("selecting 'order:catalogs' sends the complete catalog list with Drive links", async () => {
  await handleWhatsAppMessage(CHAT, buttonReply("order:catalogs", "📥 Download Catalogs"));

  const catalogMsg = sentMessages.find((m) => m.text?.body?.includes("Custom Teamwear — Product Catalogs"));
  assert.ok(catalogMsg, "must send catalog list message");
  assert.ok(catalogMsg.text?.body.includes(CATALOG_DRIVE_FOLDER_URL));
  assert.ok(catalogMsg.text?.body.includes("Adidas Catalogue"));
  assert.ok(catalogMsg.text?.body.includes("Cotton Polo"));

  // Draft remains at orderType so customer can choose Bulk or Sample next
  const draft = await loadDraft(CHAT);
  assert.equal(draft?.orderType, undefined);
});

test("querying specific brand keyword sends that catalog's direct link", async () => {
  await handleWhatsAppMessage(CHAT, textMsg("adidas"));

  const brandMsg = sentMessages.find((m) => m.text?.body?.includes("Adidas Catalogue"));
  assert.ok(brandMsg, "must return Adidas catalog details");
  assert.ok(brandMsg.text?.body.includes("https://drive.google.com/file/d/"));
});

test("bulk order walks through the complete workflow to payment", async () => {
  // 1. Start bulk order
  await handleWhatsAppMessage(CHAT, buttonReply("order:bulk", "Bulk Order (50+)"));
  let draft = await loadDraft(CHAT);
  assert.equal(draft?.orderType, "bulk");

  // 2. Select silhouette
  await handleWhatsAppMessage(CHAT, buttonReply("garment:collar", "Collared Neck"));
  draft = await loadDraft(CHAT);
  assert.equal(draft?.garmentSilhouette, "collar");

  // 3. Enter quantity
  await handleWhatsAppMessage(CHAT, textMsg("100"));
  draft = await loadDraft(CHAT);
  assert.equal(draft?.qty, 100);
  assert.ok(draft?.sizeSplit);

  // 4. Enter city
  await handleWhatsAppMessage(CHAT, textMsg("Bengaluru"));
  draft = await loadDraft(CHAT);
  assert.equal(draft?.city, "Bengaluru");

  // 5. Enter customer name
  await handleWhatsAppMessage(CHAT, textMsg("Suraj Kumar"));
  draft = await loadDraft(CHAT);
  assert.equal(draft?.name, "Suraj Kumar");

  // 6. Enter phone
  await handleWhatsAppMessage(CHAT, textMsg("9876543210"));
  draft = await loadDraft(CHAT);
  assert.equal(draft?.phone, "9876543210");

  // 7. Timeline
  await handleWhatsAppMessage(CHAT, buttonReply("timeline:standard", "Standard (8-15 days)"));
  draft = await loadDraft(CHAT);
  assert.equal(draft?.timeline, "standard");

  // 8. Quality Tier
  await handleWhatsAppMessage(CHAT, buttonReply("tier:standard", "Standard"));
  draft = await loadDraft(CHAT);
  assert.equal(draft?.tier, "standard");

  // 9. Fabric
  await handleWhatsAppMessage(CHAT, buttonReply("fabric:polyester", "Dry Fit"));
  draft = await loadDraft(CHAT);
  assert.equal(draft?.fabric, "polyester");
  assert.equal(draft?.productId, "dry_fit_polo");

  // 10. Quality Option (Finch Superia Mars)
  await handleWhatsAppMessage(CHAT, listReply("optquality:rec-dfp-finch-superia", "Finch Superia Mars"));
  draft = await loadDraft(CHAT);
  assert.equal(draft?.qualityOptionId, "rec-dfp-finch-superia");

  // 11. Color
  await handleWhatsAppMessage(CHAT, listReply("color:White", "White"));
  draft = await loadDraft(CHAT);
  assert.equal(draft?.colorName, "White");

  // 12. Branding / Print Method
  await handleWhatsAppMessage(CHAT, buttonReply("branding:print", "Print (Screen/DTF)"));
  draft = await loadDraft(CHAT);
  assert.equal(draft?.printMethod, "screen_print");

  // 13. Logo Placement
  await handleWhatsAppMessage(CHAT, listReply("placement:left_chest", "Left Chest"));
  draft = await loadDraft(CHAT);
  assert.equal(draft?.logos?.[0]?.placement, "left_chest");

  // 14. Upload Logo image
  await handleWhatsAppMessage(CHAT, imageMsg("media_logo_123"));
  draft = await loadDraft(CHAT);
  assert.equal(draft?.logos?.[0]?.fileId, "media_logo_123");

  // 15. More logos? -> No more, continue
  await handleWhatsAppMessage(CHAT, buttonReply("logo:done", "No more, continue"));
  draft = await loadDraft(CHAT);
  assert.equal(draft?.logoReceived, true);

  // 16. Mockup Decision -> Skip to quote
  await handleWhatsAppMessage(CHAT, buttonReply("mockup:skip", "Skip - go to quote"));
  draft = await loadDraft(CHAT);
  assert.equal(draft?.mockupDecision, "skip");

  // Verify quote card was rendered and sent
  const quoteMsg = sentMessages.find((m) => m.text?.body?.includes("Your Estimate"));
  assert.ok(quoteMsg, "quote card message must be sent");
  assert.ok(quoteMsg.text?.body.includes("T-Shirt"), "quote card must use 'T-Shirt'");
  // For 100 pcs of Finch Superia Mars (₹399 rate): 100 × 399 = 39,900. Advance (50%) = 19,950
  assert.ok(quoteMsg.text?.body.includes("₹19,950"), "50% advance for 100 x 399 = 39,900");
});

test("sample kit order walks through and collects 100% full payment", async () => {
  // 1. Start sample kit order
  await handleWhatsAppMessage(CHAT, buttonReply("order:sample", "Order Sample Kit"));
  let draft = await loadDraft(CHAT);
  assert.equal(draft?.orderType, "sample");

  // 2. Select silhouette
  await handleWhatsAppMessage(CHAT, buttonReply("garment:round_neck", "Round Neck"));
  draft = await loadDraft(CHAT);
  assert.equal(draft?.garmentSilhouette, "round_neck");

  // 3. Select fabric
  await handleWhatsAppMessage(CHAT, buttonReply("fabric:cotton", "100% Cotton"));
  draft = await loadDraft(CHAT);
  assert.equal(draft?.fabric, "cotton");
  assert.equal(draft?.qty, 3);
  assert.equal(draft?.productId, "cotton_round_neck");

  // 4. Contact details
  await handleWhatsAppMessage(CHAT, textMsg("Mumbai"));
  await handleWhatsAppMessage(CHAT, textMsg("Rohit Sharma"));
  await handleWhatsAppMessage(CHAT, textMsg("9876543210"));
  await handleWhatsAppMessage(CHAT, buttonReply("timeline:standard", "Standard (8-15 days)"));

  draft = await loadDraft(CHAT);
  assert.equal(draft?.city, "Mumbai");
  assert.equal(draft?.name, "Rohit Sharma");
  assert.equal(draft?.phone, "9876543210");

  // Verify quote card was sent with 100% full payment for Cotton kit (₹2,499)
  const quoteMsg = sentMessages.find((m) => m.text?.body?.includes("Your Estimate"));
  assert.ok(quoteMsg, "quote card message must be sent");
  assert.ok(quoteMsg.text?.body.includes("Trial Sample Kit (3 pcs: 1 Value + 1 Recommended + 1 Premium)"));
  assert.ok(quoteMsg.text?.body.includes("Pay today (100% full payment): ₹2,499"));
});

test("bulk order quantity below MOQ 50 triggers rejection and clears draft", async () => {
  await handleWhatsAppMessage(CHAT, buttonReply("order:bulk", "Bulk Order (50+)"));
  await handleWhatsAppMessage(CHAT, buttonReply("garment:collar", "Collared Neck"));

  // User enters 30 (< 50 MOQ)
  await handleWhatsAppMessage(CHAT, textMsg("30"));

  const rejectMsg = sentMessages.find((m) => m.text?.body?.includes("50 pieces"));
  assert.ok(rejectMsg, "must send MOQ rejection message");

  const draft = await loadDraft(CHAT);
  assert.ok(!draft || Object.keys(draft).length === 0, "draft must be cleared after below-MOQ rejection");
});

test("invalid phone number triggers reprompt without advancing", async () => {
  await handleWhatsAppMessage(CHAT, buttonReply("order:sample", "Order Sample Kit"));
  await handleWhatsAppMessage(CHAT, buttonReply("garment:round_neck", "Round Neck"));
  await handleWhatsAppMessage(CHAT, buttonReply("fabric:polyester", "Dry Fit"));
  await handleWhatsAppMessage(CHAT, textMsg("Pune"));
  await handleWhatsAppMessage(CHAT, textMsg("Test User"));

  // Send invalid phone
  await handleWhatsAppMessage(CHAT, textMsg("12345"));

  const phoneErrMsg = sentMessages.find((m) => m.text?.body?.includes("valid Indian mobile number"));
  assert.ok(phoneErrMsg, "must inform user about invalid phone number");

  const draft = await loadDraft(CHAT);
  assert.equal(draft?.phone, undefined, "phone must not be saved if invalid");
});

test("cancel command prompts confirmation; confirming cancel clears draft", async () => {
  await handleWhatsAppMessage(CHAT, buttonReply("order:bulk", "Bulk Order (50+)"));
  await handleWhatsAppMessage(CHAT, buttonReply("garment:collar", "Collared Neck"));

  // Send cancel
  await handleWhatsAppMessage(CHAT, textMsg("cancel"));

  let draft = await loadDraft(CHAT);
  assert.equal(draft?.confirmingCancel, true);

  // Confirm cancel
  await handleWhatsAppMessage(CHAT, buttonReply("cancel:confirm", "❌ Yes, Cancel"));

  draft = await loadDraft(CHAT);
  assert.ok(!draft || Object.keys(draft).length === 0, "draft must be cleared after confirmed cancel");

  const goodbye = sentMessages.find((m) => m.text?.body?.includes("No worries — cancelled"));
  assert.ok(goodbye, "goodbye message must be sent");
});

test("back navigation rolls back to previous step", async () => {
  await handleWhatsAppMessage(CHAT, buttonReply("order:bulk", "Bulk Order (50+)"));
  await handleWhatsAppMessage(CHAT, buttonReply("garment:collar", "Collared Neck"));

  let draft = await loadDraft(CHAT);
  assert.equal(draft?.garmentSilhouette, "collar");

  // Send back
  await handleWhatsAppMessage(CHAT, textMsg("back"));

  draft = await loadDraft(CHAT);
  assert.equal(draft?.garmentSilhouette, undefined);
  assert.equal(draft?.orderType, "bulk");
});
