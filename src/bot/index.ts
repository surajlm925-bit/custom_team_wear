import { getEnv } from "../config/env.js";
import { captureException, initSentry } from "../config/sentry.js";
import { handleWhatsAppMessage } from "../conversation/orderFlow.js";
import { checkRateLimit } from "../session/rateLimit.js";
import { acquireChatLock, releaseChatLock } from "../session/chatLock.js";
import { COPY } from "../conversation/copy.js";
import { sendMessage } from "../whatsapp/metaClient.js";
import { handleAdminAction, handleMockupGenAction } from "../admin/actions.js";
// import { getChatPendingGenerationId } from "../mockup/generationStore.js";
// import { attachPaymentProof } from "../mockup/paidGeneration.js";

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
    let input = message.text?.body || message.interactive?.button_reply?.id || message.interactive?.list_reply?.id;
    
    // Intercept admin actions
    if (input?.startsWith("admin:")) {
      await handleAdminAction(chatId, input, message);
      return;
    }
    if (input?.startsWith("mockupgen:")) {
      await handleMockupGenAction(chatId, input, message);
      return;
    }

    // Paid mockup proof interception would go here before entering flow
    // ...

    // Enter manual state machine
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
