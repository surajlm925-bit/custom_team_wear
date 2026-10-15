/**
 * Fires the standalone /api/mockup-delivery function and returns almost
 * immediately — it does NOT wait for mockup generation to finish.
 *
 * WHY A SEPARATE HTTP CALL INSTEAD OF CALLING deliverMockupForOrder()
 * DIRECTLY: the order-flow conversation runs inside grammY's
 * bot.handleUpdate(), which itself runs inside grammY's webhookCallback,
 * which enforces its OWN internal timeout (see api/webhook.ts) completely
 * independent of Vercel's `maxDuration`. Mockup generation (Telegram
 * downloads + Sharp composite + Blob upload + sends, or a slow AI
 * generation when enabled) can take 30-60s+ on a cold start, so awaiting
 * it in-process risks grammY aborting the update before generation
 * finishes and the mockup silently never arriving.
 *
 * The fix is to make mockup generation its own Vercel Function
 * (api/mockup-delivery.ts) with no grammY/webhookCallback involvement and
 * no internal timeout — it uses @vercel/functions' waitUntil() to keep
 * itself alive in the background after replying, with its own generous
 * `maxDuration` (see vercel.json). This module's only job is to dispatch
 * that call and hang up quickly.
 */

import { getEnv } from "../config/env.js";
import { loadOrderSnapshot } from "../session/orderStore.js";
import { deliverMockupForOrder } from "./deliver.js";

const TRIGGER_TIMEOUT_MS = 5_000; // just long enough to hand off the request; never blocks on generation itself

function resolveBaseUrl(): string {
  const env = getEnv();
  if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionUrl) return `https://${productionUrl}`;
  const deploymentUrl = process.env.VERCEL_URL;
  if (deploymentUrl) return `https://${deploymentUrl}`;
  return "https://custom-teamwear-bot.vercel.app";
}

/**
 * Dispatches mockup generation for the given order.
 * Attempts fast deterministic delivery in-process first so the user sees their
 * preview immediately before payment, and falls back to /api/mockup-delivery.
 */
export async function triggerMockupDelivery(orderId: string): Promise<void> {
  // 1. In-process direct delivery (Sharp compositing takes ~150ms)
  try {
    const snapshot = await loadOrderSnapshot(orderId).catch(() => undefined);
    if (snapshot && snapshot.logoReceived && snapshot.logos && snapshot.logos.length > 0) {
      console.log(`[deliverTrigger] Executing fast delivery for ${orderId}`);
      const outcome = await deliverMockupForOrder(snapshot);
      if (outcome.delivered) {
        console.log(`[deliverTrigger] Fast delivery succeeded for ${orderId}`);
        return;
      }
      console.warn(`[deliverTrigger] Fast delivery returned not delivered for ${orderId}: ${outcome.reason}`);
    }
  } catch (err) {
    console.warn(`[deliverTrigger] Fast in-process delivery error for ${orderId}, falling back to API:`, err);
  }

  // 2. Fallback to standalone background function
  const baseUrl = resolveBaseUrl();
  const env = getEnv();
  const secret = env.INTERNAL_MOCKUP_SECRET || env.META_WEBHOOK_SECRET;
  try {
    const response = await fetch(`${baseUrl}/api/mockup-delivery`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify({ orderId }),
      signal: AbortSignal.timeout(TRIGGER_TIMEOUT_MS),
    });
    if (!response.ok) {
      const bodyText = await response.text().catch(() => "<no body>");
      console.error(`Mockup delivery trigger failed (${response.status}) for ${orderId}: ${bodyText}`);
    }
  } catch (err) {
    console.error(`Failed to dispatch mockup delivery trigger for ${orderId}:`, err);
  }
}
