/**
 * Inline keyboards for the customer-facing conversation screens.
 * Plain grammY InlineKeyboard + conversation.waitFor is used here (rather
 * than @grammyjs/menu) because the flow is strictly forward/linear and
 * needs conversation.wait semantics; @grammyjs/menu is used instead for
 * the admin card (src/admin/menu.ts) where it fits best.
 */

import { InlineKeyboard } from "grammy";
import {
  LOGO_PLACEMENTS,
  PRINT_METHODS,
  PRODUCT_CATALOG,
  TIER_FROM_RATE,
  TIER_LABELS,
  type SizeKey,
  type Tier,
} from "../pricing/priceBook.js";
import type { CatalogGroup, CatalogItem, CatalogVariant } from "../catalog/index.js";

export function greetingOrderTypeMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📦 Bulk Order (50+ pcs)", "order:bulk")
    .row()
    .text("🧪 Trial Sample Kit (3 pcs)", "order:sample")
    .row()
    .text("❌ Cancel", "cancel");
}

export function sampleKitFabricMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⚡ Polyester Kit — ₹1,999 total", "fabric:polyester")
    .row()
    .text("🌿 Cotton Kit — ₹2,499 total", "fabric:cotton")
    .row()
    .text("🔙 Back", "back")
    .text("❌ Cancel", "cancel");
}

export function garmentSilhouetteMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("👕 Round Neck", "garment:round_neck")
    .row()
    .text("👔 Collar (Polo)", "garment:collar")
    .row()
    .text("🔙 Back", "back")
    .text("❌ Cancel", "cancel");
}

export function fabricMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🌿 100% Cotton", "fabric:cotton")
    .row()
    .text("⚡ Polyester (Dry Fit)", "fabric:polyester")
    .row()
    .text("🔙 Back", "back")
    .text("❌ Cancel", "cancel");
}

export function brandingMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🖨️ Printing (Screen / DTF)", "branding:print")
    .row()
    .text("🧵 Embroidery", "branding:embroidery")
    .row()
    .text("🔙 Back", "back")
    .text("❌ Cancel", "cancel");
}

export function tierMenu(): InlineKeyboard {
  const kb = new InlineKeyboard();
  (Object.keys(TIER_LABELS) as Tier[]).forEach((tier) => {
    kb.text(`${TIER_LABELS[tier]} · from ₹${TIER_FROM_RATE[tier]}/pc`, `tier:${tier}`).row();
  });
  kb.text("🔙 Back", "back").text("❌ Cancel", "cancel");
  return kb;
}

export function resumeMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("▶️ Resume my quote", "resume:yes")
    .text("🔄 Fresh start", "resume:no");
}

export function productMenu(tier: Tier): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const product of PRODUCT_CATALOG) {
    const [rate50, rate100] = product.rates[tier];
    const label = product.label[tier];
    kb.text(`${label} · ₹${rate50}/pc (₹${rate100} @100+)`, `product:${product.id}`).row();
  }
  kb.text("🔙 Back", "back");
  return kb;
}

export function bracketRevealMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("▶️ Yes, continue", "bracket:continue")
    .text("🔄 Change quantity", "bracket:change");
}

export function sizeSplitModeMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⚖️ Even split", "split:even")
    .row()
    .text("📊 Standard mix", "split:standard")
    .row()
    .text("✏️ Enter my own", "split:own");
}

const SIZE_KEYS_LOCAL: SizeKey[] = ["S", "M", "L", "XL", "XXL", "3XL"];

export function sizeQuickPickMenu(): InlineKeyboard {
  const kb = new InlineKeyboard();
  SIZE_KEYS_LOCAL.forEach((size, i) => {
    kb.text(size, `sizefix:${size}`);
    if ((i + 1) % 3 === 0) kb.row();
  });
  return kb;
}

export function printMethodMenu(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const method of PRINT_METHODS) {
    const rangeLabel =
      method.id === "not_sure"
        ? method.label
        : `${method.label} · ₹${method.range[0]}–${method.range[1]}/pc`;
    kb.text(rangeLabel, `print:${method.id}`).row();
  }
  return kb;
}

export function timelineMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⚡ Urgent — within 7 days", "timeline:urgent")
    .row()
    .text("🚚 Standard — 8–15 days", "timeline:standard")
    .row()
    .text("🗓 Flexible — 15+ days", "timeline:flexible")
    .row()
    .text("🔙 Back", "back")
    .text("❌ Cancel", "cancel");
}

export function logoPlacementMenu(): InlineKeyboard {
  const kb = new InlineKeyboard();
  LOGO_PLACEMENTS.forEach((placement, i) => {
    kb.text(`${i + 1}️⃣ ${placement.label}`, `placement:${placement.id}`).row();
  });
  kb.text("⏭ Skip — no artwork yet", "logo:skip").row();
  kb.text("🔙 Back", "back").text("❌ Cancel", "cancel");
  return kb;
}

export function addAnotherLogoMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("➕ Add another logo", "logo:more")
    .row()
    .text("✅ No more — continue", "logo:done");
}

/** Shown right after logo upload — offers the free/paid mockup preview or skipping straight to the quote. */
export function generateMockupMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🎨 Generate my mockup", "mockup:generate")
    .row()
    .text("⏭ Skip — go to my quote", "mockup:skip")
    .row()
    .text("🔙 Back", "back")
    .text("❌ Cancel", "cancel");
}

export function quoteCardMenu(advanceDue: number, showCallMe: boolean, isSample = false): InlineKeyboard {
  const label = isSample
    ? `💳 Pay ₹${advanceDue.toLocaleString("en-IN")} (full payment)`
    : `💳 Pay ₹${advanceDue.toLocaleString("en-IN")} garment advance`;
  const kb = new InlineKeyboard().text(label, "pay");
  if (showCallMe) {
    kb.row().text("📞 Call Me", "callme");
  }
  return kb;
}

export function paymentScreenMenu(): InlineKeyboard {
  return new InlineKeyboard().text("❌ Cancel", "cancel");
}

export function cancelOnlyMenu(): InlineKeyboard {
  return new InlineKeyboard().text("❌ Cancel", "cancel");
}

export function backAndCancelMenu(): InlineKeyboard {
  return new InlineKeyboard().text("🔙 Back", "back").text("❌ Cancel", "cancel");
}

// ---------------------------------------------------------------------
// Catalog selection flow (S1) — PDF-driven brand/style/colour picker.
// Every page caps at PAGE_SIZE options + nav row, keeping every screen
// within the WhatsApp-portability contract (≤10 options, ≤3 buttons/row)
// even for brands with 30+ catalog items (e.g. Reebok, Van Heusen).
// ---------------------------------------------------------------------

const CATALOG_PAGE_SIZE = 8;

function paginate<T>(list: T[], page: number): { pageItems: T[]; totalPages: number; page: number } {
  const totalPages = Math.max(1, Math.ceil(list.length / CATALOG_PAGE_SIZE));
  const clampedPage = Math.min(Math.max(0, page), totalPages - 1);
  const start = clampedPage * CATALOG_PAGE_SIZE;
  return { pageItems: list.slice(start, start + CATALOG_PAGE_SIZE), totalPages, page: clampedPage };
}

/** Adds a Prev/Next row when there's more than one page. The current
 * page/total is communicated in the message text (see orderFlow.ts),
 * not as a third inert button, so every button on this row stays
 * actionable — a non-clickable label button would violate the "every
 * decision is a button press" click-first principle for no benefit. */
function addPageNavRow(kb: InlineKeyboard, page: number, totalPages: number, prevData: string, nextData: string): void {
  if (totalPages <= 1) return;
  kb.row();
  if (page > 0) kb.text("⬅️ Prev", prevData);
  if (page < totalPages - 1) kb.text("Next ➡️", nextData);
}

/** S1a: brand/category group picker within the chosen tier. */
export function catalogGroupMenu(groups: CatalogGroup[], page = 0): InlineKeyboard {
  const { pageItems, totalPages, page: p } = paginate(groups, page);
  const kb = new InlineKeyboard();
  for (const group of pageItems) {
    kb.text(group.label, `catgroup:${group.id}`).row();
  }
  addPageNavRow(kb, p, totalPages, `catgrouppage:${p - 1}`, `catgrouppage:${p + 1}`);
  kb.row().text("🔙 Back", "back").text("❌ Cancel", "cancel");
  return kb;
}

/** S1b: catalog item/style picker within the chosen group. */
export function catalogItemMenu(items: CatalogItem[], page = 0): InlineKeyboard {
  const { pageItems, totalPages, page: p } = paginate(items, page);
  const kb = new InlineKeyboard();
  for (const item of pageItems) {
    kb.text(item.label, `catitem:${item.id}`).row();
  }
  addPageNavRow(kb, p, totalPages, `catitempage:${p - 1}`, `catitempage:${p + 1}`);
  kb.row().text("🔙 Back", "back").text("❌ Cancel", "cancel");
  return kb;
}

/** S1c: confirm the rendered catalog page image actually matches what the customer wants. */
export function catalogImageConfirmMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Yes, this one", "catimg:yes")
    .text("🔙 Choose another", "catimg:no")
    .row()
    .text("❌ Cancel", "cancel");
}

/** S1d: colour picker for items that have extracted colour variants. */
export function catalogColorMenu(variants: CatalogVariant[], page = 0): InlineKeyboard {
  const { pageItems, totalPages, page: p } = paginate(variants, page);
  const kb = new InlineKeyboard();
  for (const variant of pageItems) {
    kb.text(variant.colorName, `catcolor:${variant.id}`).row();
  }
  addPageNavRow(kb, p, totalPages, `catcolorpage:${p - 1}`, `catcolorpage:${p + 1}`);
  kb.row().text("🔙 Back", "back").text("❌ Cancel", "cancel");
  return kb;
}

/** S1e: confirm the chosen colour after seeing that colour's exact product/model image. Selection is only finalized on "Use this colour". */
export function catalogColorConfirmMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Use this colour", "catcolorconfirm:yes")
    .row()
    .text("🔄 Choose another colour", "catcolorconfirm:no")
    .row()
    .text("❌ Cancel", "cancel");
}

export function optionsQualityMenu(options: { id: string; name: string }[], page = 0): InlineKeyboard {
  const { pageItems, totalPages, page: p } = paginate(options, page);
  const kb = new InlineKeyboard();
  for (const opt of pageItems) {
    kb.text(opt.name, `optquality:${opt.id}`).row();
  }
  addPageNavRow(kb, p, totalPages, `optqualitypage:${p - 1}`, `optqualitypage:${p + 1}`);
  kb.row().text("🔙 Back", "back").text("❌ Cancel", "cancel");
  return kb;
}

export function optionsColorMenu(colors: string[], page = 0): InlineKeyboard {
  const { pageItems, totalPages, page: p } = paginate(colors, page);
  const kb = new InlineKeyboard();
  for (let i = 0; i < pageItems.length; i += 2) {
    const c1 = pageItems[i];
    const c2 = pageItems[i + 1];
    kb.text(c1, `optcolor:${encodeURIComponent(c1)}`);
    if (c2) {
      kb.text(c2, `optcolor:${encodeURIComponent(c2)}`);
    }
    kb.row();
  }
  addPageNavRow(kb, p, totalPages, `optcolorpage:${p - 1}`, `optcolorpage:${p + 1}`);
  kb.row().text("🔙 Back", "back").text("❌ Cancel", "cancel");
  return kb;
}

