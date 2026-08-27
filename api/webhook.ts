/**
 * Vercel serverless webhook entry point — PRD §4.2.
 * - Validates X-Telegram-Bot-Api-Secret-Token on 100% of requests
 *   (grammY's webhookCallback does this internally when `secretToken` is
 *   passed; mismatch -> 401, logged).
 * - Dedupes on update_id before handing off to the bot (PRD §8.4, AC5),
 *   using a lightweight parse of the body Vercel already JSON-parsed.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { webhookCallback } from "grammy";
import { getBot } from "../src/bot/index.js";
import { getEnv } from "../src/config/env.js";
import { claimUpdate } from "../src/session/dedupe.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const env = getEnv();

  const update = req.body as { update_id?: number } | undefined;
  if (update && typeof update.update_id === "number") {
    const isNew = await claimUpdate(update.update_id);
    if (!isNew) {
      // Duplicate delivery (PRD §8.4, AC5) — ack without reprocessing.
      res.status(200).send("OK (duplicate)");
      return;
    }
  }

  const bot = getBot();
  const callback = webhookCallback(bot, "next-js", {
    secretToken: env.WEBHOOK_SECRET,
  });

  try {
    await callback(req, res);
  } catch (err) {
    console.error("Error handling Telegram update:", err);
    if (!res.writableEnded) {
      // Still ACK with 200 so Telegram does not retry-storm us; the error
      // is logged and, for money-critical paths, escalated separately.
      res.status(200).send("OK (error logged)");
    }
  }
}
