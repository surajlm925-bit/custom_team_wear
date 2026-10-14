import { getRedis } from "../session/redisClient.js";
import crypto from "node:crypto";

export const ORDER_APPROVAL_TTL_SECONDS = 30 * 60; // 30 minutes
export const MOCKUP_APPROVAL_TTL_SECONDS = 120; // 2 minutes

export interface PendingApproval {
  type: "order" | "mockup";
  id: string; // orderId or generationId
  code: string;
  adminChatId?: string;
  createdAt: number;
}

function codeKey(code: string): string {
  return `admin:approval:code:${code}`;
}

function entityKey(type: "order" | "mockup", id: string): string {
  return `admin:approval:entity:${type}:${id}`;
}

function cooldownKey(type: "order" | "mockup", id: string): string {
  return `admin:approval:cooldown:${type}:${id}`;
}

/**
 * Generates a cryptographically random 6-digit approval code valid for 30 minutes (orders) or 2 mins (mockups).
 * Associates both code -> entity and entity -> code in Redis.
 */
export async function createApprovalCode(
  type: "order" | "mockup",
  id: string,
  adminChatId?: string,
  ttlSeconds = type === "order" ? ORDER_APPROVAL_TTL_SECONDS : MOCKUP_APPROVAL_TTL_SECONDS,
): Promise<string> {
  const redis = getRedis();

  // Clear any existing pending code for this entity
  const existingCode = await redis.get<string>(entityKey(type, id));
  if (existingCode) {
    await redis.del(codeKey(existingCode));
  }

  // Generate 6 digit numeric string
  const num = crypto.randomInt(100000, 1000000);
  const code = String(num);

  const pending: PendingApproval = {
    type,
    id,
    code,
    adminChatId,
    createdAt: Date.now(),
  };

  await redis.set(codeKey(code), pending, { ex: ttlSeconds });
  await redis.set(entityKey(type, id), code, { ex: ttlSeconds });

  return code;
}

/**
 * Generates a secondary/fresh OTP code with rate-limit cooldown (30s) to prevent spam.
 */
export async function resendApprovalCode(
  type: "order" | "mockup",
  id: string,
): Promise<{ ok: boolean; code?: string; cooldownRemaining?: number }> {
  const redis = getRedis();
  const cKey = cooldownKey(type, id);

  const inCooldown = await redis.get<string>(cKey);
  if (inCooldown) {
    const ttl = typeof (redis as any).ttl === "function" ? await (redis as any).ttl(cKey) : 30;
    return { ok: false, cooldownRemaining: Math.max(1, ttl) };
  }

  // Set 30 second cooldown
  await redis.set(cKey, "1", { ex: 30 });

  const code = await createApprovalCode(type, id);
  return { ok: true, code };
}

/**
 * Validates and consumes the 6-digit approval code.
 * Returns the PendingApproval record if valid and not expired, null otherwise.
 */
export async function verifyAndConsumeApprovalCode(code: string): Promise<PendingApproval | null> {
  const cleanCode = code.trim();
  if (!/^\d{6}$/.test(cleanCode)) return null;

  const redis = getRedis();
  const cKey = codeKey(cleanCode);
  const data = await redis.get<PendingApproval | string>(cKey);
  if (!data) return null;

  const pending: PendingApproval = typeof data === "string" ? JSON.parse(data) : data;

  // Consume code immediately so it cannot be reused
  await redis.del(cKey);
  await redis.del(entityKey(pending.type, pending.id));

  return pending;
}

/**
 * Gets currently active approval code for an entity, if any.
 */
export async function getActiveApprovalCode(type: "order" | "mockup", id: string): Promise<string | null> {
  const redis = getRedis();
  return redis.get<string>(entityKey(type, id));
}
