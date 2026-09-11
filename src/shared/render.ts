/**
 * Shared renderer — PRD §7.1: "One shared renderer produces the customer
 * quote card AND the admin card — disagreement between the two is
 * structurally impossible." Both functions below read only from OrderData.
 */

import { LOGO_PLACEMENTS, TIER_LABELS } from "../pricing/priceBook.js";
import type { OrderData } from "./types.js";
import { getProduct, getPrintMethod } from "../pricing/index.js";

function placementLabel(order: OrderData): string {
  if (order.logos.length === 0) return "none";
  return order.logos
    .map((logo) => LOGO_PLACEMENTS.find((p) => p.id === logo.placement)?.label ?? logo.placement)
    .join(", ");
}

function formatRupees(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function sizeSplitLine(order: OrderData): string {
  return `S:${order.sizeSplit.S} M:${order.sizeSplit.M} L:${order.sizeSplit.L} XL:${order.sizeSplit.XL} XXL:${order.sizeSplit.XXL} 3XL:${order.sizeSplit["3XL"]}`;
}

/**
 * The confirmed catalog pick line — exact item + colour the customer
 * approved. Empty string for legacy orders with no catalog selection
 * (filtered out of the card). Ensures the customer/admin see the EXACT
 * garment, never just the generic tier product label.
 */
function catalogSelectionLine(order: OrderData): string {
  const sel = order.catalogSelection;
  if (!sel) return "";
  const colour = sel.colorName ? ` · ${sel.colorName}` : "";
  return `🎽 Selected: ${sel.itemLabel}${colour}`;
}

/** Full catalog-selection detail for the admin card (item, colour, source page, reference image). */
function catalogSelectionAdminLine(order: OrderData): string {
  const sel = order.catalogSelection;
  if (!sel) return "";
  const colour = sel.colorName ? ` · Colour: ${sel.colorName}${sel.colorCode ? ` (${sel.colorCode})` : ""}` : "";
  const ref = sel.referenceImagePath ?? sel.referenceImageUrl ?? "n/a";
  return `Catalog: ${sel.itemLabel}${colour} · Page ${sel.sourcePage} · Ref: ${ref}`;
}

function timelineLabel(order: OrderData): string {
  const base =
    order.timeline === "urgent"
      ? "Urgent (≤7d)"
      : order.timeline === "standard"
        ? "Standard (8–15d)"
        : "Flexible (15+d)";
  return order.timelineUrgent ? `${base} ⚡` : base;
}

/** Renders the customer-facing quote card (S10). */
export function renderQuoteCard(order: OrderData): string {
  const product = getProduct(order.productId);
  const printMethod = getPrintMethod(order.printMethod);
  const productLabel = product.label[order.tier];
  const tierLabel = TIER_LABELS[order.tier];

  const lines = [
    `🧾 **Your Estimate** · #${order.orderId}`,
    `${tierLabel} · ${productLabel} · ${order.qty} pcs`,
    catalogSelectionLine(order),
    "─────────────────────",
    `👕 Garment: ${order.qty} × ${formatRupees(order.garmentRate)} = **${formatRupees(order.garmentTotal)}**`,
    `🖼 Printing (${printMethod.label}): ${order.qty} × ₹${printMethod.range[0]}–${printMethod.range[1]} = **${formatRupees(order.printEstLow)} – ${formatRupees(order.printEstHigh)}**`,
    "　　⚠️ *estimate — finalized after you approve the artwork*",
    "─────────────────────",
    `**Est. Total: ${formatRupees(order.grandEstLow)} – ${formatRupees(order.grandEstHigh)} (+GST)**`,
    "",
    `💳 **Pay today (garment advance ≈ 50%): ${formatRupees(order.advanceDue)}**`,
    "Remaining garment balance + printing + GST invoiced after artwork approval — before production begins. **No hidden charges.**",
  ].filter((l) => l !== "");
  return lines.join("\n");
}

/** Renders the admin card (fires at S11, screenshot receipt). PRD §8.3. */
export function renderAdminCard(order: OrderData): string {
  const product = getProduct(order.productId);
  const productLabel = product.label[order.tier];
  const tierLabel = TIER_LABELS[order.tier];

  const lines = [
    "🛒 **NEW ORDER — PENDING PAYMENT VERIFICATION**",
    "─────────────────",
    `\`${order.orderId}\` · ${tierLabel} · ${productLabel} · ${order.qty} pcs`,
    catalogSelectionAdminLine(order),
    `Sizes: ${sizeSplitLine(order)}`,
    `Print: ${getPrintMethod(order.printMethod).label} · Placement: ${placementLabel(order)} · Timeline: ${timelineLabel(order)} · City: ${order.city}`,
    `Garment ${formatRupees(order.garmentTotal)} · Est. print ${formatRupees(order.printEstLow)}–${formatRupees(order.printEstHigh)} · Advance due (≈50%) **${formatRupees(order.advanceDue)}**`,
    `Customer: ${order.name} · ${order.phone} · ${order.customerChatId} · Logos: ${order.logos.length > 0 ? `${order.logos.length} received ✔` : "not provided"}`,
    "─────────────────",
  ].filter((l) => l !== "");
  return lines.join("\n");
}

/** Customer confirmation DM (fires only on authorized admin ✅). PRD Appendix A. */
export function renderConfirmationDm(orderId: string): string {
  return `🎉 **Order ${orderId} confirmed!** Production planning begins. Our team will reach out shortly with your artwork proof & next steps.`;
}
