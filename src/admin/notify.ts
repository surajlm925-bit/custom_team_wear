/**
 * Admin notification — PRD §8.3, §8.4.
 * "Escalation never fails silently: every money event reaches the admin
 * chat; sheet-write failures escalate as full text to the admin chat."
 */

import { Bot, InlineKeyboard } from "grammy";
import { getEnv } from "../config/env.js";
import { renderAdminCard } from "../shared/render.js";
import type { OrderData } from "../shared/types.js";

let botInstance: Bot | undefined;

function getBot(): Bot {
  if (!botInstance) {
    botInstance = new Bot(getEnv().TELEGRAM_BOT_TOKEN);
  }
  return botInstance;
}

function adminActionKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Confirm payment", `admin:confirm:${orderId}`)
    .text("🚩 Issue — no/wrong payment", `admin:issue:${orderId}`);
}

/** Sends the admin card (with forwarded screenshot) to all configured admin chats. */
export async function notifyAdmins(order: OrderData, screenshotFileId: string): Promise<void> {
  const env = getEnv();
  const bot = getBot();
  const card = renderAdminCard(order);
  const keyboard = adminActionKeyboard(order.orderId);

  for (const adminChatId of env.ADMIN_CHAT_IDS) {
    try {
      await bot.api.sendPhoto(adminChatId, screenshotFileId, {
        caption: card,
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } catch (err) {
      // Escalate as plain text if photo forwarding fails — money events cannot vanish.
      await bot.api
        .sendMessage(adminChatId, `${card}\n\n(⚠️ screenshot forward failed: ${String(err)})`, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        })
        .catch(() => {});
    }
  }
}

/** Sends a plain-text notification to all admin chats (leads, escalations, heartbeat). */
export async function notifyAdminsText(text: string): Promise<void> {
  const env = getEnv();
  const bot = getBot();
  for (const adminChatId of env.ADMIN_CHAT_IDS) {
    await bot.api.sendMessage(adminChatId, text).catch(() => {});
  }
}
