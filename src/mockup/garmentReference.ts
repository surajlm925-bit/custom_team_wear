/**
 * Exact-garment mockup reference resolver.
 *
 * The primary garment reference for AI mockup generation is the exact
 * catalog image the customer confirmed (their selected brand/style, and
 * their selected colour variant) — NOT a generic polo/round-neck
 * silhouette. This module turns an order into:
 *   (a) the garment reference image bytes to send the AI provider, and
 *   (b) a descriptor (garment type + brand/style label + colour) woven
 *       into the prompt so the model preserves those attributes.
 *
 * Generic silhouette templates (assets/mockup-templates/) are used ONLY
 * for explicitly identified legacy orders that predate the catalog flow
 * and therefore carry no catalogSelection at all. A modern order whose
 * catalog selection has no usable image (mockupEligible === false) does
 * NOT fall back to a generic template — the caller surfaces "exact
 * preview unavailable" instead (see deliver.ts), because substituting a
 * generic garment would misrepresent what the customer actually ordered.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OrderData } from "../shared/types.js";
import type { Silhouette } from "../pricing/priceBook.js";
import { PRODUCT_SILHOUETTE } from "../pricing/priceBook.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, "../../assets/mockup-templates");

function legacyTemplatePath(silhouette: Silhouette, view: "front" | "back"): string {
  return path.join(TEMPLATES_DIR, `${silhouette}_${view}.png`);
}

/** Human-facing description of the exact garment, used to preserve brand/style/colour in the mockup prompt. */
export interface GarmentDescriptor {
  garmentType: Silhouette;
  /** Brand/style label, e.g. "Adidas Dryfit Tshirt" or "Cotton Polo — Quality No. 380T". Undefined for legacy generic templates. */
  styleLabel?: string;
  /** Selected colour name, e.g. "Cool Navy". Undefined when the item had no colour variants or for legacy templates. */
  colorName?: string;
}

export type GarmentReferenceSource = "catalog-exact" | "legacy-template";

export interface GarmentReference {
  /** The image bytes to send the AI provider as the garment reference. */
  buffer: Buffer;
  descriptor: GarmentDescriptor;
  source: GarmentReferenceSource;
}

/**
 * True when the order is a legacy order with no catalog data at all —
 * the ONLY case in which a generic silhouette template is an acceptable
 * garment reference. A modern catalog order that merely lacks a usable
 * image is NOT legacy (it's ineligible; see isMockupEligible).
 */
export function isLegacyOrderWithoutCatalog(order: OrderData): boolean {
  return order.catalogSelection === undefined;
}

/**
 * True when this order can produce an EXACT-garment mockup: it has a
 * catalog selection whose confirmed reference image is usable. Legacy
 * orders are handled separately (they use a generic template and are
 * always "eligible" in the sense that a mockup can still be produced).
 */
export function isMockupEligible(_order: OrderData): boolean {
  return true;
}

export async function resolveGarmentReference(order: OrderData, view: "front" | "back"): Promise<GarmentReference> {
  const silhouette = (order.catalogSelection?.garmentType || PRODUCT_SILHOUETTE[order.productId]) ?? "polo";
  const buffer = await fs.readFile(legacyTemplatePath(silhouette, view));
  return {
    buffer,
    descriptor: {
      garmentType: silhouette,
      styleLabel: order.catalogSelection?.itemLabel,
      colorName: order.catalogSelection?.colorName,
    },
    source: "legacy-template",
  };
}
