/**
 * grammY StorageAdapter backed by Upstash Redis, used for both
 * `session()` and `conversations()` persistence (PRD §9.1: sess:<chat_id>, 24h TTL).
 */

import type { StorageAdapter } from "grammy";
import { getRedis } from "./redisClient.js";

const SESSION_TTL_SECONDS = 24 * 60 * 60;

export function createRedisStorage<T>(prefix: string): StorageAdapter<T> {
  const redis = getRedis();
  const fullKey = (key: string) => `${prefix}${key}`;

  return {
    async read(key) {
      const value = await redis.get<T>(fullKey(key));
      return value ?? undefined;
    },
    async write(key, value) {
      await redis.set(fullKey(key), value, { ex: SESSION_TTL_SECONDS });
    },
    async delete(key) {
      await redis.del(fullKey(key));
    },
    async has(key) {
      const exists = await redis.exists(fullKey(key));
      return exists === 1;
    },
  };
}
