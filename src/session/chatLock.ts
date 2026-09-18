/**
 * Per-chat "busy" lock — prevents a customer from sending a new message
 * while the bot is still working through their previous one (e.g. a slow
 * Sheets append, Redis round-trip, or Telegram API call). Without this,
 * a customer sending several messages in quick succession can trigger
 * concurrent webhook invocations for the same chat, racing on the same
 * grammY-conversation state in Redis and producing duplicate/garbled
 * replies.
 *
 * Uses a short-TTL Redis SETNX so a crashed/killed invocation can never
 * strand a chat in a permanently "busy" state — the lock self-expires
 * well before a user would plausibly still be waiting.
 */

import { getRedis } from "./redisClient.js";

const LOCK_TTL_SECONDS = 90; // covers the slowest realistic step (Sheets append, QR gen, multiple Telegram sends)

function lockKey(chatId: string): string {
  return `busy:${chatId}`;
}

/** Attempts to claim the busy lock for this chat. Returns true if claimed. */
export async function acquireChatLock(chatId: string): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.set(lockKey(chatId), "1", { nx: true, ex: LOCK_TTL_SECONDS });
  return result === "OK";
}

/** Releases the busy lock for this chat. Safe to call even if never acquired. */
export async function releaseChatLock(chatId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(lockKey(chatId));
}
