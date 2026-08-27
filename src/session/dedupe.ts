/**
 * Webhook dedupe on update_id — PRD §8.4, §9.1 (upd:<update_id>, 24h TTL).
 * Uses SETNX semantics (via Upstash `set` with `nx`) so exactly one
 * invocation ever proceeds per update_id, even under duplicate delivery.
 */

import { getRedis } from "./redisClient.js";

const TTL_SECONDS = 24 * 60 * 60;

/** Returns true if this update_id has NOT been seen before (i.e. safe to process). */
export async function claimUpdate(updateId: number): Promise<boolean> {
  const redis = getRedis();
  const key = `upd:${updateId}`;
  const result = await redis.set(key, "1", { nx: true, ex: TTL_SECONDS });
  return result === "OK";
}
