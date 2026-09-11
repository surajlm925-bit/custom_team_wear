/**
 * Pricing engine — pure functions over priceBook.ts.
 * PRD §6.3 invariant: this module is the ONLY place a rupee amount is
 * computed. No component outside this file may hardcode or derive a price.
 */

import {
  BRACKET_THRESHOLD,
  MOQ,
  PRODUCT_CATALOG,
  PRINT_METHODS,
  SAMPLE_KIT_PRICES,
  MOCKUP_PRICES,
  SIZE_KEYS,
  STANDARD_MIX_WEIGHTS,
  type PrintMethod,
  type ProductId,
  type SizeKey,
  type Tier,
} from "./priceBook.js";
import type { MockupView } from "../shared/types.js";

export type Bracket = "50-99" | "100+";

export function meetsMoq(qty: number): boolean {
  return qty >= MOQ;
}

export function getBracket(qty: number): Bracket {
  return qty >= BRACKET_THRESHOLD ? "100+" : "50-99";
}

export function getProduct(productId: ProductId) {
  const product = PRODUCT_CATALOG.find((p) => p.id === productId);
  if (!product) throw new Error(`Unknown productId: ${productId}`);
  return product;
}

export function getPrintMethod(id: PrintMethod) {
  const method = PRINT_METHODS.find((m) => m.id === id);
  if (!method) throw new Error(`Unknown print method: ${id}`);
  return method;
}

/** Garment rate per piece for a given tier/product/qty. EXACT figure. */
export function getGarmentRate(tier: Tier, productId: ProductId, qty: number): number {
  const product = getProduct(productId);
  const [rate50, rate100] = product.rates[tier];
  return getBracket(qty) === "100+" ? rate100 : rate50;
}

/** Rate at the *next* bracket up, for the upsell nudge (PRD S2c). Null if already at 100+. */
export function getNextBracketRate(
  tier: Tier,
  productId: ProductId,
  qty: number,
): { nextBracketQty: number; nextRate: number; savingsTotal: number } | null {
  if (getBracket(qty) === "100+") return null;
  const currentRate = getGarmentRate(tier, productId, qty);
  const nextRate = getGarmentRate(tier, productId, BRACKET_THRESHOLD);
  const savingsTotal = (currentRate - nextRate) * BRACKET_THRESHOLD;
  return { nextBracketQty: BRACKET_THRESHOLD, nextRate, savingsTotal };
}

export interface GarmentTotal {
  ratePerPiece: number;
  qty: number;
  total: number;
}

/** EXACT garment total: qty × rate. */
export function computeGarmentTotal(tier: Tier, productId: ProductId, qty: number): GarmentTotal {
  const ratePerPiece = getGarmentRate(tier, productId, qty);
  return { ratePerPiece, qty, total: ratePerPiece * qty };
}

/** Fixed 3-piece trial sample kit total (1 Value + 1 Recommended + 1 Premium). */
export function computeSampleKitTotal(fabric: "cotton" | "polyester"): GarmentTotal {
  const total = SAMPLE_KIT_PRICES[fabric];
  return {
    ratePerPiece: Math.round(total / 3),
    qty: 3,
    total,
  };
}

/**
 * Computes fee for an extra mockup generation once free quota is used up.
 * Single view (front only or back only): ₹10.
 * Both front and back views: ₹20.
 */
export function computeMockupFee(views?: MockupView[]): number {
  if (!views || views.length === 0) return MOCKUP_PRICES.singleView;
  const hasFront = views.includes("front");
  const hasBack = views.includes("back");
  return hasFront && hasBack ? MOCKUP_PRICES.frontAndBack : MOCKUP_PRICES.singleView;
}

export interface PrintEstimate {
  low: number;
  high: number;
}

/** ESTIMATE print range: qty × [low, high] per-piece band. */
export function computePrintEstimate(printMethod: PrintMethod, qty: number): PrintEstimate {
  const method = getPrintMethod(printMethod);
  const [low, high] = method.range;
  return { low: low * qty, high: high * qty };
}

export interface GrandEstimate {
  low: number;
  high: number;
}

/** Est. grand range = garment total (exact) + print estimate range. Excludes GST. */
export function computeGrandEstimate(
  garmentTotal: number,
  printEstimate: PrintEstimate,
): GrandEstimate {
  return {
    low: garmentTotal + printEstimate.low,
    high: garmentTotal + printEstimate.high,
  };
}

/**
 * Advance due = ~50% of the garment total for bulk orders, rounded UP to the nearest
 * rupee. For trial sample kits, full 100% payment is collected.
 *
 * Math.ceil ensures we never under-collect by a fraction of a rupee on
 * odd totals (e.g. ₹359 → 179.5 → ₹180).
 */
export function computeAdvanceDue(
  garmentTotal: number,
  options?: { orderType?: "bulk" | "sample" },
): number {
  if (options?.orderType === "sample") {
    return garmentTotal;
  }
  return Math.ceil(garmentTotal * 0.5);
}

export function showsCallMe(qty: number): boolean {
  return qty > 300;
}

/**
 * Size split resolvers. Each MUST sum exactly to qty.
 */

/** Even split across the 6 sizes, remainder distributed to the middle sizes first. */
export function resolveEvenSplit(qty: number): Record<SizeKey, number> {
  const n = SIZE_KEYS.length;
  const base = Math.floor(qty / n);
  let remainder = qty - base * n;
  const result: Record<SizeKey, number> = {
    S: base,
    M: base,
    L: base,
    XL: base,
    XXL: base,
    "3XL": base,
  };
  // Distribute remainder starting from M/L (most common sizes) outward.
  const distributionOrder: SizeKey[] = ["M", "L", "S", "XL", "XXL", "3XL"];
  for (const key of distributionOrder) {
    if (remainder <= 0) break;
    result[key] += 1;
    remainder -= 1;
  }
  return result;
}

/** Standard mix, proportionally scaled from STANDARD_MIX_WEIGHTS, summing exactly to qty. */
export function resolveStandardMix(qty: number): Record<SizeKey, number> {
  const totalWeight = SIZE_KEYS.reduce((sum, k) => sum + STANDARD_MIX_WEIGHTS[k], 0);
  const raw: Record<SizeKey, number> = {} as Record<SizeKey, number>;
  const floors: Record<SizeKey, number> = {} as Record<SizeKey, number>;
  let flooredSum = 0;

  for (const key of SIZE_KEYS) {
    const exact = (qty * STANDARD_MIX_WEIGHTS[key]) / totalWeight;
    raw[key] = exact;
    floors[key] = Math.floor(exact);
    flooredSum += floors[key];
  }

  let remainder = qty - flooredSum;
  // Largest-remainder method: give leftover pieces to sizes with the biggest fractional part.
  const byFraction = [...SIZE_KEYS].sort((a, b) => (raw[b] - floors[b]) - (raw[a] - floors[a]));
  const result: Record<SizeKey, number> = { ...floors };
  for (const key of byFraction) {
    if (remainder <= 0) break;
    result[key] += 1;
    remainder -= 1;
  }
  return result;
}

/** Validates that a manually entered split sums exactly to qty. */
export function sizeSplitSum(split: Partial<Record<SizeKey, number>>): number {
  return SIZE_KEYS.reduce((sum, k) => sum + (split[k] ?? 0), 0);
}

export function isSizeSplitComplete(split: Partial<Record<SizeKey, number>>, qty: number): boolean {
  return sizeSplitSum(split) === qty;
}
