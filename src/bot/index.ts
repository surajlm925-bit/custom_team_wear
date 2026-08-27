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
import { COPY } from "../conversation/copy.js";
import { orderFlow } from "../conversation/orderFlow.js";
import { registerAdminActions } from "../admin/actions.js";
import { captureException, initSentry } from "../config/sentry.js";

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

  bot.use(
    session({
      initial: (): SessionData => ({}),
      storage: createRedisStorage<SessionData>("outer-sess:"),
    }),
  );

  bot.use(conversations({ storage: { type: "key", adapter: createRedisStorage("conv:") } }));
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
    if (active === 0) {
      await ctx.conversation.enter("orderFlow");
    }
  });

  bot.catch((err) => {
    console.error("Unhandled bot error:", err.error, "| update:", JSON.stringify(err.ctx.update));
    captureException(err.error);
  });

  botInstance = bot;
  return bot;
}
