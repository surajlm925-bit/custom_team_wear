/**
 * Vercel serverless webhook entry point for Zaptilo WhatsApp API
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getEnv } from "../src/config/env.js";
import { claimUpdate } from "../src/session/dedupe.js";
import { BUILD_STAMP } from "../src/config/version.js";
import { handleMessage } from "../src/bot/index.js";

let buildStampLogged = false;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!buildStampLogged) {
    console.log(
      `[webhook] build=${BUILD_STAMP} commit=${process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown"} ref=${process.env.VERCEL_GIT_COMMIT_REF ?? "unknown"}`,
    );
    buildStampLogged = true;
  }

  // Zaptilo Webhook Verification (GET request)
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const env = getEnv();

    if (mode === "subscribe" && token === env.ZAPTILO_WEBHOOK_SECRET) {
      console.log("[webhook] Webhook verified");
      res.status(200).send(challenge);
      return;
    } else {
      res.status(403).send("Forbidden");
      return;
    }
  }

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  // Log incoming payload for debugging
  console.log("[webhook] headers:", JSON.stringify(req.headers));
  console.log("[webhook] body:", JSON.stringify(req.body));

  // Always 200 immediately to prevent Zaptilo retries
  res.status(200).send("EVENT_RECEIVED");

  const payload = req.body as any;

  try {
    // --- Zaptilo native format: { event: "message.received", data: { ... } } ---
    if (payload?.event === "message.received" && payload?.data) {
      const data = payload.data;
      // Zaptilo sends phone numbers without country code prefix sometimes
      const from: string = String(data.from || data.phone || data.sender || "");
      const messageId: string = String(data.id || data.message_id || `zap-${Date.now()}`);
      const messageText: string = data.message || data.text || data.body || "";

      console.log(`[webhook] Zaptilo message from=${from} id=${messageId} text=${messageText}`);

      if (!from) {
        console.warn("[webhook] No 'from' field in Zaptilo payload, skipping");
        return;
      }

      const isNew = await claimUpdate(messageId);
      if (!isNew) {
        console.log("[webhook] Duplicate message, skipping");
        return;
      }

      const chatId = `wa:${from}`;
      // Normalise into our internal message shape
      const message = {
        id: messageId,
        from,
        text: messageText ? { body: messageText } : undefined,
        image: data.media_type === "image" ? { id: data.media_id || data.media_url } : undefined,
        document: data.media_type === "document" ? { id: data.media_id, filename: data.filename } : undefined,
        interactive: data.interactive_type
          ? {
              type: data.interactive_type,
              button_reply: data.interactive_type === "button_reply"
                ? { id: data.interactive_id, title: data.interactive_title }
                : undefined,
              list_reply: data.interactive_type === "list_reply"
                ? { id: data.interactive_id, title: data.interactive_title }
                : undefined,
            }
          : undefined,
      };

      await handleMessage(chatId, message);
      return;
    }

    // --- Meta Cloud API format (fallback, in case Zaptilo mirrors it) ---
    if (payload?.object === "whatsapp_business_account" && payload?.entry) {
      for (const entry of payload.entry) {
        for (const change of (entry.changes ?? [])) {
          for (const message of (change.value?.messages ?? [])) {
            const isNew = await claimUpdate(message.id);
            if (!isNew) continue;
            const chatId = `wa:${message.from}`;
            await handleMessage(chatId, message);
          }
        }
      }
      return;
    }

    console.warn("[webhook] Unrecognised payload format:", JSON.stringify(payload).substring(0, 500));
  } catch (err) {
    console.error("[webhook] Error processing message:", err);
  }
}
