import { getEnv } from "../config/env.js";
import { renderAdminCard } from "../shared/render.js";
import type { OrderData } from "../shared/types.js";
import { saveOrderSnapshot } from "../session/orderStore.js";
import { sendMedia, sendMessage } from "../whatsapp/metaClient.js";
import { getPublicMediaUrl } from "../whatsapp/media.js";
import { createApprovalCode } from "./approvalCode.js";
import { createPortalToken, getPortalUrl, getResendOtpUrl } from "./approvalToken.js";
import { sendAdminOrderAlertEmail } from "./email.js";

/** 
 * Sends the admin alert email with 2-step OTP and portal link,
 * and additionally forwards the card to configured admin WhatsApp chats.
 */
export async function notifyAdmins(order: OrderData, screenshotUrlOrId: string): Promise<void> {
  const env = getEnv();

  // 1. Convert WhatsApp media ID to public URL if needed
  let publicUrl: string | undefined = undefined;
  if (screenshotUrlOrId) {
    if (/^https?:\/\//i.test(screenshotUrlOrId)) {
      publicUrl = screenshotUrlOrId;
    } else {
      publicUrl = await getPublicMediaUrl(screenshotUrlOrId, `proofs/${order.orderId}`).catch(() => undefined);
    }
  }

  // Attach screenshot URL to order object for snapshots and display
  if (publicUrl) {
    order.paymentScreenshotUrl = publicUrl;
  }

  // 2. Snapshot the full order so the admin portal and actions can access all fields
  await saveOrderSnapshot(order).catch((err) => console.error("[notifyAdmins] Failed to save order snapshot", err));

  // 3. Generate 6-digit approval code (30 mins validity)
  const code = await createApprovalCode("order", order.orderId);

  // 4. Generate secure portal URL and fail-safe secondary OTP URL
  const token = createPortalToken(order.orderId);
  const portalUrl = getPortalUrl(order.orderId, token);
  const resendOtpUrl = getResendOtpUrl(order.orderId, token);

  // 5. Dispatch email via Resend to ADMIN_EMAILS
  try {
    const emailRes = await sendAdminOrderAlertEmail(order, code, portalUrl, resendOtpUrl, publicUrl);
    if (!emailRes.ok) {
      console.warn(`[notifyAdmins] Resend email warning for ${order.orderId}:`, emailRes.error);
    }
  } catch (emailErr) {
    console.error(`[notifyAdmins] Error sending order alert email for ${order.orderId}:`, emailErr);
  }

  // 6. As a secondary/convenience channel, also send WhatsApp notification to admin chats
  const card = renderAdminCard(order);
  const approvalMessage =
    `${card}\n\n` +
    `🔐 *Approval Code:* \`${code}\`\n` +
    `⏱️ (Valid for 30 minutes)\n\n` +
    `👉 *Review & Confirm on Web Portal:*\n${portalUrl}\n\n` +
    `Or reply with the 6-digit code \`${code}\`\n\n` +
    `If there is a payment problem, reply with: *ISSUE ${order.orderId}*`;

  for (const adminChatId of env.ADMIN_CHAT_IDS) {
    if (publicUrl) {
      try {
        await sendMedia(adminChatId, publicUrl, `Payment screenshot for ${order.orderId}`);
      } catch (err) {
        console.warn(`[notifyAdmins] Could not send image to admin ${adminChatId}:`, err);
      }
    }

    try {
      await sendMessage(adminChatId, approvalMessage);
    } catch (err) {
      console.warn(`[notifyAdmins] Note: WhatsApp message to admin ${adminChatId} could not be delivered (Meta 24h window). Email was dispatched.`);
    }
  }
}

/** Sends a plain-text notification to all admin chats and logs it. */
export async function notifyAdminsText(text: string): Promise<void> {
  const env = getEnv();
  console.log(`[notifyAdminsText] Escalation/Notice: ${text}`);

  for (const adminChatId of env.ADMIN_CHAT_IDS) {
    try {
      await sendMessage(adminChatId, text);
    } catch (err) {
      console.warn(`[notifyAdminsText] Failed to send text to admin ${adminChatId}:`, err);
    }
  }
}
