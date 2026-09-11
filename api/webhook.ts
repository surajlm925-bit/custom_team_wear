/**
 * Vercel serverless webhook entry point — PRD §4.2.
 * - Validates X-Telegram-Bot-Api-Secret-Token on 100% of requests BEFORE
 *   touching Redis (dedupe), so an unauthenticated request can't poison the
 *   update_id dedupe set with arbitrary/future ids (DoS on real updates).
 *   grammY's webhookCallback re-checks the same secret internally.
 * - Dedupes on update_id before handing off to the bot (PRD §8.4, AC5),
 *   using a lightweight parse of the body Vercel already JSON-parsed.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { timingSafeEqual } from "node:crypto";
import { webhookCallback } from "grammy";
import { getBot } from "../src/bot/index.js";
import { getEnv } from "../src/config/env.js";
import { claimUpdate } from "../src/session/dedupe.js";
import { BUILD_STAMP } from "../src/config/version.js";

// Logged once per cold start so every deployment's function logs prove
// which build is actually serving webhook traffic (deploy-lag diagnosis).
let buildStampLogged = false;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!buildStampLogged) {
    console.log(
      `[webhook] build=${BUILD_STAMP} commit=${process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown"} ref=${process.env.VERCEL_GIT_COMMIT_REF ?? "unknown"}`,
    );
    buildStampLogged = true;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const env = getEnv();

  // Reject inauthentic requests before any side effects (Redis writes).
  const providedSecret = req.headers["x-telegram-bot-api-secret-token"];
  const expectedBuf = Buffer.from(env.WEBHOOK_SECRET);
  const providedBuf = Buffer.from(typeof providedSecret === "string" ? providedSecret : "");
  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    res.status(401).send("Unauthorized");
    return;
  }

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
    // grammY's own internal timeout defaults to 10s and is independent of
    // Vercel's `maxDuration` (30s, see vercel.json). The webhook handler
    // itself never awaits AI mockup generation anymore — that work happens
    // in the standalone api/mockup-delivery.ts function, dispatched via a
    // fire-and-forget HTTP call (src/mockup/deliverTrigger.ts) that returns
    // almost instantly. This keeps some headroom above grammY's default for
    // slower-but-still-fast steps (Sheets append, multiple Telegram sends)
    // without ever needing to cover a 30-60s AI call in-process.
    timeoutMilliseconds: 25_000,
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
