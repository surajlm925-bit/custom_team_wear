/**
 * S1 — Menu-driven Quality & Color Selection:
 * Fabric (Cotton vs Polyester) -> Sub-quality option (e.g. UF 007-011) -> Color grid.
 *
 * Click-first, fast menu navigation using inline keyboards.
 * Captures all colors for each quality option without sending heavy PDF images.
 */

import { COPY } from "../copy.js";
import {
  fabricMenu,
  optionsColorMenu,
  optionsQualityMenu,
} from "../keyboards.js";
import { CANCEL, isCancelCallback, waitForStep } from "../waitHelpers.js";
import type { MyConversation, MyConversationContext } from "../types.js";
import type { OrderDraft } from "../draft.js";
import type { CatalogSelection } from "../../shared/types.js";
import type { Tier } from "../../pricing/priceBook.js";
import {
  getQualityOptions,
  getQualityOptionById,
  resolveProductId,
} from "../../catalog/options.js";

export async function runCatalogSelection(
  conversation: MyConversation,
  ctx: MyConversationContext,
  draft: OrderDraft,
  tier: Tier,
  persist: () => Promise<void>,
): Promise<CatalogSelection | "back" | "assisted" | typeof CANCEL> {
  const garment = draft.garmentSilhouette ?? "collar";
  let qualityPage = 0;
  let colorPage = 0;

  while (true) {
    // Stage 1: Fabric (Cotton vs Polyester)
    if (!draft.fabric || !draft.productId) {
      await ctx.reply(COPY.fabricAsk, { reply_markup: fabricMenu() });
      const fabricResult = await waitForStep<"cotton" | "polyester" | "back">(
        conversation,
        (c) => {
          if (isCancelCallback(c)) return CANCEL;
          const data = c.callbackQuery?.data;
          if (data === "back") return "back";
          if (data === "fabric:cotton") return "cotton";
          if (data === "fabric:polyester") return "polyester";
          return undefined;
        },
        (c) => c.reply(COPY.genericReprompt),
      );

      if (fabricResult === CANCEL) return CANCEL;
      if (fabricResult === "back") return "back";

      draft.fabric = fabricResult;
      draft.productId = resolveProductId(garment, fabricResult);
      draft.qualityOptionId = undefined;
      draft.qualityOptionName = undefined;
      draft.colorName = undefined;
      draft.catalogSelection = undefined;
      await persist();
    }

    // Stage 2: Sub-Quality selection
    const qualities = getQualityOptions(tier, draft.productId);
    if (!draft.qualityOptionId) {
      if (qualities.length <= 1) {
        // Auto-select if only 1 quality grade exists
        draft.qualityOptionId = qualities[0]?.id ?? "standard";
        draft.qualityOptionName = qualities[0]?.name ?? "Standard Quality";
        await persist();
      } else {
        await ctx.reply(COPY.catalogQualityAsk, {
          reply_markup: optionsQualityMenu(qualities, qualityPage),
        });

        const qualityResult = await waitForStep<{ type: "select"; id: string } | { type: "page"; page: number } | "back">(
          conversation,
          (c) => {
            if (isCancelCallback(c)) return CANCEL;
            const data = c.callbackQuery?.data;
            if (data === "back") return "back";
            if (data?.startsWith("optqualitypage:")) {
              const p = parseInt(data.slice("optqualitypage:".length), 10);
              return { type: "page", page: isNaN(p) ? 0 : p };
            }
            if (data?.startsWith("optquality:")) {
              return { type: "select", id: data.slice("optquality:".length) };
            }
            return undefined;
          },
          (c) => c.reply(COPY.genericReprompt),
        );

        if (qualityResult === CANCEL) return CANCEL;
        if (qualityResult === "back") {
          draft.fabric = undefined;
          draft.productId = undefined;
          await persist();
          continue;
        }
        if (qualityResult.type === "page") {
          qualityPage = qualityResult.page;
          continue;
        }

        const picked = qualities.find((q) => q.id === qualityResult.id);
        draft.qualityOptionId = picked?.id ?? qualityResult.id;
        draft.qualityOptionName = picked?.name ?? "Standard";
        await persist();
      }
    }

    // Stage 3: Color selection
    const qualityOption = getQualityOptionById(tier, draft.productId, draft.qualityOptionId);
    const colors = qualityOption?.colors ?? ["Black", "White", "Navy Blue", "Royal Blue", "Red", "Grey"];

    if (!draft.colorName) {
      await ctx.reply(
        `Selected **${draft.qualityOptionName}**.\n\nNow choose your garment colour:`,
        {
          reply_markup: optionsColorMenu(colors, colorPage),
          parse_mode: "Markdown",
        },
      );

      const colorResult = await waitForStep<{ type: "select"; color: string } | { type: "page"; page: number } | "back">(
        conversation,
        (c) => {
          if (isCancelCallback(c)) return CANCEL;
          const data = c.callbackQuery?.data;
          if (data === "back") return "back";
          if (data?.startsWith("optcolorpage:")) {
            const p = parseInt(data.slice("optcolorpage:".length), 10);
            return { type: "page", page: isNaN(p) ? 0 : p };
          }
          if (data?.startsWith("optcolor:")) {
            return { type: "select", color: decodeURIComponent(data.slice("optcolor:".length)) };
          }
          return undefined;
        },
        (c) => c.reply(COPY.genericReprompt),
      );

      if (colorResult === CANCEL) return CANCEL;
      if (colorResult === "back") {
        if (qualities.length > 1) {
          draft.qualityOptionId = undefined;
          draft.qualityOptionName = undefined;
        } else {
          draft.fabric = undefined;
          draft.productId = undefined;
          draft.qualityOptionId = undefined;
          draft.qualityOptionName = undefined;
        }
        await persist();
        continue;
      }
      if (colorResult.type === "page") {
        colorPage = colorResult.page;
        continue;
      }

      draft.colorName = colorResult.color;
      draft.catalogSelection = {
        catalogVersion: "v2-options-tree",
        tier,
        groupId: draft.fabric ?? "cotton",
        groupLabel: draft.fabric === "cotton" ? "100% Cotton" : "Polyester (Dry Fit)",
        itemId: draft.qualityOptionId,
        itemLabel: draft.qualityOptionName ?? "Standard",
        productId: draft.productId,
        garmentType: garment === "collar" ? "polo" : "round_neck",
        sourceId: "quality-data",
        sourcePage: 1,
        colorName: draft.colorName,
        referenceImageKind: "placeholder",
        mockupEligible: true,
      };
      await persist();
    }

    return draft.catalogSelection!;
  }
}
