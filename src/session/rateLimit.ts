/**
 * Per-chat flood control — PRD §5.3, §10.1 (~20 msg/min).
 * Uses @upstash/ratelimit on the same Redis instance as sessions.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "./redisClient.js";

let limiter: Ratelimit | undefined;

function getLimiter(): Ratelimit {
  if (!limiter) {
    limiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(20, "60 s"),
      prefix: "ratelimit:ctw",
    });
  }
  return limiter;
}

/** Returns true if this chat is within the flood-control limit. */
export async function checkRateLimit(chatId: number): Promise<boolean> {
  const { success } = await getLimiter().limit(String(chatId));
  return success;
}
