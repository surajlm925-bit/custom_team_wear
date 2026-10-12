/**
 * Admin card action handlers — PRD §7.5, §8.1, AC6, AC8.
 * ✅ Confirm -> Confirmed + customer auto-DM (irreversible, idempotent).
 * 🚩 Issue -> Payment Issue (agent follows up manually).
 * Gated server-side by chat_id ∈ ADMIN_CHAT_IDS; non-admin presses are
 * ignored + logged (never silently succeed).
 * Supports both button callbacks and 6-digit 2-minute verification codes.
 */

import { getEnv } from "../config/env.js";
import { COPY } from "../conversation/copy.js";
import { updateOrderRowStatus } from "../sheets/client.js";
import { renderConfirmationDm } from "../shared/render.js";
import { getRedis } from "../session/redisClient.js";
import { approvePaidGeneration, rejectPaidGeneration } from "../mockup/paidGeneration.js";
import { sendMessage } from "../whatsapp/metaClient.js";
import { verifyAndConsumeApprovalCode } from "./approvalCode.js";

const PROCESSED_TTL_SECONDS = 90 * 24 * 60 * 60; // long enough to safely catch duplicate presses

/** Normalize phone number or chat ID by stripping 'wa:', '+', and leading spaces */
export function normalizeAdminChatId(chatId: string | undefined): string {
  if (!chatId) return "";
  let id = chatId.trim();
  if (id.startsWith("wa:")) id = id.slice(3);
  if (id.startsWith("+")) id = id.slice(1);
  return id;
}

export function isAuthorizedAdmin(chatId: string | undefined): boolean {
  if (chatId === undefined) return false;
  const normalizedIncoming = normalizeAdminChatId(chatId);
  const configured = getEnv().ADMIN_CHAT_IDS.map(normalizeAdminChatId);
  return configured.includes(normalizedIncoming);
}

async function markProcessedIfFirst(orderId: string, action: "confirm" | "issue"): Promise<boolean> {
  const redis = getRedis();
  const key = `admin-action:${orderId}`;
  const result = await redis.set(key, action, { nx: true, ex: PROCESSED_TTL_SECONDS });
  return result === "OK";
}

async function getProcessedAction(orderId: string): Promise<string | null> {
  const redis = getRedis();
  return redis.get<string>(`admin-action:${orderId}`);
}

/** Handles confirmation execution for an order */
export async function executeOrderConfirm(orderId: string, adminChatId: string): Promise<void> {
  const existing = await getProcessedAction(orderId);
  if (existing) {
    await sendMessage(adminChatId, COPY.alreadyProcessed);
    return;
  }

  const claimed = await markProcessedIfFirst(orderId, "confirm");
  if (!claimed) {
    await sendMessage(adminChatId, COPY.alreadyProcessed);
    return;
  }

  await updateOrderRowStatus(orderId, "Confirmed").catch(async (err) => {
    console.error("Failed to update sheet on confirm", err);
  });
  await sendMessage(adminChatId, `Confirmed ✅ Order ${orderId} marked as confirmed.`);

  // Notify all OTHER admins that this order is now settled.
  const env = getEnv();
  const normalizedSender = normalizeAdminChatId(adminChatId);
  for (const adminId of env.ADMIN_CHAT_IDS) {
    if (normalizeAdminChatId(adminId) !== normalizedSender) {
      await sendMessage(adminId, `✅ Order ${orderId} was confirmed by admin.`).catch(() => {});
    }
  }

  // Recover the customer chat id from the order snapshot in Redis
  const redis = getRedis();
  const snapshotStr = await redis.get<any>(`order:${orderId}`);
  if (snapshotStr) {
    try {
      const orderSnap = typeof snapshotStr === "string" ? JSON.parse(snapshotStr) : snapshotStr;
      const customerChatId = orderSnap.customerChatId;
      const dmText = renderConfirmationDm(orderId);
      await sendMessage(customerChatId, dmText).catch((err) => console.error("Failed to DM customer on confirm", err));
    } catch (err) {
      console.error("Failed to parse order snapshot for confirmation DM", err);
    }
  } else {
    console.error(`Could not find order snapshot for order ${orderId}`);
  }
}

/** Handles issue execution for an order */
export async function executeOrderIssue(orderId: string, adminChatId: string): Promise<void> {
  const existing = await getProcessedAction(orderId);
  if (existing) {
    await sendMessage(adminChatId, COPY.alreadyProcessed);
    return;
  }

  const claimed = await markProcessedIfFirst(orderId, "issue");
  if (!claimed) {
    await sendMessage(adminChatId, COPY.alreadyProcessed);
    return;
  }

  await updateOrderRowStatus(orderId, "Payment Issue").catch((err) => {
    console.error("Failed to update sheet on issue", err);
  });
  await sendMessage(adminChatId, `Marked as Payment Issue 🚩 for ${orderId}`);
}

/** Handles approval execution for a paid mockup */
export async function executeMockupApprove(generationId: string, adminChatId: string): Promise<void> {
  const result = await approvePaidGeneration(generationId, "Admin");
  if (!result.ok && !result.changed) {
    await sendMessage(adminChatId, result.reason ?? "Could not approve.");
    return;
  }
  await sendMessage(adminChatId, result.changed ? "Approved ✅ — generating mockup now." : "Already handled");
}

/** Handles reject execution for a paid mockup */
export async function executeMockupReject(generationId: string, adminChatId: string): Promise<void> {
  const result = await rejectPaidGeneration(generationId, "Admin");
  if (!result.ok && !result.changed) {
    await sendMessage(adminChatId, result.reason ?? "Could not reject.");
    return;
  }
  await sendMessage(adminChatId, result.changed ? "Rejected 🚩" : "Already handled");
}

/** Handles interactive button callbacks like admin:confirm:<orderId> */
export async function handleAdminAction(chatId: string, input: string, _message: any): Promise<void> {
  if (!isAuthorizedAdmin(chatId)) {
    console.warn(`Unauthorized admin action attempt from chat ${chatId}`);
    await sendMessage(chatId, COPY.adminUnauthorized);
    return;
  }

  const match = /^admin:(confirm|issue):(.+)$/.exec(input);
  if (!match) return;

  const action = match[1] as "confirm" | "issue";
  const orderId = match[2];

  if (action === "confirm") {
    await executeOrderConfirm(orderId, chatId);
  } else {
    await executeOrderIssue(orderId, chatId);
  }
}

/** Handles interactive button callbacks like mockupgen:approve:<generationId> */
export async function handleMockupGenAction(chatId: string, input: string, _message: any): Promise<void> {
  if (!isAuthorizedAdmin(chatId)) {
    console.warn(`Unauthorized paid-mockup action attempt from chat ${chatId}`);
    await sendMessage(chatId, COPY.adminUnauthorized);
    return;
  }

  const match = /^mockupgen:(approve|reject):(.+)$/.exec(input);
  if (!match) return;

  const decision = match[1] as "approve" | "reject";
  const generationId = match[2];

  if (decision === "approve") {
    await executeMockupApprove(generationId, chatId);
  } else {
    await executeMockupReject(generationId, chatId);
  }
}

/**
 * Handles typed messages from admins:
 * 1. 6-digit confirmation codes (e.g. "482910")
 * 2. Text command fallbacks (e.g. "CONFIRM CTW-261012-01", "APPROVE CTW-261012-01")
 */
export async function handleAdminTextCommand(chatId: string, text: string): Promise<boolean> {
  if (!isAuthorizedAdmin(chatId)) return false;

  const trimmed = text.trim();

  // 1. Check for 6-digit numeric approval code
  if (/^\d{6}$/.test(trimmed)) {
    const pending = await verifyAndConsumeApprovalCode(trimmed);
    if (!pending) {
      await sendMessage(
        chatId,
        "⚠️ That approval code is invalid or has expired (codes expire after 2 minutes). Please tap the button or generate a new code.",
      );
      return true;
    }

    if (pending.type === "order") {
      await executeOrderConfirm(pending.id, chatId);
    } else if (pending.type === "mockup") {
      await executeMockupApprove(pending.id, chatId);
    }
    return true;
  }

  // 2. Check for text command fallback "CONFIRM <orderId>"
  const confirmMatch = /^(?:confirm|approve)\s+([a-zA-Z0-9_-]+)$/i.exec(trimmed);
  if (confirmMatch) {
    const id = confirmMatch[1];
    // Check if it's an order or mockup
    const redis = getRedis();
    const orderSnap = await redis.get(`order:${id}`);
    if (orderSnap) {
      await executeOrderConfirm(id, chatId);
      return true;
    }
    const gen = await redis.get(`mockupgen:${id}`);
    if (gen) {
      await executeMockupApprove(id, chatId);
      return true;
    }
    // Fallback: try order confirm
    await executeOrderConfirm(id, chatId);
    return true;
  }

  // 3. Check for text command fallback "ISSUE <orderId>" or "REJECT <id>"
  const issueMatch = /^(?:issue|reject)\s+([a-zA-Z0-9_-]+)$/i.exec(trimmed);
  if (issueMatch) {
    const id = issueMatch[1];
    const redis = getRedis();
    const gen = await redis.get(`mockupgen:${id}`);
    if (gen) {
      await executeMockupReject(id, chatId);
      return true;
    }
    await executeOrderIssue(id, chatId);
    return true;
  }

  return false;
}
