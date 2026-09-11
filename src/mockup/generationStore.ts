/**
 * Persistence for MockupGeneration records — one row per mockup-generation
 * REQUEST, keyed by a stable generationId so the whole workflow (quota
 * reservation, payment proof, admin approval, generation, durable storage)
 * is idempotent under duplicate webhooks, retries, and double-clicks.
 *
 * Backed by Upstash Redis (same instance as sessions/counters). Records
 * are retained well past any realistic admin-verification / retry window.
 *
 * IDEMPOTENCY MODEL:
 *  - createGenerationIfAbsent() uses SET NX so exactly one caller ever
 *    creates the record for a given generationId; concurrent callers get
 *    back the already-stored record instead of a second one.
 *  - Status changes go through advanceStatus(), which enforces a
 *    forward-only state machine — a duplicate "approve"/"generate" that
 *    arrives after the record already moved on is a no-op, not a re-charge
 *    or a re-generation.
 */

import { getRedis } from "../session/redisClient.js";
import type {
  MockupGeneration,
  MockupGenerationStatus,
  MockupOutputImage,
} from "../shared/types.js";
import { upsertMockupGenerationRow } from "../sheets/mockupGenerations.js";

const TTL_SECONDS = 60 * 24 * 60 * 60; // 60 days — comfortably past any retry/verification window

function key(generationId: string): string {
  return `mockupgen:${generationId}`;
}

/** Index key so we can find a chat's generation for an order (used by admin callbacks). */
function orderIndexKey(orderId: string): string {
  return `mockupgen:order:${orderId}`;
}

/** Index key so a bare payment-proof photo can be matched to a chat's pending paid generation. */
function chatPendingKey(customerChatId: string): string {
  return `mockupgen:pending:${customerChatId}`;
}

/** Marks (or clears) the chat's currently-pending paid generation awaiting a payment proof. */
export async function setChatPendingGeneration(customerChatId: string, generationId: string | null): Promise<void> {
  const redis = getRedis();
  if (generationId === null) {
    await redis.del(chatPendingKey(customerChatId));
    return;
  }
  await redis.set(chatPendingKey(customerChatId), generationId, { ex: TTL_SECONDS });
}

/** Returns the chat's pending paid generation id, if any. */
export async function getChatPendingGenerationId(customerChatId: string): Promise<string | undefined> {
  const redis = getRedis();
  const id = await redis.get<string>(chatPendingKey(customerChatId));
  return id ?? undefined;
}

/**
 * Forward-only transitions. A missing entry means "terminal" (no further
 * transitions allowed). Any transition not listed is rejected, so a
 * duplicate callback that tries to repeat a past step is a safe no-op.
 */
const ALLOWED_TRANSITIONS: Record<MockupGenerationStatus, MockupGenerationStatus[]> = {
  reserved: ["awaiting_payment", "generating"], // paid -> awaiting_payment; free -> straight to generating
  awaiting_payment: ["awaiting_approval"],
  awaiting_approval: ["approved", "rejected"],
  approved: ["generating"],
  rejected: [],
  generating: ["completed", "failed"],
  completed: [],
  failed: ["generating"], // an internal failure may be retried WITHOUT re-charging (see quota reservation)
};

export function canAdvance(from: MockupGenerationStatus, to: MockupGenerationStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function loadGeneration(generationId: string): Promise<MockupGeneration | undefined> {
  const redis = getRedis();
  const value = await redis.get<MockupGeneration>(key(generationId));
  return value ?? undefined;
}

export async function loadGenerationForOrder(orderId: string): Promise<MockupGeneration | undefined> {
  const redis = getRedis();
  const generationId = await redis.get<string>(orderIndexKey(orderId));
  if (!generationId) return undefined;
  return loadGeneration(generationId);
}

async function save(record: MockupGeneration): Promise<void> {
  const redis = getRedis();
  record.updatedAt = new Date().toISOString();
  await redis.set(key(record.generationId), record, { ex: TTL_SECONDS });
  // Mirror to the durable audit sheet (upsert — same row, no duplicates).
  // Never throws (escalates internally) so a sheet outage can't break the
  // authoritative Redis state transition.
  await upsertMockupGenerationRow(record).catch(() => {});
}

export interface CreateGenerationInput {
  generationId: string;
  orderId: string;
  customerChatId: string;
  requestedViews: MockupGeneration["requestedViews"];
  logos: MockupGeneration["logos"];
  catalogSelection?: MockupGeneration["catalogSelection"];
  garmentReferenceRef?: string;
}

/**
 * Creates the record iff it doesn't already exist (SET NX). Returns the
 * effective record either way — so a duplicate request for the same
 * generationId reuses the existing one and never spawns a second workflow.
 */
export async function createGenerationIfAbsent(
  input: CreateGenerationInput,
): Promise<MockupGeneration> {
  const redis = getRedis();
  const now = new Date().toISOString();
  const record: MockupGeneration = {
    generationId: input.generationId,
    orderId: input.orderId,
    customerChatId: input.customerChatId,
    status: "reserved",
    free: false, // set authoritatively by the quota reservation step
    amountInr: 0,
    monthKey: "",
    catalogSelection: input.catalogSelection,
    garmentReferenceRef: input.garmentReferenceRef,
    requestedViews: input.requestedViews,
    logos: input.logos,
    outputs: [],
    createdAt: now,
    updatedAt: now,
  };

  const created = await redis.set(key(input.generationId), record, {
    nx: true,
    ex: TTL_SECONDS,
  });
  if (created === "OK") {
    // Index by order so admin callbacks can find it from an order id alone.
    await redis.set(orderIndexKey(input.orderId), input.generationId, { ex: TTL_SECONDS });
    // Write the initial durable audit row.
    await upsertMockupGenerationRow(record).catch(() => {});
    return record;
  }
  // Someone else created it first — return the authoritative stored copy.
  const existing = await loadGeneration(input.generationId);
  return existing ?? record;
}

/** Thrown when an out-of-order status change is attempted. */
export class InvalidGenerationTransitionError extends Error {
  constructor(from: MockupGenerationStatus, to: MockupGenerationStatus) {
    super(`Illegal mockup-generation transition ${from} -> ${to}`);
    this.name = "InvalidGenerationTransitionError";
  }
}

export interface AdvanceResult {
  record: MockupGeneration;
  /** True when this call actually performed the transition; false when it was already there (idempotent no-op). */
  changed: boolean;
}

/**
 * Advances a generation to a new status, applying optional field patches.
 * - If the record is already AT `to`, this is an idempotent no-op
 *   (changed=false) — safe under duplicate callbacks.
 * - If the transition is not allowed from the current status, throws.
 */
export async function advanceStatus(
  generationId: string,
  to: MockupGenerationStatus,
  patch: Partial<MockupGeneration> = {},
): Promise<AdvanceResult> {
  const record = await loadGeneration(generationId);
  if (!record) throw new Error(`MockupGeneration ${generationId} not found`);

  if (record.status === to) {
    // Duplicate delivery of the same step — merge any patch idempotently
    // but report no state change so callers don't re-run side effects.
    const merged = { ...record, ...patch, status: to };
    await save(merged);
    return { record: merged, changed: false };
  }

  if (!canAdvance(record.status, to)) {
    throw new InvalidGenerationTransitionError(record.status, to);
  }

  const merged: MockupGeneration = { ...record, ...patch, status: to };
  if (to === "completed") merged.completedAt = new Date().toISOString();
  await save(merged);
  return { record: merged, changed: true };
}

/** Records the quota outcome (free vs paid + amount + month) onto the record. */
export async function setQuotaOutcome(
  generationId: string,
  outcome: { free: boolean; amountInr: number; monthKey: string },
): Promise<MockupGeneration> {
  const record = await loadGeneration(generationId);
  if (!record) throw new Error(`MockupGeneration ${generationId} not found`);
  const merged: MockupGeneration = { ...record, ...outcome };
  await save(merged);
  return merged;
}

/**
 * Atomically claims the single approve/reject decision for a generation.
 * Returns true only for the first caller; concurrent duplicate presses
 * (two admins, a double-click, a duplicate callback) get false and must
 * not proceed. This closes the read-then-write race in advanceStatus for
 * the one irreversible, side-effect-bearing transition (approval triggers
 * a paid generation; we must run it exactly once).
 */
export async function claimDecision(
  generationId: string,
  decision: "approve" | "reject",
): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.set(`mockupgen:decision:${generationId}`, decision, {
    nx: true,
    ex: TTL_SECONDS,
  });
  return result === "OK";
}

/** Appends/replaces a produced output image (idempotent per view). */
export async function recordOutput(
  generationId: string,
  output: MockupOutputImage,
): Promise<MockupGeneration> {
  const record = await loadGeneration(generationId);
  if (!record) throw new Error(`MockupGeneration ${generationId} not found`);
  const outputs = record.outputs.filter((o) => o.view !== output.view);
  outputs.push(output);
  const merged: MockupGeneration = { ...record, outputs };
  await save(merged);
  return merged;
}
