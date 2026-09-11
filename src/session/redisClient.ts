import { Redis } from "@upstash/redis";
import { getEnv } from "../config/env.js";

/**
 * The minimal subset of the Upstash Redis surface the mockup quota /
 * generation-store modules use. Declaring it lets tests inject a
 * lightweight in-memory fake (tests/support/fakeRedis.ts) without a real
 * Upstash instance or network. The real @upstash/redis client is a
 * structural superset, so a fake typed as RedisLike is accepted wherever
 * these modules call getRedis().
 */
export interface RedisLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set(
    key: string,
    value: unknown,
    opts?: { nx?: boolean; ex?: number },
  ): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number | boolean>;
  del(...keys: string[]): Promise<number>;
}

let realClient: Redis | undefined;
let testOverride: RedisLike | undefined;

export function getRedis(): Redis {
  if (testOverride) return testOverride as unknown as Redis;
  if (!realClient) {
    const env = getEnv();
    realClient = new Redis({
      url: env.REDIS_REST_URL,
      token: env.REDIS_REST_TOKEN,
    });
  }
  return realClient;
}

/**
 * Test seam: replace the Redis client with an in-memory fake, or pass
 * undefined to restore the real client. Never called in production code.
 */
export function __setRedisForTests(fake: RedisLike | undefined): void {
  testOverride = fake;
}
