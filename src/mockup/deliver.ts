/**
 * Mockup delivery. Invoked (as part of startMockupGeneration) from the
 * standalone /api/mockup-delivery function or, for admin-approved paid
 * generations, from approvePaidGeneration. Fetches all of the customer's
 * uploaded logos from Telegram, validates them, composites the
 * DETERMINISTIC proof (src/mockup/composite.ts) — one combined image per
 * view touched by any of the logos — and sends the result(s) to the
 * customer. Never throws past its caller — all errors are caught and
 * surfaced via the returned outcome.
 */

import { Bot, InputFile } from "grammy";
import { getEnv } from "../config/env.js";
import { COPY } from "../conversation/copy.js";
import type { MockupView, OrderData } from "../shared/types.js";
import { generateDeterministicMockups } from "./composite.js";
import { isLegacyOrderWithoutCatalog, isMockupEligible } from "./garmentReference.js";
import { validateLogoFile, validateLogoCount, MAX_LOGO_FILE_SIZE_BYTES } from "./rateLimit.js";
import { viewsForAssignments, type LogoAssignment } from "./promptBuilder.js";
import { uploadMockupImage, type BlobUploader } from "../storage/blob.js";
import { loadGeneration, advanceStatus, recordOutput } from "./generationStore.js";
import { commitFreeGeneration, releaseReservation } from "./quota.js";
import { notifyAdminsText } from "../admin/notify.js";

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

export interface MockupDeliveryOutcome {
  delivered: boolean;
  /** Present when delivered is false — human-readable cause for admin escalation. */
  reason?: string;
  /** Durable Blob URLs of the images produced this run (present on success). */
  urls?: string[];
}

/**
 * Injectable dependencies so the whole generate → store → send pipeline
 * can be exercised in tests without hitting a paid AI API, the network,
 * or a real Blob store. Production leaves all of these at their defaults.
 */
export interface MockupDeliveryDeps {
  /**
   * Overridable deterministic compositor (defaults to the real Sharp
   * pixel-exact compositor). Tests inject a capture fake. The customer
   * proof is ALWAYS deterministic — there is no AI provider on this path.
   */
  compositor?: (
    order: OrderData,
    assignments: LogoAssignment[],
    logoBuffers: Buffer[],
  ) => Promise<{ view: MockupView; buffer: Buffer }[]>;
  blobUploader?: BlobUploader;
  /** Overridable send hook (defaults to Telegram sendPhoto). Returns the delivered file_id when known. */
  sendPhoto?: (chatId: number, buffer: Buffer, filename: string, caption: string) => Promise<string | undefined>;
  /** Overridable logo-bytes fetcher (defaults to downloading from Telegram). */
  fetchLogo?: (fileId: string) => Promise<Buffer>;
}

async function defaultSendPhoto(
  chatId: number,
  buffer: Buffer,
  filename: string,
  caption: string,
): Promise<string | undefined> {
  const message = await getBot().api.sendPhoto(chatId, new InputFile(buffer, filename), { caption });
  const photo = message.photo;
  return photo && photo.length > 0 ? photo[photo.length - 1].file_id : undefined;
}

/**
 * Generates and sends the mockup(s) to the customer for a confirmed
 * order. Every logo the customer uploaded is fetched and passed as its
 * own reference image, each assigned to the placement they picked for it
 * — multiple logos at multiple positions render together in as few
 * generation calls as possible (one per distinct template view touched).
 *
 * Never throws — always returns an outcome so the caller (api/mockup-
 * delivery.ts) can escalate a skip/failure to the admin chat rather than
 * it going unnoticed (PRD "escalation never fails silently").
 */
export async function deliverMockupForOrder(
  order: OrderData,
  deps: MockupDeliveryDeps = {},
): Promise<MockupDeliveryOutcome> {
  const compositor = deps.compositor ?? generateDeterministicMockups;
  const blobUploader = deps.blobUploader;
  const sendPhoto = deps.sendPhoto ?? defaultSendPhoto;
  const fetchLogo = deps.fetchLogo ?? fetchTelegramFileBuffer;

  if (!order.logoReceived || order.logos.length === 0) {
    return { delivered: false, reason: "no artwork uploaded" };
  }

  // If a MockupGeneration record exists for this order, this run is part
  // of the durable/paid workflow. A completed record means the images were
  // already produced and sent — return them idempotently WITHOUT
  // regenerating (and, critically, without any re-charge, since the quota
  // reservation is keyed on the same generationId).
  const generation = await loadGeneration(order.orderId).catch(() => undefined);
  if (generation?.status === "completed") {
    const urls = generation.outputs.map((o) => o.url).filter((u): u is string => Boolean(u));
    return { delivered: true, urls };
  }
  const generationId = generation?.generationId;

  const customerChatId = extractTelegramChatId(order.customerChatId);
  if (!customerChatId) {
    console.error(`Cannot deliver mockup: unparseable customerChatId "${order.customerChatId}"`);
    return { delivered: false, reason: `unparseable customerChatId "${order.customerChatId}"` };
  }

  // Exact-garment gate: a catalog order with no usable reference image
  // cannot produce a mockup of what the customer actually chose. Rather
  // than silently substituting a generic garment, tell the customer their
  // exact preview is unavailable (their order still proceeds) and return
  // an outcome so the caller escalates it to admins. Legacy orders (no
  // catalog data) are exempt — they legitimately use a generic template.
  if (!isLegacyOrderWithoutCatalog(order) && !isMockupEligible(order)) {
    await getBot()
      .api.sendMessage(customerChatId, COPY.mockupUnavailable)
      .catch((err) => console.error(`Failed to send mockup-unavailable notice to ${customerChatId}:`, err));
    return {
      delivered: false,
      reason:
        `exact-garment reference unavailable for catalog selection ` +
        `(${order.catalogSelection?.itemLabel ?? "unknown item"}${order.catalogSelection?.colorName ? ` / ${order.catalogSelection.colorName}` : ""}) — ` +
        `customer notified, generic fallback intentionally not used`,
    };
  }

  // NOTE: the old per-chat/day sliding-window limiter (canGenerateMockup)
  // is intentionally NOT applied here anymore. Generation volume is now
  // governed by the monthly free quota + paid workflow (src/mockup/quota.ts
  // + workflow.ts) and the generation record's forward-only state machine,
  // which together guarantee a generation runs at most once per request and
  // is never re-charged on retry. Layering the old daily limiter on top of
  // that double-counts and blocks legitimate paid/approved generations.

  // Mark the durable record as generating (if one exists). This is a
  // forward-only transition; a duplicate trigger that finds it already
  // "generating"/"completed" is handled idempotently by the store.
  if (generationId) {
    await advanceStatus(generationId, "generating").catch((err) =>
      console.error(`Could not mark generation ${generationId} as generating:`, err),
    );
  }

  try {
    validateLogoCount(order.logos.length);

    const logoBuffers: Buffer[] = [];
    for (const logo of order.logos) {
      const buffer = await fetchLogo(logo.fileId);
      validateLogoFile(guessMimeTypeFromBuffer(buffer), buffer.length);
      logoBuffers.push(buffer);
    }

    const assignments: LogoAssignment[] = order.logos.map((logo, i) => ({
      logoIndex: i,
      placement: logo.placement,
    }));

    // The customer-facing PRINT PROOF is produced deterministically
    // (pixel-exact Sharp compositing over the confirmed reference image) —
    // never by generative AI, which could redraw the garment or logo.
    const results = await compositor(order, assignments, logoBuffers);

    // STORAGE IS MANDATORY, AND HAPPENS BEFORE ANY TELEGRAM SEND.
    // We upload EVERY produced view to Vercel Blob first. If ANY upload
    // fails, we send NOTHING to the customer — a customer must never
    // receive a mockup that can't later be retrieved from storage. The
    // catch below marks the generation failed, persists the failure, and
    // notifies admins with order id + generation id.
    const stored: { view: MockupView; buffer: Buffer; url: string; pathname: string }[] = [];
    for (const result of results) {
      const pathname = `mockups/${order.orderId}/${result.view}.png`;
      const uploaded = blobUploader
        ? await uploadMockupImage(pathname, result.buffer, "image/png", blobUploader)
        : await uploadMockupImage(pathname, result.buffer, "image/png");
      stored.push({
        view: result.view,
        buffer: result.buffer,
        url: uploaded.url,
        pathname: uploaded.pathname,
      });
    }

    // All uploads succeeded — now (and only now) send to Telegram, using
    // the SAME buffer that was successfully stored, and record the durable
    // URL on the generation record.
    const urls: string[] = [];
    for (const s of stored) {
      const filename = `${order.orderId}-mockup-${s.view}.png`;
      const caption = `🎨 Here's how your logo${order.logos.length > 1 ? "s" : ""} look${order.logos.length > 1 ? "" : "s"} on the garment! (${s.view === "front" ? "Front" : "Back"} view)`;
      const telegramFileId = await sendPhoto(customerChatId, s.buffer, filename, caption).catch((err) => {
        console.error(`Failed to send mockup photo (${filename}) to ${customerChatId}:`, err);
        return undefined;
      });
      urls.push(s.url);
      if (generationId) {
        await recordOutput(generationId, {
          view: s.view,
          url: s.url,
          pathname: s.pathname,
          telegramFileId,
          costUsd: 0, // deterministic proof — no per-image AI cost
        }).catch((err) => console.error(`Could not record output for generation ${generationId}:`, err));
      }
    }

    if (generationId) {
      await advanceStatus(generationId, "completed").catch((err) =>
        console.error(`Could not mark generation ${generationId} as completed:`, err),
      );
    }
    // SUCCESS commits the free slot (idempotent; no-op for paid). Only a
    // successful, durably-stored, delivered generation consumes quota.
    await commitFreeGeneration(order.customerChatId, order.orderId).catch((err) =>
      console.error(`Could not commit free quota for ${order.orderId}:`, err),
    );
    return { delivered: true, urls };
  } catch (err) {
    const reason = String(err instanceof Error ? err.message : err);
    console.error(`Mockup generation/storage failed for order ${order.orderId}:`, err);
    // Record the failure on the durable record. Status stays recoverable
    // ("failed" -> "generating" is an allowed retry).
    if (generationId) {
      await advanceStatus(generationId, "failed", { failureReason: reason }).catch(() => {});
    }
    // RELEASE the reservation so a FREE generation's slot isn't burned by
    // our internal error. A retry reuses the same generationId (sticky
    // free/paid decision) and never re-charges; a brand-new request stays
    // free until three free generations have actually SUCCEEDED this month.
    await releaseReservation(order.orderId).catch(() => {});
    // Escalation never fails silently: tell admins WHICH generation failed
    // (esp. important for a Blob-storage failure, which now blocks delivery).
    await notifyAdminsText(
      `⚠️ Mockup generation failed — order ${order.orderId}, generation ${generationId ?? order.orderId}: ${reason}. ` +
        `No image was sent to the customer (storage/generation must succeed first).`,
    ).catch(() => {});
    // Deliberately silent to the CUSTOMER — mockup is a nice-to-have,
    // never a blocker on their confirmed order.
    return { delivered: false, reason };
  }
}

/**
 * The distinct template views an order's logos will produce — front-only
 * placements yield ["front"], a front+back combination yields both. This
 * is what makes a front+back request ONE generation (it produces two
 * images but is a single quota-consuming request).
 */
export function requestedViewsForOrder(order: OrderData): MockupView[] {
  const assignments: LogoAssignment[] = order.logos.map((logo, i) => ({
    logoIndex: i,
    placement: logo.placement,
  }));
  return viewsForAssignments(assignments) as MockupView[];
}

// Re-exported for admin/actions.ts's error messaging if needed later.
export { MAX_LOGO_FILE_SIZE_BYTES };
