import { getEnv } from "../config/env.js";
import type { OrderData } from "../shared/types.js";
import { saveOrderSnapshot } from "../session/orderStore.js";
import { sendMessage } from "../whatsapp/metaClient.js";
import { getPublicMediaUrl } from "../whatsapp/media.js";
import { createApprovalCode } from "./approvalCode.js";
import { createPortalToken, getPortalUrl, getResendOtpUrl } from "./approvalToken.js";
import { sendAdminOrderAlertEmail } from "./email.js";

/** 
 * Sends the admin alert email with 2-step OTP and portal link for order verification.
 */
export async function notifyAdmins(order: OrderData, screenshotUrlOrId: string): Promise<void> {
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
    } else {
      console.log(`[notifyAdmins] Admin order alert email dispatched successfully for ${order.orderId}`);
    }
  } catch (emailErr) {
    console.error(`[notifyAdmins] Error sending order alert email for ${order.orderId}:`, emailErr);
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
