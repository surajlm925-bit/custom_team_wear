/**
 * The in-progress order draft, persisted in the outer session so that
 * `/start` mid-flow can offer a "Resume" prompt (PRD AC13) without relying
 * on the conversations plugin's internal replay history.
 */

import type { PrintMethod, ProductId, SizeKey, Tier } from "../pricing/priceBook.js";
import type { CatalogSelection, LogoUpload, Timeline } from "../shared/types.js";

export interface OrderDraft {
  orderType?: "bulk" | "sample";
  garmentSilhouette?: "round_neck" | "collar";
  tier?: Tier;
  fabric?: "cotton" | "polyester";
  productId?: ProductId;
  qualityOptionId?: string;
  qualityOptionName?: string;
  colorName?: string;
  /** Set once the customer has picked+confirmed a catalog item (and colour, if applicable). Drives productId, so productId itself is always derived from this once the catalog flow is in play. */
  catalogSelection?: CatalogSelection;
  /** In-progress catalog picks, cleared once catalogSelection is finalized. Lets S1 resume mid-pick (e.g. group chosen but item not yet confirmed) after a /start interruption. */
  catalogGroupId?: string;
  catalogItemId?: string;
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
  mockupDecision?: "skip" | "generate";
  paymentScreenshotId?: string;
  orderId?: string;
  updatedAt?: number;
}

export function isDraftResumable(draft: OrderDraft | undefined): boolean {
  if (!draft?.updatedAt || !draft.qty) return false;
  const ageMs = Date.now() - draft.updatedAt;
  return ageMs < 24 * 60 * 60 * 1000;
}
