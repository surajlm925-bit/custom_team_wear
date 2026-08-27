/**
 * Sheets outage fallback — PRD §8.4, AC9:
 * "Sheets outage → 3 retries → admin chat receives complete order as text
 * (money events cannot vanish); customer sees generic apology."
 */

import { appendOrderRow } from "./client.js";
import { orderToRow } from "./client.js";
import { notifyAdminsText } from "../admin/notify.js";
import type { OrderData } from "../shared/types.js";

export class SheetWriteFailedError extends Error {
  constructor(readonly order: OrderData, cause: unknown) {
    super(`Sheet write failed for order ${order.orderId}: ${String(cause)}`);
    this.name = "SheetWriteFailedError";
  }
}

/**
 * Appends the order row. On failure (after appendOrderRow's internal
 * retries), the complete order is escalated as text to all admin chats
 * so the money event is never silently lost. Re-throws so the caller can
 * show the customer a generic apology instead of a false success message.
 */
export async function safeAppendOrderRow(order: OrderData): Promise<void> {
  try {
    await appendOrderRow(order);
  } catch (err) {
    const row = orderToRow(order);
    const rowText = Object.entries(row)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    await notifyAdminsText(
      `🚨 SHEET WRITE FAILED for ${order.orderId} — full order below (please log manually):\n\n${rowText}`,
    );
    throw new SheetWriteFailedError(order, err);
  }
}
