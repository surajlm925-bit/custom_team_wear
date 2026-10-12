import { getEnv } from "../config/env.js";
import { renderAdminCard } from "../shared/render.js";
import type { OrderData } from "../shared/types.js";
import { saveOrderSnapshot } from "../session/orderStore.js";
import { sendInteractiveButtons, sendMedia, sendMessage } from "../whatsapp/metaClient.js";
import { getPublicMediaUrl } from "../whatsapp/media.js";
import { createApprovalCode } from "./approvalCode.js";

function adminActionButtons(orderId: string) {
  return [
    { id: `admin:confirm:${orderId}`, title: "✅ Confirm" },
    { id: `admin:issue:${orderId}`, title: "🚩 Issue" }
  ];
}

/** Sends the admin card (with forwarded screenshot & 6-digit confirmation code) to all configured admin chats. */
export async function notifyAdmins(order: OrderData, screenshotUrlOrId: string): Promise<void> {
  const env = getEnv();
  const card = renderAdminCard(order);
  const buttons = adminActionButtons(order.orderId);

  // Snapshot the full order so the admin Confirm action can access all fields
  await saveOrderSnapshot(order).catch((err) => console.error("Failed to save order snapshot", err));

  // Convert WhatsApp media ID to public URL if needed
  let publicUrl: string | undefined = undefined;
  if (screenshotUrlOrId) {
    if (/^https?:\/\//i.test(screenshotUrlOrId)) {
      publicUrl = screenshotUrlOrId;
    } else {
      publicUrl = await getPublicMediaUrl(screenshotUrlOrId, `proofs/${order.orderId}`);
    }
  }

  // Generate 6-digit 2-minute approval code
  const code = await createApprovalCode("order", order.orderId);

  const approvalInstruction = `\n\n🔐 *Approval Code:* \`${code}\`\n(Valid for 2 minutes. Tap Confirm or reply with \`${code}\` to confirm payment.)`;

  for (const adminChatId of env.ADMIN_CHAT_IDS) {
    // 1. Try sending the screenshot image if publicUrl exists
    if (publicUrl) {
      try {
        await sendMedia(adminChatId, publicUrl, `Payment screenshot for ${order.orderId}`);
      } catch (err) {
        console.warn(`[notifyAdmins] Could not send image to admin ${adminChatId}:`, err);
      }
    }

    // 2. Try sending interactive buttons
    let interactiveSent = false;
    try {
      await sendInteractiveButtons(adminChatId, `${card}${approvalInstruction}`, buttons);
      interactiveSent = true;
    } catch (err) {
      console.warn(`[notifyAdmins] Interactive buttons failed for admin ${adminChatId} (may be outside 24h window or not supported):`, err);
    }

    // 3. Fallback to plain text message (standard for WhatsApp Business accounts)
    if (!interactiveSent) {
      try {
        await sendMessage(
          adminChatId,
          `${card}${approvalInstruction}\n\n*Actions:*\n• Reply with \`${code}\` or *CONFIRM ${order.orderId}* to approve.\n• Reply with *ISSUE ${order.orderId}* to flag issue.`,
        );
      } catch (err) {
        console.error(`[notifyAdmins] Failed to send message to admin ${adminChatId}:`, err);
      }
    }
  }
}

/** Sends a plain-text notification to all admin chats (leads, escalations, heartbeat). */
export async function notifyAdminsText(text: string): Promise<void> {
  const env = getEnv();
  for (const adminChatId of env.ADMIN_CHAT_IDS) {
    try {
      await sendMessage(adminChatId, text);
    } catch (err) {
      console.error(`[notifyAdminsText] Failed to send text to admin ${adminChatId}:`, err);
    }
  }
}
