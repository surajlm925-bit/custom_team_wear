/**
 * S1 — Menu-driven Quality & Color Selection:
 * Quality tier -> Garment & Fabric type -> Quality option (if multiple) -> Color.
 *
 * Click-first, fast menu navigation using inline keyboards.
 * Captures all colors for each quality option without sending heavy PDF images.
 */

import { COPY } from "../copy.js";
import {
  optionsColorMenu,
  optionsQualityMenu,
  productMenu,
} from "../keyboards.js";
import { CANCEL, isCancelCallback, waitForStep } from "../waitHelpers.js";
import type { MyConversation, MyConversationContext } from "../types.js";
import type { OrderDraft } from "../draft.js";
import type { CatalogSelection } from "../../shared/types.js";
import type { ProductId, Tier } from "../../pricing/priceBook.js";
import { PRODUCT_SILHOUETTE } from "../../pricing/priceBook.js";
import { getProduct } from "../../pricing/index.js";
import {
  getQualityOptions,
  type QualityOption,
} from "../../catalog/options.js";

type PickResult = { type: "select"; id: string } | { type: "page"; page: number } | "back";

export async function runCatalogSelection(
  conversation: MyConversation,
  ctx: MyConversationContext,
  draft: OrderDraft,
  tier: Tier,
  persist: () => Promise<void>,
): Promise<CatalogSelection | "back" | "assisted" | typeof CANCEL> {
  let productId: ProductId | undefined = draft.productId;
  let qualityId: string | undefined = draft.catalogItemId;
  let qualityPage = 0;
  let colorPage = 0;

  // Determine starting stage
  let stage: "product" | "quality" | "color" = "product";
  if (productId) {
    const qualities = getQualityOptions(tier, productId);
    if (qualityId && qualities.some((q) => q.id === qualityId)) {
      stage = "color";
    } else if (qualities.length === 1) {
      qualityId = qualities[0].id;
      stage = "color";
    } else {
      stage = "quality";
    }
  }

  while (true) {
    if (stage === "product") {
      await ctx.reply(COPY.catalogProductAsk, { reply_markup: productMenu(tier) });
      const result = await waitForStep<ProductId | "back">(
        conversation,
        (c) => {
          if (isCancelCallback(c)) return CANCEL;
          const data = c.callbackQuery?.data;
          if (data === "back") return "back";
          if (data?.startsWith("product:")) return data.slice("product:".length) as ProductId;
          return undefined;
        },
        (c) => c.reply(COPY.genericReprompt),
      );

      if (result === CANCEL) return CANCEL;
      if (result === "back") return "back";

      productId = result;
      draft.productId = productId;
      qualityId = undefined;
      draft.catalogItemId = undefined;
      await persist();

      const qualities = getQualityOptions(tier, productId);
      if (qualities.length === 0) {
        // Fallback if no specific quality options defined
        qualityId = "standard";
        stage = "color";
      } else if (qualities.length === 1) {
        qualityId = qualities[0].id;
        draft.catalogItemId = qualityId;
        await persist();
        stage = "color";
      } else {
        qualityPage = 0;
        stage = "quality";
      }
      continue;
    }

    if (stage === "quality") {
      const qualities = getQualityOptions(tier, productId!);
      if (qualities.length <= 1) {
        qualityId = qualities[0]?.id ?? "standard";
        stage = "color";
        continue;
      }

      await ctx.reply(COPY.catalogQualityAsk, {
        reply_markup: optionsQualityMenu(qualities, qualityPage),
      });

      const result = await waitForStep<PickResult>(
        conversation,
        (c) => {
          if (isCancelCallback(c)) return CANCEL;
          const data = c.callbackQuery?.data;
          if (data === "back") return "back";
          if (data?.startsWith("optquality:")) return { type: "select", id: data.slice("optquality:".length) };
          if (data?.startsWith("optqualitypage:")) return { type: "page", page: Number(data.slice("optqualitypage:".length)) };
          return undefined;
        },
        (c) => c.reply(COPY.genericReprompt),
      );

      if (result === CANCEL) return CANCEL;
      if (result === "back") {
        productId = undefined;
        draft.productId = undefined;
        qualityId = undefined;
        draft.catalogItemId = undefined;
        await persist();
        stage = "product";
        continue;
      }
      if (result.type === "page") {
        qualityPage = result.page;
        continue;
      }

      qualityId = result.id;
      draft.catalogItemId = qualityId;
      colorPage = 0;
      await persist();
      stage = "color";
      continue;
    }

    if (stage === "color") {
      const qualities = getQualityOptions(tier, productId!);
      const quality: QualityOption = qualities.find((q) => q.id === qualityId) ??
        qualities[0] ?? {
          id: "standard",
          name: "Standard",
          colors: ["White", "Black", "Navy Blue", "Royal Blue", "Red", "Grey"],
        };

      const colors = quality.colors.length > 0
        ? quality.colors
        : ["White", "Black", "Navy Blue", "Royal Blue", "Red", "Grey"];

      const product = getProduct(productId!);
      await ctx.reply(`Pick a colour for **${product.label[tier]} (${quality.name})**:`, {
        reply_markup: optionsColorMenu(colors, colorPage),
        parse_mode: "Markdown",
      });

      const result = await waitForStep<PickResult>(
        conversation,
        (c) => {
          if (isCancelCallback(c)) return CANCEL;
          const data = c.callbackQuery?.data;
          if (data === "back") return "back";
          if (data?.startsWith("optcolor:")) {
            return { type: "select", id: decodeURIComponent(data.slice("optcolor:".length)) };
          }
          if (data?.startsWith("optcolorpage:")) {
            return { type: "page", page: Number(data.slice("optcolorpage:".length)) };
          }
          return undefined;
        },
        (c) => c.reply(COPY.genericReprompt),
      );

      if (result === CANCEL) return CANCEL;
      if (result === "back") {
        if (qualities.length > 1) {
          qualityId = undefined;
          draft.catalogItemId = undefined;
          await persist();
          stage = "quality";
        } else {
          productId = undefined;
          draft.productId = undefined;
          qualityId = undefined;
          draft.catalogItemId = undefined;
          await persist();
          stage = "product";
        }
        continue;
      }
      if (result.type === "page") {
        colorPage = result.page;
        continue;
      }

      const selectedColor = result.id;
      await ctx.reply(COPY.catalogSelectionEcho(`${product.label[tier]} (${quality.name})`, selectedColor));

      const selection: CatalogSelection = {
        catalogVersion: "options-v2",
        tier,
        groupId: productId!,
        groupLabel: product.label[tier],
        itemId: quality.id,
        itemLabel: `${product.label[tier]} (${quality.name})`,
        productId: productId!,
        garmentType: PRODUCT_SILHOUETTE[productId!],
        sourceId: "quality-folder",
        sourcePage: 1,
        colorName: selectedColor,
        referenceImageKind: "placeholder",
        mockupEligible: true,
      };

      return selection;
    }
  }
}
