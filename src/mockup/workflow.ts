/**
 * Mockup-generation workflow orchestrator — ties together the monthly
 * quota (quota.ts), the durable generation record (generationStore.ts),
 * and the generation pipeline (deliver.ts) into the free vs paid decision.
 *
 * ENTRY POINT: startMockupGeneration(order) — invoked (via
 * /api/mockup-delivery) for each order whose customer opted into a mockup,
 * AFTER logo upload and BEFORE the garment-payment step. It is fully idempotent: the generationId is
 * derived from the orderId, so a duplicate admin confirm / duplicate
 * webhook re-enters the SAME workflow instead of reserving a second quota
 * slot or charging twice.
 *
 * DECISION:
 *  - Reserve one generation against the chat's Kolkata-month quota.
 *  - free  -> record goes reserved → generating (deliver runs now).
 *  - paid  -> record goes reserved → awaiting_payment; the customer is
 *             asked for a dedicated payment proof and NOTHING is generated
 *             until an admin explicitly approves (see paidGeneration.ts).
 */

import type { OrderData } from "../shared/types.js";
import { reserveGeneration } from "./quota.js";
import {
  createGenerationIfAbsent,
  loadGeneration,
  setQuotaOutcome,
  advanceStatus,
  setChatPendingGeneration,
} from "./generationStore.js";
import { requestedViewsForOrder, deliverMockupForOrder, type MockupDeliveryDeps } from "./deliver.js";

/** Stable, deterministic generation id for an order's mockup request. */
export function generationIdForOrder(orderId: string): string {
  return orderId;
}

export type StartOutcome =
  | { kind: "generated"; urls: string[] }
  | { kind: "generation-failed"; reason: string }
  | { kind: "payment-required"; amountInr: number; generationId: string }
  | { kind: "awaiting-approval" }
  | { kind: "already-completed"; urls: string[] }
  | { kind: "skipped"; reason: string };

/**
 * Begins (or idempotently resumes) the mockup workflow for an order.
 * Returns what the caller should do next (charge the customer, wait for
 * admin approval, or nothing — generation already ran/completed).
 */
export async function startMockupGeneration(
  order: OrderData,
  deps: MockupDeliveryDeps = {},
): Promise<StartOutcome> {
  if (!order.logoReceived || order.logos.length === 0) {
    return { kind: "skipped", reason: "no artwork uploaded" };
  }

  const generationId = generationIdForOrder(order.orderId);

  // Resume, if this order's workflow already progressed.
  const existing = await loadGeneration(generationId).catch(() => undefined);
  if (existing) {
    if (existing.status === "completed") {
      return { kind: "already-completed", urls: existing.outputs.map((o) => o.url).filter((u): u is string => Boolean(u)) };
    }
    if (existing.status === "awaiting_payment") {
      return { kind: "payment-required", amountInr: existing.amountInr, generationId };
    }
    if (existing.status === "awaiting_approval") {
      return { kind: "awaiting-approval" };
    }
    // A PAID generation that was already approved (or is mid-generation) —
    // including a "failed" retry of one — must NOT be re-quoted for
    // payment. Re-run generation directly; the sticky paid decision means
    // no second ₹20 is ever asked for or charged.
    if (!existing.free && (existing.status === "approved" || existing.status === "generating" || existing.status === "failed")) {
      const outcome = await deliverMockupForOrder(order, deps);
      return outcome.delivered
        ? { kind: "generated", urls: outcome.urls ?? [] }
        : { kind: "generation-failed", reason: outcome.reason ?? "unknown" };
    }
    // Free reserved/generating/failed fall through to (re)run the free
    // generation below without re-reserving quota (sticky free decision).
  }

  // Create the durable record (idempotent — SET NX).
  await createGenerationIfAbsent({
    generationId,
    orderId: order.orderId,
    customerChatId: order.customerChatId,
    requestedViews: requestedViewsForOrder(order),
    logos: order.logos,
    catalogSelection: order.catalogSelection,
    garmentReferenceRef:
      order.catalogSelection?.referenceImagePath ?? order.catalogSelection?.referenceImageUrl,
  });

  // Reserve against the monthly quota (idempotent per generationId — a
  // retry never consumes a second slot or re-charges).
  const reservation = await reserveGeneration(order.customerChatId, generationId);
  await setQuotaOutcome(generationId, {
    free: reservation.free,
    amountInr: reservation.amountInr,
    monthKey: reservation.monthKey,
  });

  if (!reservation.free) {
    // Paid path: park in awaiting_payment and let the caller collect a
    // dedicated payment proof. No generation happens yet.
    const current = await loadGeneration(generationId);
    if (current?.status === "reserved") {
      await advanceStatus(generationId, "awaiting_payment").catch(() => {});
    }
    // Index so a bare payment-proof photo from this chat can be matched.
    await setChatPendingGeneration(order.customerChatId, generationId).catch(() => {});
    return { kind: "payment-required", amountInr: reservation.amountInr, generationId };
  }

  // Free path: run generation immediately.
  const outcome = await deliverMockupForOrder(order, deps);
  if (outcome.delivered) {
    return { kind: "generated", urls: outcome.urls ?? [] };
  }
  return { kind: "generation-failed", reason: outcome.reason ?? "unknown" };
}
