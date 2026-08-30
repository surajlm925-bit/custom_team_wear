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

export function tierMenu(): InlineKeyboard {
  const kb = new InlineKeyboard();
  (Object.keys(TIER_LABELS) as Tier[]).forEach((tier) => {
    kb.text(`${TIER_LABELS[tier]} · from ₹${TIER_FROM_RATE[tier]}/pc`, `tier:${tier}`).row();
  });
  kb.text("❌ Cancel", "cancel");
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
    .text("🗓 Flexible — 15+ days", "timeline:flexible");
}

export function logoPlacementMenu(): InlineKeyboard {
  const kb = new InlineKeyboard();
  LOGO_PLACEMENTS.forEach((placement, i) => {
    kb.text(`${i + 1}️⃣ ${placement.label}`, `placement:${placement.id}`).row();
  });
  kb.text("⏭ Skip — no artwork yet", "logo:skip");
  return kb;
}

export function addAnotherLogoMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("➕ Add another logo", "logo:more")
    .row()
    .text("✅ No more — continue", "logo:done");
}

export function quoteCardMenu(advanceDue: number, showCallMe: boolean): InlineKeyboard {
  const kb = new InlineKeyboard().text(`💳 Pay ₹${advanceDue.toLocaleString("en-IN")} garment advance`, "pay");
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
