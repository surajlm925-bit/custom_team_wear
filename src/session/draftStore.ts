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
const memoryDrafts = new Map<string, OrderDraft>();
let lastRedisInstance: unknown = undefined;

function checkRedisInstance() {
  const current = getRedis();
  if (current !== lastRedisInstance) {
    memoryDrafts.clear();
    lastRedisInstance = current;
  }
}

function key(chatId: string): string {
  return `sess:${chatId}`;
}

export async function loadDraft(chatId: string): Promise<OrderDraft | undefined> {
  checkRedisInstance();
  const cached = memoryDrafts.get(chatId);
  if (cached) {
    return cached;
  }
  const redis = getRedis();
  const value = await redis.get<OrderDraft>(key(chatId));
  if (value) {
    memoryDrafts.set(chatId, value);
  }
  return value ?? undefined;
}

export async function saveDraft(chatId: string, draft: OrderDraft, persistToRedis = false): Promise<void> {
  checkRedisInstance();
  const updated = { ...draft, updatedAt: Date.now() };
  memoryDrafts.set(chatId, updated);

  const redis = getRedis();
  if (persistToRedis) {
    await redis.set(key(chatId), updated, { ex: TTL_SECONDS });
  } else {
    // Non-blocking background sync so latency stays 0ms while navigating preset menus
    redis.set(key(chatId), updated, { ex: TTL_SECONDS }).catch((err) => {
      console.warn(`[draftStore] Non-blocking Redis save failed for ${chatId}:`, err);
    });
  }
}

export async function clearDraft(chatId: string): Promise<void> {
  checkRedisInstance();
  memoryDrafts.delete(chatId);
  const redis = getRedis();
  await redis.del(key(chatId));
}

export function __clearMemoryDraftsForTests(): void {
  memoryDrafts.clear();
}
