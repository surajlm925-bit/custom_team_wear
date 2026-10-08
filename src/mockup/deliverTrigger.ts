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

const TRIGGER_TIMEOUT_MS = 5_000; // just long enough to hand off the request; never blocks on generation itself

function resolveBaseUrl(): string | undefined {
  const env = getEnv();
  if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL.replace(/\/$/, "");
  // Vercel system env vars are populated automatically at runtime (no opt-in
  // needed for server-side process.env access, unlike the NEXT_PUBLIC_ ones).
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionUrl) return `https://${productionUrl}`;
  const deploymentUrl = process.env.VERCEL_URL;
  if (deploymentUrl) return `https://${deploymentUrl}`;
  return undefined;
}

/**
 * Dispatches mockup generation for the given order without waiting for it
 * to complete. Never throws — any dispatch failure is logged, because a
 * missing mockup should never take down or delay order confirmation.
 */
export async function triggerMockupDelivery(orderId: string): Promise<void> {
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) {
    console.error(
      `Cannot trigger mockup delivery for ${orderId}: no base URL resolved (set PUBLIC_BASE_URL or rely on Vercel's system env vars).`,
    );
    return;
  }

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
