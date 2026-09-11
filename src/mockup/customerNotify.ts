/**
 * Tiny shared Telegram bot accessor for background (non-webhook) mockup
 * code paths (api/mockup-delivery.ts and paid-generation flows). Keeps a
 * single lazily-constructed Bot instance so we don't spin up a new one per
 * module. Not wired with session/conversation middleware on purpose — the
 * background paths only ever call bot.api.* directly.
 */

import { Bot } from "grammy";
import { getEnv } from "../config/env.js";

let botInstance: Bot | undefined;

export function getBot(): Bot {
  if (!botInstance) botInstance = new Bot(getEnv().TELEGRAM_BOT_TOKEN);
  return botInstance;
}

/** Numeric chat id from a "tg:<id>" prefixed field, else null. */
export function extractTelegramChatId(customerChatId: string): number | null {
  const match = /^tg:(\d+)$/.exec(customerChatId);
  return match ? Number(match[1]) : null;
}
