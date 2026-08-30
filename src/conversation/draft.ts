/**
 * The in-progress order draft, persisted in the outer session so that
 * `/start` mid-flow can offer a "Resume" prompt (PRD AC13) without relying
 * on the conversations plugin's internal replay history.
 */

import type { PrintMethod, ProductId, SizeKey, Tier } from "../pricing/priceBook.js";
import type { LogoUpload, Timeline } from "../shared/types.js";

export interface OrderDraft {
  tier?: Tier;
  productId?: ProductId;
  qty?: number;
  sizeSplit?: Partial<Record<SizeKey, number>>;
  printMethod?: PrintMethod;
  city?: string;
  name?: string;
  phone?: string;
  timeline?: Timeline;
  timelineUrgent?: boolean;
  logoReceived?: boolean;
  logos?: LogoUpload[];
  orderId?: string;
  updatedAt?: number;
}

export function isDraftResumable(draft: OrderDraft | undefined): boolean {
  if (!draft?.updatedAt || !draft.qty) return false;
  const ageMs = Date.now() - draft.updatedAt;
  return ageMs < 24 * 60 * 60 * 1000;
}
