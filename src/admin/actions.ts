/**
 * Admin card action handlers — PRD §7.5, §8.1, AC6, AC8.
 * ✅ Confirm -> Confirmed + customer auto-DM (irreversible, idempotent).
 * 🚩 Issue -> Payment Issue (agent follows up manually).
 * Gated server-side by chat_id ∈ ADMIN_CHAT_IDS; non-admin presses are
 * ignored + logged (never silently succeed).
 */

import type { Bot } from "grammy";
import type { MyContext } from "../bot/context.js";
import { getEnv } from "../config/env.js";
import { COPY } from "../conversation/copy.js";
import { updateOrderRowStatus } from "../sheets/client.js";
import { renderConfirmationDm } from "../shared/render.js";
import { getRedis } from "../session/redisClient.js";

const PROCESSED_TTL_SECONDS = 90 * 24 * 60 * 60; // long enough to safely catch duplicate presses

function isAuthorizedAdmin(chatId: number | undefined): boolean {
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

export function registerAdminActions(bot: Bot<MyContext>): void {
  bot.callbackQuery(/^admin:(confirm|issue):(.+)$/, async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!isAuthorizedAdmin(chatId)) {
      console.warn(`Unauthorized admin action attempt from chat ${chatId}`);
      await ctx.answerCallbackQuery({ text: COPY.adminUnauthorized, show_alert: true });
      return;
    }

    const match = /^admin:(confirm|issue):(.+)$/.exec(ctx.callbackQuery.data ?? "");
    if (!match) {
      await ctx.answerCallbackQuery();
      return;
    }
    const action = match[1] as "confirm" | "issue";
    const orderId = match[2];

    const existing = await getProcessedAction(orderId);
    if (existing) {
      await ctx.answerCallbackQuery({ text: COPY.alreadyProcessed, show_alert: true });
      return;
    }

    const claimed = await markProcessedIfFirst(orderId, action);
    if (!claimed) {
      // Another admin's press won the race.
      await ctx.answerCallbackQuery({ text: COPY.alreadyProcessed, show_alert: true });
      return;
    }

    if (action === "confirm") {
      await updateOrderRowStatus(orderId, "Confirmed").catch(async (err) => {
        console.error("Failed to update sheet on confirm", err);
      });
      await ctx.answerCallbackQuery({ text: "Confirmed ✅" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});

      // Notify all OTHER admins that this order is now settled.
      const env = getEnv();
      for (const adminId of env.ADMIN_CHAT_IDS) {
        if (adminId !== chatId) {
          await ctx.api
            .sendMessage(adminId, `✅ Order ${orderId} was confirmed by another admin.`)
            .catch(() => {});
        }
      }

      // Fetch the row to recover the customer chat id, then DM confirmation.
      // customerChatId is embedded in the admin card text, so we re-parse
      // it from the message caption to avoid a second sheet read on the
      // hot path (sheet row lookups are comparatively slow).
      const caption =
        ctx.callbackQuery.message?.caption ?? ctx.callbackQuery.message?.text ?? "";
      const chatIdMatch = /tg:(\d+)/.exec(caption);
      if (chatIdMatch) {
        const customerChatId = Number(chatIdMatch[1]);
        const orderIdMatch = /`(CTW-[\d-]+)`/.exec(caption);
        const displayOrderId = orderIdMatch ? orderIdMatch[1] : orderId;
        await ctx.api
          .sendMessage(customerChatId, renderConfirmationDm(displayOrderId), {
            parse_mode: "Markdown",
          })
          .catch((err) => console.error("Failed to DM customer on confirm", err));
      } else {
        console.error(`Could not extract customer chat id from admin card caption for order ${orderId}`);
      }
    } else {
      await updateOrderRowStatus(orderId, "Payment Issue").catch((err) => {
        console.error("Failed to update sheet on issue", err);
      });
      await ctx.answerCallbackQuery({ text: "Marked as Payment Issue 🚩" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    }
  });
}
