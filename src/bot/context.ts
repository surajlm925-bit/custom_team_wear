import type { Context, SessionFlavor } from "grammy";
import type { ConversationFlavor } from "@grammyjs/conversations";

/** Minimal outer session — conversations plugin manages its own storage keyed by chat. */
export interface SessionData {
  /** Timestamp (ms) of the last message, used for the "resume" prompt window. */
  lastActivityAt?: number;
}

export type MyContext = Context & SessionFlavor<SessionData> & ConversationFlavor<Context>;
export type MyConversationContext = Context;
