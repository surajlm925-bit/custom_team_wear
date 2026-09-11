/**
 * Bot wiring: session, conversations, admin actions, global controls.
 * Kept channel-agnostic apart from the grammY-specific glue itself — the
 * adapter boundary (verifyRequest/sendMessage/etc) lives in src/adapters/telegram.ts;
 * this file is the runtime composition root for the Telegram bot instance.
 */

import { Bot, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import type { MyContext, SessionData } from "./context.js";
import { getEnv } from "../config/env.js";
import { createRedisStorage } from "../session/redisStorageAdapter.js";
import { checkRateLimit } from "../session/rateLimit.js";
import { acquireChatLock, releaseChatLock } from "../session/chatLock.js";
import { COPY } from "../conversation/copy.js";
import { orderFlow } from "../conversation/orderFlow.js";
import { registerAdminActions } from "../admin/actions.js";
import { captureException, initSentry } from "../config/sentry.js";
import { getChatPendingGenerationId } from "../mockup/generationStore.js";
import { attachPaymentProof } from "../mockup/paidGeneration.js";

let botInstance: Bot<MyContext> | undefined;

export function getBot(): Bot<MyContext> {
  if (botInstance) return botInstance;

  initSentry();
  const env = getEnv();
  const bot = new Bot<MyContext>(env.TELEGRAM_BOT_TOKEN);

  // Flood control (PRD §5.3, §10.1: ~20 msg/min per chat).
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId !== undefined) {
      const allowed = await checkRateLimit(chatId);
      if (!allowed) {
        await ctx.reply(COPY.floodCooldown).catch(() => {});
        return;
      }
    }
    await next();
  });

  // Busy lock: prevents a chat from firing a second update into the flow
  // while a previous one for the same chat is still being processed. Without
  // this, a customer double-tapping a button or sending several quick
  // messages can spin up concurrent webhook invocations racing on the same
  // conversation state in Redis. Self-expiring (see chatLock.ts) so a
  // crashed invocation can never strand a chat as permanently "busy".
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) {
      await next();
      return;
    }
    const claimed = await acquireChatLock(chatId);
    if (!claimed) {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({ text: COPY.busyReprompt }).catch(() => {});
      } else {
        await ctx.reply(COPY.busyReprompt).catch(() => {});
      }
      return;
    }
    try {
      await next();
    } finally {
      await releaseChatLock(chatId).catch(() => {});
    }
  });

  bot.use(
    session({
      initial: (): SessionData => ({}),
      storage: createRedisStorage<SessionData>("outer-sess:"),
    }),
  );

  bot.use(conversations({ storage: { type: "key", adapter: createRedisStorage("conv:") } }));
  // Intercept /start before conversation replay middleware.
  // In @grammyjs/conversations, active conversations intercept all updates
  // (including commands) before downstream handlers run. By exiting the
  // active conversation here, the update falls through cleanly to
  // bot.command("start") to enter a fresh/resume order flow.
  bot.use(async (ctx, next) => {
    const text = ctx.message?.text?.trim();
    if (text === "/start" || text?.startsWith("/start ") || ctx.hasCommand?.("start")) {
      const active = ctx.conversation.active("orderFlow");
      if (active > 0) {
        await ctx.conversation.exit("orderFlow");
      }
    }
    await next();
  });
  bot.use(createConversation(orderFlow, "orderFlow"));

  registerAdminActions(bot);

  bot.command("start", async (ctx) => {
    const active = ctx.conversation.active("orderFlow");
    if (active > 0) {
      await ctx.conversation.exit("orderFlow");
    }
    await ctx.conversation.enter("orderFlow");
  });

  // Any other message (no active conversation) -> enter the flow.
  // orderFlow itself sends the welcome/tier-menu screen (or a resume
  // prompt) as its first action, so nothing needs to be sent here.
  bot.on("message", async (ctx) => {
    const active = ctx.conversation.active("orderFlow");
    if (active > 0) return; // an in-flight order flow owns this update

    // PAID-MOCKUP PAYMENT PROOF: if this chat has a paid mockup awaiting
    // payment and the customer just sent a photo/document (their proof),
    // route it to the paid-generation workflow instead of restarting a new
    // order. This runs only OUTSIDE an active order conversation, so it
    // can't interfere with the order-flow's own screenshot step.
    const chatId = ctx.chat?.id;
    const photo = ctx.message?.photo;
    const doc = ctx.message?.document;
    if (chatId !== undefined && (photo || doc)) {
      const pendingId = await getChatPendingGenerationId(`tg:${chatId}`).catch(() => undefined);
      if (pendingId) {
        const proofFileId = photo && photo.length > 0 ? photo[photo.length - 1].file_id : doc?.file_id;
        if (proofFileId) {
          const result = await attachPaymentProof(pendingId, proofFileId).catch(() => ({ ok: false }));
          if (result.ok) {
            await ctx.reply(COPY.mockupPaidProofAck).catch(() => {});
            return;
          }
          // Attach failed (stale pending index, generation already decided,
          // etc.) — fall through so the message enters a fresh order flow
          // instead of vanishing with no reply.
        }
      }
    }

    await ctx.conversation.enter("orderFlow");
  });

  bot.catch((err) => {
    console.error("Unhandled bot error:", err.error, "| update:", JSON.stringify(err.ctx.update));
    captureException(err.error);
  });

  botInstance = bot;
  return bot;
}
