/**
 * Paid mockup-generation: dedicated payment-proof intake + admin
 * Approve/Reject gating. A paid generation (#4+ in a Kolkata month) must
 * pass through BOTH steps before any image is produced:
 *
 *   1. attachPaymentProof()  — the customer sends a screenshot; the
 *      record moves awaiting_payment → awaiting_approval and the proof is
 *      forwarded to the admin chat with Approve/Reject buttons.
 *   2. approvePaidGeneration() / rejectPaidGeneration() — an admin
 *      (ADMIN_CHAT_IDS, checked server-side) decides. Only on approval
 *      does generation run.
 *
 * Every step is idempotent via the generation record's forward-only state
 * machine: a duplicate proof, a double-click Approve, or a stale Reject
 * after approval are all no-ops rather than re-charges or double sends.
 */

import { getEnv } from "../config/env.js";
import { COPY } from "../conversation/copy.js";
import type { OrderData } from "../shared/types.js";
import { loadOrderSnapshot } from "../session/orderStore.js";
import {
  loadGeneration,
  loadGenerationForOrder,
  advanceStatus,
  setChatPendingGeneration,
  claimDecision,
} from "./generationStore.js";
import { triggerMockupDelivery } from "./deliverTrigger.js";
import { sendMessage, sendInteractiveButtons } from "../whatsapp/zaptiloClient.js";

function decisionButtons(generationId: string) {
  return [
    { id: `mockupgen:approve:${generationId}`, title: "✅ Approve mockup" },
    { id: `mockupgen:reject:${generationId}`, title: "🚩 Reject" }
  ];
}

export interface AttachProofResult {
  ok: boolean;
  reason?: string;
}

/**
 * Records the customer's payment proof for a paid generation and forwards
 * it to admins for approval. Idempotent: re-sending a proof while already
 * awaiting_approval just re-notifies admins without changing state.
 */
export async function attachPaymentProof(
  generationId: string,
  paymentProofMessageId: string,
): Promise<AttachProofResult> {
  const record = await loadGeneration(generationId);
  if (!record) return { ok: false, reason: "generation not found" };

  if (record.status === "awaiting_payment") {
    const advanced = await advanceStatus(generationId, "awaiting_approval", { paymentProofMessageId });
    await forwardProofToAdmins(advanced.record, paymentProofMessageId);
    return { ok: true };
  }

  if (record.status === "awaiting_approval") {
    // Duplicate proof — refresh the stored message id, re-notify, no state change.
    await advanceStatus(generationId, "awaiting_approval", { paymentProofMessageId }).catch(() => {});
    await forwardProofToAdmins(record, paymentProofMessageId);
    return { ok: true };
  }

  // approved / generating / completed / rejected — proof no longer relevant.
  return { ok: false, reason: `generation is already ${record.status}` };
}

async function forwardProofToAdmins(
  record: { generationId: string; orderId: string; amountInr: number },
  _paymentProofMessageId: string,
): Promise<void> {
  const env = getEnv();
  const caption =
    `*Paid mockup approval needed*\n` +
    `Order: \`${record.orderId}\`\n` +
    `Amount: ₹${record.amountInr}\n\n` +
    `Verify this payment against your UPI/bank statement, then Approve or Reject.`;

  for (const adminChatId of env.ADMIN_CHAT_IDS) {
    try {
      // NOTE: For WhatsApp, if the user sent an image, we would ideally forward that image.
      // However, Zaptilo doesn't have a simple forward mechanism by message ID without downloading it first.
      // For now, we'll send a text message with the interactive buttons, and in a real app,
      // we'd download the image using the Zaptilo API and send it using sendMedia.
      // This is a known limitation of this migration step.
      await sendInteractiveButtons(adminChatId.toString(), caption, decisionButtons(record.generationId));
    } catch (err) {
      await sendMessage(adminChatId.toString(), `${caption}\n\n(⚠️ proof forward failed: ${String(err)})`).catch(() => {});
    }
  }
}

export interface DecisionResult {
  ok: boolean;
  /** True when THIS call performed the decision; false when it was already decided (idempotent). */
  changed: boolean;
  reason?: string;
}

/**
 * What happens to an order once a paid generation is approved.
 *
 * Production: dispatch to the standalone /api/mockup-delivery function
 * (src/mockup/deliverTrigger.ts) — generation must never run inline inside
 * the webhook/Zaptilo budget. The dispatch is idempotent: the generation
 * record is already `approved`, so the workflow's sticky paid decision
 * re-runs exactly one generation without re-charging.
 *
 * Tests inject this to run delivery synchronously with fake deps.
 */
export type AfterApprovalDeliver = (order: OrderData) => Promise<{ delivered: boolean; reason?: string }>;

const defaultAfterApprovalDeliver: AfterApprovalDeliver = async (order) => {
  await triggerMockupDelivery(order.orderId);
  // Fire-and-forget by design; failures surface via the generation
  // record + admin escalation in api/mockup-delivery.ts.
  return { delivered: true };
};
let afterApprovalDeliver: AfterApprovalDeliver = defaultAfterApprovalDeliver;
export function __setAfterApprovalDeliverForTests(fn?: AfterApprovalDeliver) {
  afterApprovalDeliver = fn ?? defaultAfterApprovalDeliver;
}

/**
 * Admin approves a paid generation → dispatch generation now. Idempotent: a
 * second Approve after the first (or after completion) is a no-op and does
 * NOT regenerate or re-charge.
 */
export async function approvePaidGeneration(
  generationId: string,
  adminChatId: string,
): Promise<DecisionResult> {
  const record = await loadGeneration(generationId);
  if (!record) return { ok: false, changed: false, reason: "generation not found" };

  // Already past the decision — treat as an idempotent success.
  if (record.status === "approved" || record.status === "generating" || record.status === "completed") {
    return { ok: true, changed: false };
  }
  if (record.status === "rejected") {
    return { ok: false, changed: false, reason: "already rejected" };
  }
  if (record.status !== "awaiting_approval") {
    return { ok: false, changed: false, reason: `cannot approve from ${record.status}` };
  }

  // Atomically claim THE decision — only one concurrent approve/reject can
  // win. This is what makes approval-triggered generation run exactly once
  // even under a double-click or two admins pressing at the same instant.
  const won = await claimDecision(generationId, "approve");
  if (!won) return { ok: true, changed: false };

  const advanced = await advanceStatus(generationId, "approved", { decidedByAdminChatId: adminChatId });
  if (!advanced.changed) {
    // Record moved on between the claim and the write (e.g. it was already
    // approved). Treat as idempotent success — do not regenerate.
    return { ok: true, changed: false };
  }
  await setChatPendingGeneration(record.customerChatId, null).catch(() => {});

  const order = await loadOrderSnapshot(record.orderId).catch(() => undefined);
  if (!order) {
    await advanceStatus(generationId, "failed", { failureReason: "order snapshot missing at approval" }).catch(() => {});
    return { ok: false, changed: true, reason: "order snapshot missing" };
  }

  // Tell the customer their payment cleared, then generate.
  const customerChatId = order.customerChatId.replace(/^wa:/, "");
  if (customerChatId) {
    await sendMessage(customerChatId, COPY.mockupPaidApprovedNote.trim()).catch(() => {});
  }

  const outcome = await afterApprovalDeliver(order);
  return { ok: outcome.delivered, changed: true, reason: outcome.delivered ? undefined : outcome.reason };
}

/**
 * Admin rejects a paid generation. Idempotent. Notifies the customer once.
 */
export async function rejectPaidGeneration(
  generationId: string,
  adminChatId: string,
): Promise<DecisionResult> {
  const record = await loadGeneration(generationId);
  if (!record) return { ok: false, changed: false, reason: "generation not found" };

  if (record.status === "rejected") return { ok: true, changed: false };
  if (record.status === "approved" || record.status === "generating" || record.status === "completed") {
    return { ok: false, changed: false, reason: `already ${record.status}` };
  }
  if (record.status !== "awaiting_approval") {
    return { ok: false, changed: false, reason: `cannot reject from ${record.status}` };
  }

  const won = await claimDecision(generationId, "reject");
  if (!won) return { ok: true, changed: false };

  const advanced = await advanceStatus(generationId, "rejected", { decidedByAdminChatId: adminChatId });
  if (!advanced.changed) return { ok: true, changed: false };
  await setChatPendingGeneration(record.customerChatId, null).catch(() => {});

  const order = await loadOrderSnapshot(record.orderId).catch(() => undefined);
  const customerChatId = order ? order.customerChatId.replace(/^wa:/, "") : null;
  if (customerChatId) {
    await sendMessage(customerChatId, COPY.mockupPaidRejected).catch(() => {});
  }
  return { ok: true, changed: true };
}

/** Convenience for the conversation layer: find the pending paid generation for a chat's order. */
export async function findPendingPaidGeneration(orderId: string) {
  const record = await loadGenerationForOrder(orderId).catch(() => undefined);
  if (!record) return undefined;
  if (record.status === "awaiting_payment" || record.status === "awaiting_approval") return record;
  return undefined;
}
