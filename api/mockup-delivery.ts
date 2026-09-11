/**
 * Standalone mockup-delivery endpoint — completely decoupled from the
 * Telegram webhook (api/webhook.ts) and grammY's webhookCallback, which
 * enforces its own internal timeout independent of Vercel's maxDuration
 * (see src/mockup/deliverTrigger.ts for the full rationale).
 *
 * Flow: orderFlow.ts fires a request here (via deliverTrigger.ts) when the
 * customer requests a mockup (after logo upload, before garment payment),
 * then continues the order flow immediately so the webhook response goes
 * out fast. This handler responds 202 right away and keeps itself alive
 * via waitUntil() to run the deterministic mockup compositing (and, when
 * the free monthly quota is exhausted, prompt the customer for the paid
 * ₹20 flow) and send results in the background.
 *
 * Protected by a shared secret header (not the Telegram webhook secret's
 * concern — this endpoint is never called by Telegram) so it can't be
 * triggered by an arbitrary internet request to run paid AI generations.
 */

import { timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import { getEnv } from "../src/config/env.js";
import { loadOrderSnapshot } from "../src/session/orderStore.js";
import { startMockupGeneration } from "../src/mockup/workflow.js";
import { notifyAdminsText } from "../src/admin/notify.js";
import { getBot, extractTelegramChatId } from "../src/mockup/customerNotify.js";
import { COPY } from "../src/conversation/copy.js";

/** Constant-time secret comparison to avoid leaking match-length via timing. */
function secretsMatch(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const env = getEnv();
  const expectedSecret = env.INTERNAL_MOCKUP_SECRET || env.WEBHOOK_SECRET;
  const providedSecret = req.headers["x-internal-secret"];
  if (typeof providedSecret !== "string" || !secretsMatch(providedSecret, expectedSecret)) {
    console.warn("Rejected /api/mockup-delivery call with invalid or missing internal secret.");
    res.status(401).send("Unauthorized");
    return;
  }

  const body = req.body as { orderId?: string } | undefined;
  const orderId = body?.orderId;
  if (!orderId) {
    res.status(400).send("Missing orderId");
    return;
  }

  // ACK immediately — the caller (deliverTrigger.ts) only needs to know
  // the job was accepted, not that it finished. waitUntil() keeps this
  // invocation alive to actually do the work after the response is sent.
  res.status(202).send("Accepted");

  waitUntil(
    (async () => {
      const orderSnapshot = await loadOrderSnapshot(orderId).catch((err) => {
        console.error(`Failed to load order snapshot for mockup delivery (${orderId}):`, err);
        return undefined;
      });
      if (!orderSnapshot) {
        console.warn(`No order snapshot found for ${orderId}; skipping mockup delivery.`);
        await notifyAdminsText(
          `⚠️ Mockup for ${orderId} was never sent — order snapshot expired/missing from cache before generation could run.`,
        ).catch(() => {});
        return;
      }
      // Route through the workflow so the monthly free quota + paid
      // (₹20/generation) path is applied. startMockupGeneration is fully
      // idempotent (keyed on orderId), so a duplicate trigger re-enters the
      // same workflow rather than reserving a second slot or charging twice.
      //
      // PRD §7's "escalation never fails silently" rule (product.md): any
      // skip/failure is otherwise invisible, so we escalate to admins.
      const outcome = await startMockupGeneration(orderSnapshot);
      switch (outcome.kind) {
        case "generated":
        case "already-completed":
          break; // delivered to the customer
        case "payment-required": {
          // Ask the customer to pay for this extra mockup; nothing is
          // generated until an admin approves the payment proof.
          const env2 = getEnv();
          const chatId = extractTelegramChatId(orderSnapshot.customerChatId);
          if (chatId !== null) {
            await getBot()
              .api.sendMessage(chatId, COPY.mockupPaidRequired(outcome.amountInr, env2.MOCKUP_FREE_PER_MONTH), {
                parse_mode: "Markdown",
              })
              .catch((err) => console.error(`Failed to send paid-mockup prompt for ${orderId}:`, err));
          }
          await notifyAdminsText(
            `💳 Mockup for ${orderId} needs payment (₹${outcome.amountInr}) — customer's free monthly quota is used up. Awaiting their payment proof.`,
          ).catch(() => {});
          break;
        }
        case "awaiting-approval":
          await notifyAdminsText(`⏳ Mockup for ${orderId} is awaiting admin approval of the customer's payment proof.`).catch(() => {});
          break;
        case "generation-failed":
          await notifyAdminsText(`⚠️ Mockup for ${orderId} was not delivered: ${outcome.reason}`).catch(() => {});
          break;
        case "skipped":
          // No artwork etc. — nothing promised to the customer, no escalation needed.
          break;
      }
    })(),
  );
}
