/**
 * Explicit session snapshot — PRD §9.1 `sess:<chat_id>`, 24h TTL.
 * Mirrors the conversation's collected fields so we can:
 *  (a) offer an accurate "Resume my quote?" prompt on /start, and
 *  (b) write an accurate Lead row if the customer abandons mid-flow,
 * without needing to replay the conversations-plugin's internal state
 * (which is stored separately, under the `conv:` prefix, by the
 * StorageAdapter passed to `conversations()`).
 */

import { getRedis } from "./redisClient.js";
import type { OrderDraft } from "../conversation/draft.js";

const TTL_SECONDS = 24 * 60 * 60;

function key(chatId: number): string {
  return `sess:${chatId}`;
}

export async function loadDraft(chatId: number): Promise<OrderDraft | undefined> {
  const redis = getRedis();
  const value = await redis.get<OrderDraft>(key(chatId));
  return value ?? undefined;
}

export async function saveDraft(chatId: number, draft: OrderDraft): Promise<void> {
  const redis = getRedis();
  await redis.set(key(chatId), { ...draft, updatedAt: Date.now() }, { ex: TTL_SECONDS });
}

export async function clearDraft(chatId: number): Promise<void> {
  const redis = getRedis();
  await redis.del(key(chatId));
}
