/**
 * Full-order snapshot store, keyed by Order ID. Needed because the admin
 * Confirm action (src/admin/actions.ts) previously only had access to the
 * few fields embedded in the admin card's caption text — not enough to
 * trigger mockup generation (needs productId, logoFileId, logoPlacement).
 * Stored at the same time the admin card is sent (src/admin/notify.ts).
 */

import { getRedis } from "./redisClient.js";
import type { OrderData } from "../shared/types.js";

const TTL_SECONDS = 14 * 24 * 60 * 60; // long enough to cover any realistic admin-verification delay

function key(orderId: string): string {
  return `order:${orderId}`;
}

export async function saveOrderSnapshot(order: OrderData): Promise<void> {
  const redis = getRedis();
  await redis.set(key(order.orderId), order, { ex: TTL_SECONDS });
}

export async function loadOrderSnapshot(orderId: string): Promise<OrderData | undefined> {
  const redis = getRedis();
  const value = await redis.get<OrderData>(key(orderId));
  return value ?? undefined;
}
