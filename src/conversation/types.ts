import type { Conversation } from "@grammyjs/conversations";
import type { MyContext, MyConversationContext as OuterConvContext } from "../bot/context.js";

export type MyConversation = Conversation<MyContext, OuterConvContext>;
export type MyConversationContext = OuterConvContext;
