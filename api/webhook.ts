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

  const payload = req.body as any;

  try {
    let processed = false;
    // --- Zaptilo native format: { event: "message.received", data: { value: { messages: [...] } } } ---
    // Confirmed from test webhook: data.value contains the Meta Cloud API structure
    if (payload?.event === "message.received" && payload?.data?.value) {
      const value = payload.data.value;
      const messages: any[] = value.messages ?? [];

      for (const msg of messages) {
        const from: string = String(msg.from || "");
        const messageId: string = String(msg.id || `zap-${Date.now()}`);
        const messageText: string = msg.text?.body || "";

        console.log(`[webhook] Zaptilo message from=${from} id=${messageId} type=${msg.type} text=${messageText}`);

        if (!from) {
          console.warn("[webhook] No 'from' in message, skipping");
          continue;
        }

        const isNew = await claimUpdate(messageId);
        if (!isNew) {
          console.log("[webhook] Duplicate message, skipping");
          continue;
        }

        const chatId = `wa:${from}`;
        // message shape already matches our internal format
        await handleMessage(chatId, msg);
      }
      processed = true;
    }

    // --- Meta Cloud API format (fallback, in case Zaptilo mirrors it) ---
    if (!processed && payload?.object === "whatsapp_business_account" && payload?.entry) {
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
      processed = true;
    }

    if (!processed) {
      console.warn("[webhook] Unrecognised payload format:", JSON.stringify(payload).substring(0, 500));
    }
    
    // Send 200 AFTER processing is complete so Vercel doesn't freeze the function early
    res.status(200).send("EVENT_RECEIVED");
  } catch (err) {
    console.error("[webhook] Error processing message:", err);
    // Still return 200 to Zaptilo so it doesn't endlessly retry failing messages
    res.status(200).send("EVENT_RECEIVED");
  }
}
