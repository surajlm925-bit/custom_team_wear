/**
 * Monthly free-mockup quota — commit-on-success model.
 *
 * RULES:
 *  - Each chat gets MOCKUP_FREE_PER_MONTH (default 3) FREE mockup
 *    generations per Asia/Kolkata calendar month.
 *  - A generation is a whole REQUEST, not an image: a front+back request
 *    counts as ONE generation regardless of how many views it produces.
 *  - Generation #4 onward in the same Kolkata month costs
 *    MOCKUP_PAID_PRICE_INR (default ₹20) each.
 *
 * WHY COMMIT-ON-SUCCESS (not on reservation):
 *  A free slot must only be "used up" once a generation SUCCEEDS. An
 *  internal generation failure must release the slot so the customer isn't
 *  silently charged/blocked for our error. So:
 *    - reserveGeneration() only DECIDES free-vs-paid (sticky per
 *      generationId) — it does NOT consume a slot.
 *    - commitFreeGeneration() is called on SUCCESS of a free generation and
 *      is what actually consumes the slot (idempotent per generationId).
 *    - releaseReservation() is called on internal FAILURE. For a free
 *      generation nothing was committed, so the slot is naturally free
 *      again; the sticky decision is preserved so a retry with the SAME
 *      generationId stays free and never re-charges.
 *
 * PAID STICKINESS:
 *  A paid decision is sticky per generationId, so a retry after an internal
 *  failure reuses the same decision and never asks for or charges another
 *  ₹20. releaseReservation() never downgrades a paid decision.
 *
 * The Kolkata month boundary is computed by shifting UTC by +5:30 (India
 * has no DST) — enough to bucket a timestamp into the right local month.
 */

import { getRedis } from "../session/redisClient.js";
import { getEnv } from "../config/env.js";
import { computeMockupFee } from "../pricing/index.js";
import type { MockupView } from "../shared/types.js";

const IST_OFFSET_MINUTES = 5 * 60 + 30; // Asia/Kolkata is a fixed +05:30, no DST
const MONTH_TTL_SECONDS = 40 * 24 * 60 * 60; // > 1 month so the counter survives the whole billing month
const PHONE_QUOTA_TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year for phone number quota

/** Returns the Asia/Kolkata calendar-month key (YYYY-MM) for a given instant. */
export function kolkataMonthKey(at: Date = new Date()): string {
  const shifted = new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

/** Extracts clean 10-digit Indian phone number for quota lookup. */
export function normalizePhoneForQuota(phone?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits || null;
}

/** Numeric chat id from a "tg:<id>" prefixed field, or the raw string as a fallback bucket. */
function chatBucket(customerChatId: string): string {
  const match = /^tg:(\d+)$/.exec(customerChatId);
  return match ? match[1] : customerChatId;
}

/** Counter key: phone-based if phone provided, otherwise per-chat month-based. */
function quotaCounterKey(bucket: string, monthKey: string, phone?: string): string {
  const clean = normalizePhoneForQuota(phone);
  return clean ? `mockupquota:phone:${clean}` : `mockupquota:freecommitted:${bucket}:${monthKey}`;
}

/** Sticky free-vs-paid decision for a single generationId. */
function decisionKey(generationId: string): string {
  return `mockupquota:decision:${generationId}`;
}

/** Marker that a generationId's free slot has already been committed (idempotency). */
function committedMarkerKey(generationId: string): string {
  return `mockupquota:committed:${generationId}`;
}

export interface QuotaReservation {
  /** True when this generation is within the free monthly allowance. */
  free: boolean;
  /** Whole-rupee charge (0 when free). */
  amountInr: number;
  /** The Kolkata month this reservation is bucketed into. */
  monthKey: string;
  /** Committed (successful) free generations this month at decision time. */
  committedFreeThisMonth: number;
  /** Free allowance for the month. */
  freeAllowance: number;
}

export interface ReserveOptions {
  phone?: string;
  views?: MockupView[];
  at?: Date;
}

export interface CommitOptions {
  phone?: string;
  at?: Date;
}

/**
 * DECIDES whether a generation is free or paid, sticky per generationId.
 * Does NOT consume a slot — the slot is only consumed on success via
 * commitFreeGeneration(). Idempotent: a repeat call for the same
 * generationId replays the identical decision (so retries never flip
 * free↔paid or re-charge).
 */
export async function reserveGeneration(
  customerChatId: string,
  generationId: string,
  optionsOrDate?: ReserveOptions | Date,
): Promise<QuotaReservation> {
  const at = optionsOrDate instanceof Date ? optionsOrDate : optionsOrDate?.at ?? new Date();
  const phone = optionsOrDate instanceof Date ? undefined : optionsOrDate?.phone;
  const views = optionsOrDate instanceof Date ? undefined : optionsOrDate?.views;

  const redis = getRedis();
  const env = getEnv();
  const freeAllowance = env.MOCKUP_FREE_PER_MONTH;
  const priceInr = computeMockupFee(views);
  const monthKey = kolkataMonthKey(at);
  const bucket = chatBucket(customerChatId);
  const counterKey = quotaCounterKey(bucket, monthKey, phone);

  // Sticky decision: replay if this generationId was already decided.
  const existing = await redis.get<QuotaReservation>(decisionKey(generationId));
  if (existing) return existing;

  const committedRaw = await redis.get<number>(counterKey);
  const committedFreeThisMonth = typeof committedRaw === "number" ? committedRaw : 0;

  const free = committedFreeThisMonth < freeAllowance;
  const reservation: QuotaReservation = {
    free,
    amountInr: free ? 0 : priceInr,
    monthKey,
    committedFreeThisMonth,
    freeAllowance,
  };

  // Persist the sticky decision. TTL covers the whole month + retry window.
  await redis.set(decisionKey(generationId), reservation, { ex: MONTH_TTL_SECONDS });
  return reservation;
}

/**
 * Consumes the free slot for a SUCCESSFUL free generation. Idempotent per
 * generationId (guarded by a committed marker) so a duplicate success
 * callback / re-run never double-counts. No-op for paid generations.
 */
export async function commitFreeGeneration(
  customerChatId: string,
  generationId: string,
  optionsOrDate?: CommitOptions | Date,
): Promise<void> {
  const at = optionsOrDate instanceof Date ? optionsOrDate : optionsOrDate?.at ?? new Date();
  const phone = optionsOrDate instanceof Date ? undefined : optionsOrDate?.phone;

  const redis = getRedis();
  const decision = await redis.get<QuotaReservation>(decisionKey(generationId));
  if (!decision || !decision.free) return; // only free generations consume a free slot

  // Idempotency: only the first commit for this generationId increments.
  const claimed = await redis.set(committedMarkerKey(generationId), "1", {
    nx: true,
    ex: MONTH_TTL_SECONDS,
  });
  if (claimed !== "OK") return;

  const bucket = chatBucket(customerChatId);
  const monthKey = decision.monthKey || kolkataMonthKey(at);
  const counterKey = quotaCounterKey(bucket, monthKey, phone);
  await redis.incr(counterKey);
  const ttl = normalizePhoneForQuota(phone) ? PHONE_QUOTA_TTL_SECONDS : MONTH_TTL_SECONDS;
  await redis.expire(counterKey, ttl);
}

/**
 * Releases a reservation after an internal FAILURE.
 *  - Free generation: nothing was ever committed, so the slot is already
 *    free. We keep the sticky free decision so a retry with the same
 *    generationId stays free (and a brand-new request also stays free
 *    because the committed counter never moved).
 *  - Paid generation: intentionally NOT downgraded — the ₹20 decision is
 *    sticky so a retry never re-charges. (If the customer's proof was
 *    accepted, the charge stands regardless of our generation retries.)
 *
 * This function exists mainly as the explicit, documented failure hook and
 * for symmetry; the commit-on-success model means a failed FREE generation
 * requires no counter mutation to be "released".
 */
export async function releaseReservation(_generationId: string): Promise<void> {
  // No-op by construction: nothing is consumed until commit-on-success.
  // Kept as the named hook the failure path calls so the intent is explicit
  // and future storage models can plug real release logic here.
  return;
}

/**
 * Reads current committed free usage for a chat this month WITHOUT
 * deciding/committing. Useful for telling the customer whether their next
 * generation is free.
 */
export async function peekUsage(
  customerChatId: string,
  optionsOrDate?: { phone?: string; at?: Date } | Date,
): Promise<{ committedFreeThisMonth: number; freeAllowance: number; nextIsFree: boolean; monthKey: string; priceInr: number }> {
  const at = optionsOrDate instanceof Date ? optionsOrDate : optionsOrDate?.at ?? new Date();
  const phone = optionsOrDate instanceof Date ? undefined : optionsOrDate?.phone;
  const redis = getRedis();
  const env = getEnv();
  const monthKey = kolkataMonthKey(at);
  const bucket = chatBucket(customerChatId);
  const counterKey = quotaCounterKey(bucket, monthKey, phone);
  const raw = await redis.get<number>(counterKey);
  const committedFreeThisMonth = typeof raw === "number" ? raw : 0;
  return {
    committedFreeThisMonth,
    freeAllowance: env.MOCKUP_FREE_PER_MONTH,
    nextIsFree: committedFreeThisMonth < env.MOCKUP_FREE_PER_MONTH,
    monthKey,
    priceInr: computeMockupFee(),
  };
}
