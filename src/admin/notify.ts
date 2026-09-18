import { getEnv } from "../config/env.js";
import { renderAdminCard } from "../shared/render.js";
import type { OrderData } from "../shared/types.js";
import { saveOrderSnapshot } from "../session/orderStore.js";
import { sendInteractiveButtons, sendMedia, sendMessage } from "../whatsapp/zaptiloClient.js";

function adminActionButtons(orderId: string) {
  return [
    { id: `admin:confirm:${orderId}`, title: "✅ Confirm" },
    { id: `admin:issue:${orderId}`, title: "🚩 Issue" }
  ];
}

/** Sends the admin card (with forwarded screenshot) to all configured admin chats. */
export async function notifyAdmins(order: OrderData, screenshotUrl: string): Promise<void> {
  const env = getEnv();
  const card = renderAdminCard(order);
  const buttons = adminActionButtons(order.orderId);

  // Snapshot the full order so the admin Confirm action can trigger mockup
  // generation later — the admin card's caption text alone doesn't carry
  // enough fields (productId, logoFileId, logoPlacement) for that.
  await saveOrderSnapshot(order).catch((err) => console.error("Failed to save order snapshot", err));

  for (const adminChatId of env.ADMIN_CHAT_IDS) {
    try {
      if (screenshotUrl) {
         await sendMedia(adminChatId, screenshotUrl, undefined);
      }
      await sendInteractiveButtons(adminChatId, card, buttons);
    } catch (err) {
      // Escalate as plain text if photo forwarding fails — money events cannot vanish.
      await sendInteractiveButtons(
        adminChatId, 
        `${card}\n\n(⚠️ screenshot forward failed: ${String(err)})`, 
        buttons
      ).catch(() => {});
    }
  }
}

/** Sends a plain-text notification to all admin chats (leads, escalations, heartbeat). */
export async function notifyAdminsText(text: string): Promise<void> {
  const env = getEnv();
  for (const adminChatId of env.ADMIN_CHAT_IDS) {
    await sendMessage(adminChatId, text).catch(() => {});
  }
}
