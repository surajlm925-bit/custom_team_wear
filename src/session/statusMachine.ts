/**
 * Forward-only status transition guard — PRD §8.1, §8.4.
 * "Redis session state machine only allows forward transitions through
 * the defined status enum — reject anything else." (tech.md)
 */

import type { OrderStatus } from "../shared/types.js";

/**
 * Allowed transitions. Leads are terminal; Pending Payment can move to
 * Confirmed or Payment Issue. Nothing may move backward or skip into a
 * lead state once payment has started.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  "Pending Payment": ["Confirmed", "Payment Issue"],
  Confirmed: [],
  "Payment Issue": [],
  "Lead — High-Value Callback": [],
  "Lead — No Payment": [],
  "Lead — Abandoned": [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false; // duplicate action, handled separately as a no-op
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export class InvalidStatusTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Invalid status transition: "${from}" -> "${to}"`);
    this.name = "InvalidStatusTransitionError";
  }
}
