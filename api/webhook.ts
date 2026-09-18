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
      console.log("Webhook verified");
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

  // Log everything for debugging
  console.log("INCOMING ZAPTILO WEBHOOK headers:", JSON.stringify(req.headers));
  console.log("INCOMING ZAPTILO WEBHOOK body:", JSON.stringify(req.body));

  const payload = req.body as any; // Cast to any since we don't know the exact structure yet
  
  if (payload.object === 'whatsapp_business_account' && payload.entry) {
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.value.messages) {
          for (const message of change.value.messages) {
            // Deduplicate based on message ID
            const isNew = await claimUpdate(message.id);
            if (!isNew) {
               continue;
            }

            const chatId = `wa:${message.from}`;
            
            try {
              // Route to manual state machine router
              await handleMessage(chatId, message);
              console.log("Received message from", chatId, message);
            } catch (err) {
              console.error("Error handling WhatsApp message:", err);
            }
          }
        }
      }
    }
  } else if (payload.event === 'message.received') {
    // Guessing Zaptilo's custom payload format based on the "Message.Received" checkbox
    console.log("Found Zaptilo custom payload structure!");
    // We will parse it later once we see the logs
  }

  // Always return 200 OK to prevent retries
  res.status(200).send("EVENT_RECEIVED");
}
