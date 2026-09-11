/**
 * In-memory fake of the RedisLike surface used by the app, faithful enough
 * for the mockup quota / generation-store idempotency tests:
 *  - SET with { nx } only writes when the key is absent (returns "OK" or null).
 *  - SET with { ex } records a TTL (not expired in-test unless advanced).
 *  - INCR treats a missing key as 0.
 *  - Values round-trip through JSON, mirroring @upstash/redis auto-JSON.
 */

import type { RedisLike } from "../../src/session/redisClient.js";

export class FakeRedis implements RedisLike {
  private store = new Map<string, string>();
  private ttl = new Map<string, number>();

  async get<T = unknown>(key: string): Promise<T | null> {
    const raw = this.store.get(key);
    if (raw === undefined) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set(
    key: string,
    value: unknown,
    opts?: { nx?: boolean; ex?: number },
  ): Promise<string | null> {
    if (opts?.nx && this.store.has(key)) return null;
    this.store.set(key, JSON.stringify(value));
    if (opts?.ex !== undefined) this.ttl.set(key, opts.ex);
    return "OK";
  }

  async incr(key: string): Promise<number> {
    const raw = this.store.get(key);
    const current = raw === undefined ? 0 : Number(JSON.parse(raw));
    const next = current + 1;
    this.store.set(key, JSON.stringify(next));
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!this.store.has(key)) return 0;
    this.ttl.set(key, seconds);
    return 1;
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const k of keys) {
      if (this.store.delete(k)) removed++;
      this.ttl.delete(k);
    }
    return removed;
  }

  /** Test helper: raw view of stored keys. */
  keys(): string[] {
    return [...this.store.keys()];
  }
}
