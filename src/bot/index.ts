import { getEnv } from "../config/env.js";
import { captureException, initSentry } from "../config/sentry.js";
import { handleWhatsAppMessage } from "../conversation/orderFlow.js";
import { checkRateLimit } from "../session/rateLimit.js";
import { acquireChatLock, releaseChatLock } from "../session/chatLock.js";
import { COPY } from "../conversation/copy.js";
import { sendMessage } from "../whatsapp/metaClient.js";
import {
  handleAdminAction,
  handleMockupGenAction,
  handleAdminTextCommand,
  isAuthorizedAdmin,
} from "../admin/actions.js";
import { getChatPendingGenerationId } from "../mockup/generationStore.js";
import { attachPaymentProof } from "../mockup/paidGeneration.js";

let initialized = false;

export async function handleMessage(chatId: string, message: any) {
  if (!initialized) {
    initSentry();
    getEnv(); // validate env
    initialized = true;
  }

  // Flood control
  const allowed = await checkRateLimit(chatId);
  console.log(`[bot] rate limit allowed=${allowed}`);
  if (!allowed) {
    await sendMessage(chatId, COPY.floodCooldown).catch(() => {});
    return;
  }

  // Busy lock
  const claimed = await acquireChatLock(chatId);
  console.log(`[bot] lock claimed=${claimed}`);
  if (!claimed) {
    await sendMessage(chatId, COPY.busyReprompt).catch(() => {});
    return;
  }

  try {
    const input =
      message.text?.body ||
      message.interactive?.button_reply?.id ||
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.id ||
      message.interactive?.list_reply?.title ||
      message.button?.payload ||
      message.button?.text;
    const isImage = !!message.image;
    const imageId = message.image?.id;

    // 1. Intercept admin button actions
    if (input?.startsWith("admin:")) {
      await handleAdminAction(chatId, input, message);
      return;
    }
    if (input?.startsWith("mockupgen:")) {
      await handleMockupGenAction(chatId, input, message);
      return;
    }

    // 2. Intercept admin typed commands (6-digit approval code, "CONFIRM <order>", etc.)
    if (input && isAuthorizedAdmin(chatId)) {
      const handled = await handleAdminTextCommand(chatId, input);
      if (handled) return;
    }

    // 3. Paid mockup proof interception: customer sends proof photo while pending paid mockup
    if (isImage && imageId) {
      const pendingGenId = await getChatPendingGenerationId(chatId);
      if (pendingGenId) {
        console.log(`[bot] Found pending paid generation ${pendingGenId} for ${chatId}, attaching payment proof`);
        const result = await attachPaymentProof(pendingGenId, imageId);
        if (result.ok) {
          await sendMessage(chatId, COPY.mockupPaidProofAck).catch(() => {});
          return;
        }
      }
    }

    // 4. Enter customer conversation state machine
    console.log(`[bot] calling handleWhatsAppMessage`);
    await handleWhatsAppMessage(chatId, message);
    console.log(`[bot] handleWhatsAppMessage completed`);
  } catch (err: any) {
    console.error("Unhandled bot error:", err);
    captureException(err);
  } finally {
    await releaseChatLock(chatId).catch(() => {});
  }
}
