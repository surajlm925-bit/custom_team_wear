/**
 * Shared domain types used across pricing, session, sheets, and rendering.
 */

import type { PrintMethod, ProductId, SizeKey, Tier } from "../pricing/priceBook.js";

export type OrderStatus =
  | "Pending Payment"
  | "Confirmed"
  | "Payment Issue"
  | "Lead — High-Value Callback"
  | "Lead — No Payment"
  | "Lead — Abandoned";

export type Timeline = "urgent" | "standard" | "flexible";

export interface SizeSplit extends Record<SizeKey, number> {}

export interface OrderData {
  orderId: string;
  status: OrderStatus;
  tier: Tier;
  productId: ProductId;
  qty: number;
  sizeSplit: SizeSplit;
  printMethod: PrintMethod;
  city: string;
  name: string;
  phone: string;
  timeline: Timeline;
  timelineUrgent: boolean;
  logoReceived: boolean;
  logoFileId?: string;
  garmentRate: number;
  garmentTotal: number;
  printEstLow: number;
  printEstHigh: number;
  grandEstLow: number;
  grandEstHigh: number;
  advanceDue: number;
  customerChatId: string; // channel-prefixed, e.g. "tg:5512345678"
  channel: "telegram";
  adminNotes?: string;
}
