/**
 * Mockup delivery — fires after admin ✅ Confirm (src/admin/actions.ts).
 * Fetches all of the customer's uploaded logos from Telegram, validates
 * them, generates the AI mockup(s) via the active provider
 * (src/mockup/imageProvider.ts) — one combined image per template view
 * touched by any of the logos — and sends the result(s) to the customer.
 * Never blocks or fails order confirmation — all errors are caught and
 * logged; the customer still gets their confirmation DM either way (see
 * admin/actions.ts).
 */

import { Bot, InputFile } from "grammy";
import { getEnv } from "../config/env.js";
import type { OrderData } from "../shared/types.js";
import { generateAiMockups } from "./generateAi.js";
import { canGenerateMockup, validateLogoFile, validateLogoCount, MAX_LOGO_FILE_SIZE_BYTES } from "./rateLimit.js";
import type { LogoAssignment } from "./promptBuilder.js";

let botInstance: Bot | undefined;
function getBot(): Bot {
  if (!botInstance) botInstance = new Bot(getEnv().TELEGRAM_BOT_TOKEN);
  return botInstance;
}

/** Extracts the numeric Telegram chat id from the "tg:<id>" prefixed field. */
function extractTelegramChatId(customerChatId: string): number | null {
  const match = /^tg:(\d+)$/.exec(customerChatId);
  return match ? Number(match[1]) : null;
}

async function fetchTelegramFileBuffer(fileId: string): Promise<Buffer> {
  const bot = getBot();
  const file = await bot.api.getFile(fileId);
  if (!file.file_path) throw new Error("Telegram file has no file_path");
  const url = `https://api.telegram.org/file/bot${getEnv().TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download Telegram file (${response.status})`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function guessMimeTypeFromBuffer(buffer: Buffer): string {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer.length > 12 && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "application/octet-stream";
}

/**
 * Generates and sends the mockup(s) to the customer for a confirmed
 * order. Every logo the customer uploaded is fetched and passed as its
 * own reference image, each assigned to the placement they picked for it
 * — multiple logos at multiple positions render together in as few
 * generation calls as possible (one per distinct template view touched).
 */
export async function deliverMockupForOrder(order: OrderData): Promise<void> {
  if (!order.logoReceived || order.logos.length === 0) {
    return; // no artwork uploaded — nothing to render
  }

  const customerChatId = extractTelegramChatId(order.customerChatId);
  if (!customerChatId) {
    console.error(`Cannot deliver mockup: unparseable customerChatId "${order.customerChatId}"`);
    return;
  }

  const allowed = await canGenerateMockup(customerChatId).catch(() => false);
  if (!allowed) {
    console.warn(`Mockup generation rate-limited for chat ${customerChatId}, order ${order.orderId}`);
    return;
  }

  try {
    validateLogoCount(order.logos.length);

    const logoBuffers: Buffer[] = [];
    for (const logo of order.logos) {
      const buffer = await fetchTelegramFileBuffer(logo.fileId);
      validateLogoFile(guessMimeTypeFromBuffer(buffer), buffer.length);
      logoBuffers.push(buffer);
    }

    const assignments: LogoAssignment[] = order.logos.map((logo, i) => ({
      logoIndex: i,
      placement: logo.placement,
    }));

    const results = await generateAiMockups(order.productId, assignments, logoBuffers);

    const bot = getBot();
    for (const result of results) {
      await bot.api.sendPhoto(customerChatId, new InputFile(result.buffer, `${order.orderId}-mockup-${result.view}.png`), {
        caption: `🎨 Here's how your logo${order.logos.length > 1 ? "s" : ""} look${order.logos.length > 1 ? "" : "s"} on the garment! (${result.view === "front" ? "Front" : "Back"} view)`,
      });
    }
  } catch (err) {
    console.error(`Mockup generation failed for order ${order.orderId}:`, err);
    // Deliberately silent to the customer — mockup is a nice-to-have,
    // never a blocker on their confirmed order.
  }
}

// Re-exported for admin/actions.ts's error messaging if needed later.
export { MAX_LOGO_FILE_SIZE_BYTES };
