/**
 * Mockup-generation rate limiting & abuse controls.
 *
 * This is deliberately separate from the general chat flood limiter
 * (src/session/rateLimit.ts) — AI mockup generation costs real money per
 * call (~$0.03-0.04/image via OpenRouter), so it needs its own, much
 * stricter cap independent of ordinary message throughput. A user who
 * passes the chat flood check could still hammer this specific expensive
 * action without this guard.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "../session/redisClient.js";

const MAX_MOCKUPS_PER_CHAT_PER_DAY = 3;
const MAX_LOGO_IMAGES_PER_ORDER = 4;
const MAX_LOGO_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_LOGO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

let limiter: Ratelimit | undefined;

function getLimiter(): Ratelimit {
  if (!limiter) {
    limiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(MAX_MOCKUPS_PER_CHAT_PER_DAY, "24 h"),
      prefix: "ratelimit:mockup",
    });
  }
  return limiter;
}

/**
 * Returns true if this chat may generate another mockup right now.
 * Generation is only ever triggered once per confirmed order (never on
 * free-form request), so this cap is a backstop against retries/abuse,
 * not the primary throttle.
 */
export async function canGenerateMockup(chatId: number): Promise<boolean> {
  const { success } = await getLimiter().limit(String(chatId));
  return success;
}

export class InvalidLogoError extends Error {}

/**
 * Validates an uploaded logo file before it's ever sent to a paid AI API.
 * Rejects oversized files and non-image MIME types.
 */
export function validateLogoFile(mimeType: string | undefined, sizeBytes: number | undefined): void {
  if (!mimeType || !ALLOWED_LOGO_MIME_TYPES.has(mimeType)) {
    throw new InvalidLogoError(
      `Unsupported logo file type${mimeType ? `: ${mimeType}` : ""}. Please send a JPEG, PNG, or WebP image.`,
    );
  }
  if (sizeBytes !== undefined && sizeBytes > MAX_LOGO_FILE_SIZE_BYTES) {
    throw new InvalidLogoError(
      `Logo file is too large (max ${Math.round(MAX_LOGO_FILE_SIZE_BYTES / (1024 * 1024))} MB).`,
    );
  }
}

export function validateLogoCount(count: number): void {
  if (count < 1) {
    throw new InvalidLogoError("At least one logo image is required.");
  }
  if (count > MAX_LOGO_IMAGES_PER_ORDER) {
    throw new InvalidLogoError(`A maximum of ${MAX_LOGO_IMAGES_PER_ORDER} logo images is supported per order.`);
  }
}

export { MAX_MOCKUPS_PER_CHAT_PER_DAY, MAX_LOGO_IMAGES_PER_ORDER, MAX_LOGO_FILE_SIZE_BYTES };
