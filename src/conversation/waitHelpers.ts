/**
 * Generic wait-and-classify helper for conversation steps.
 * Every screen needs to react to either a button press or typed text,
 * and Cancel must work on every screen (PRD §5.3). Modeling this as a
 * classify-and-reprompt loop keeps each step declarative instead of
 * hand-rolling filtered wait chains per step.
 */

import type { Context } from "grammy";
import type { MyConversation, MyConversationContext } from "./types.js";

export const CANCEL = "CANCEL" as const;

export type ClassifyResult<T> = T | typeof CANCEL | undefined;

/**
 * Waits for updates, applying `classify` to each. Returns as soon as
 * classify returns a defined result (including CANCEL). Anything else
 * triggers `reprompt` and keeps waiting.
 */
export async function waitForStep<T>(
  conversation: MyConversation,
  classify: (ctx: MyConversationContext) => ClassifyResult<T>,
  reprompt: (ctx: MyConversationContext) => Promise<unknown>,
): Promise<T | typeof CANCEL> {
  while (true) {
    const next = await conversation.wait();
    if (next.callbackQuery) {
      await next.answerCallbackQuery().catch(() => {});
    }
    // /start must always escape the active conversation and restart the flow.
    // skip({next:true}) prevents this update from being consumed by the
    // conversation replay and passes it to bot.command("start") downstream,
    // which enters a fresh/resume order flow. Without this, grammY's
    // conversation plugin intercepts /start and triggers the genericReprompt.
    const text = next.message?.text?.trim();
    if (text === "/start" || text?.startsWith("/start ")) {
      await conversation.skip({ next: true });
      return CANCEL; // unreachable after skip() unwinds the conversation
    }
    const result = classify(next);
    if (result !== undefined) return result;
    await reprompt(next);
  }
}

export function isCancelCallback(ctx: Context): boolean {
  if (ctx.callbackQuery?.data === "cancel") return true;
  const text = ctx.message?.text?.trim();
  return text === "/cancel" || text?.startsWith("/cancel ") === true;
}

