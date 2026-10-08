/**
 * Admin card action handlers — PRD §7.5, §8.1, AC6, AC8.
 * ✅ Confirm -> Confirmed + customer auto-DM (irreversible, idempotent).
 * 🚩 Issue -> Payment Issue (agent follows up manually).
 * Gated server-side by chat_id ∈ ADMIN_CHAT_IDS; non-admin presses are
 * ignored + logged (never silently succeed).
 */

import { getEnv } from "../config/env.js";
import { COPY } from "../conversation/copy.js";
import { updateOrderRowStatus } from "../sheets/client.js";
import { renderConfirmationDm } from "../shared/render.js";
import { getRedis } from "../session/redisClient.js";
import { approvePaidGeneration, rejectPaidGeneration } from "../mockup/paidGeneration.js";
import { sendMessage } from "../whatsapp/metaClient.js";

const PROCESSED_TTL_SECONDS = 90 * 24 * 60 * 60; // long enough to safely catch duplicate presses

function isAuthorizedAdmin(chatId: string | undefined): boolean {
  if (chatId === undefined) return false;
  return getEnv().ADMIN_CHAT_IDS.includes(chatId);
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

  const existing = await getProcessedAction(orderId);
  if (existing) {
    await sendMessage(chatId, COPY.alreadyProcessed);
    return;
  }

  const claimed = await markProcessedIfFirst(orderId, action);
  if (!claimed) {
    await sendMessage(chatId, COPY.alreadyProcessed);
    return;
  }

  if (action === "confirm") {
    await updateOrderRowStatus(orderId, "Confirmed").catch(async (err) => {
      console.error("Failed to update sheet on confirm", err);
    });
    await sendMessage(chatId, "Confirmed ✅");

    // Notify all OTHER admins that this order is now settled.
    const env = getEnv();
    for (const adminId of env.ADMIN_CHAT_IDS) {
      if (adminId !== chatId) {
        await sendMessage(adminId, `✅ Order ${orderId} was confirmed by another admin.`).catch(() => {});
      }
    }

    // Recover the customer chat id from the context message, or we might need it passed in / retrieved
    // Actually, in Meta Cloud API, we don't have the message caption in the callback like in Telegram.
    // We should fetch the order snapshot from redis or sheets to get customerChatId.
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

  } else {
    await updateOrderRowStatus(orderId, "Payment Issue").catch((err) => {
      console.error("Failed to update sheet on issue", err);
    });
    await sendMessage(chatId, "Marked as Payment Issue 🚩");
  }
}

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
    // using generic admin name since we don't have it natively mapped in whatsapp yet
    const result = await approvePaidGeneration(generationId, "Admin");
    if (!result.ok && !result.changed) {
      await sendMessage(chatId, result.reason ?? "Could not approve.");
      return;
    }
    await sendMessage(chatId, result.changed ? "Approved ✅ — generating" : "Already handled");
  } else {
    const result = await rejectPaidGeneration(generationId, "Admin");
    if (!result.ok && !result.changed) {
      await sendMessage(chatId, result.reason ?? "Could not reject.");
      return;
    }
    await sendMessage(chatId, result.changed ? "Rejected 🚩" : "Already handled");
  }
}
