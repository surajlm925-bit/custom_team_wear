/**
 * The full S00-S11 conversation — PRD §5.
 * Implements the flow map exactly; every step is click-first except the
 * typed inputs (qty, city, name, phone).
 *
 * New flow:
 * 1. Greeting (bulk order | trial sample)
 * 2. Round Neck | Collar
 * 3. Quantity (typed input)
 * 4. Delivery option (City, Name, Phone, Timeline)
 * 5. Quality Tier (Value | Recommended | Premium)
 * 6. Fabric & Sub-Quality (Cotton vs Polyester -> Sub-qualities from quality/)
 * 7. Color (exact swatches)
 * 8. Branding (Print | Embroidery)
 * 9. Branding position + logo upload (up to 3)
 * 10. Mockup (on white shirt)
 * 11. Payment & Confirmation
 */

import { InputFile } from "grammy";
import { COPY } from "./copy.js";
import {
  addAnotherLogoMenu,
  backAndCancelMenu,
  brandingMenu,
  garmentSilhouetteMenu,
  generateMockupMenu,
  greetingOrderTypeMenu,
  logoPlacementMenu,
  paymentScreenMenu,
  quoteCardMenu,
  resumeMenu,
  sampleKitFabricMenu,
  tierMenu,
  timelineMenu,
} from "./keyboards.js";
import { CANCEL, isCancelCallback, waitForStep } from "./waitHelpers.js";
import { runCatalogSelection } from "./steps/catalogSelection.js";
import type { MyConversation, MyConversationContext } from "./types.js";
import {
  computeAdvanceDue,
  computeGarmentTotal,
  computeGrandEstimate,
  computePrintEstimate,
  computeSampleKitTotal,
  meetsMoq,
  resolveEvenSplit,
  showsCallMe,
} from "../pricing/index.js";
import type { LogoPlacement, PrintMethod, ProductId, Tier } from "../pricing/priceBook.js";
import { normalizeIndianPhone, sanitizeCity, sanitizeName } from "../shared/sanitize.js";
import { renderQuoteCard } from "../shared/render.js";
import type { OrderData, Timeline } from "../shared/types.js";
import { generateUpiQrPng } from "../qr/index.js";
import { nextOrderId } from "../session/orderId.js";
import { safeAppendOrderRow } from "../sheets/safeAppend.js";
import { appendCatalogSelectionRow } from "../sheets/catalogSelections.js";
import { getEnv } from "../config/env.js";
import { loadDraft, saveDraft, clearDraft } from "../session/draftStore.js";
import type { OrderDraft } from "./draft.js";
import { notifyAdmins, notifyAdminsText } from "../admin/notify.js";
import { saveOrderSnapshot } from "../session/orderStore.js";
import { triggerMockupDelivery } from "../mockup/deliverTrigger.js";

/** Entry point registered with createConversation(orderFlow). */
export async function orderFlow(conversation: MyConversation, ctx: MyConversationContext) {
  const chatId = ctx.chat!.id;

  // ---- Resume check (PRD AC13) ----
  const existingDraft = await conversation.external(() => loadDraft(chatId));
  let draft: OrderDraft = {};

  if (existingDraft?.qty && existingDraft.updatedAt && Date.now() - existingDraft.updatedAt < 24 * 60 * 60 * 1000) {
    await ctx.reply(COPY.resumePrompt, { reply_markup: resumeMenu() });
    const choice = await waitForStep<"resume" | "fresh">(
      conversation,
      (c) => {
        const data = c.callbackQuery?.data;
        if (data === "resume:yes") return "resume";
        if (data === "resume:no") return "fresh";
        return undefined;
      },
      (c) => c.reply(COPY.genericReprompt),
    );
    if (choice === "resume") {
      draft = existingDraft;
    } else {
      await conversation.external(() => clearDraft(chatId));
    }
  } else if (existingDraft && !existingDraft.qty) {
    await conversation.external(() => clearDraft(chatId));
  }

  const persist = async () => {
    await conversation.external(() => saveDraft(chatId, draft));
  };

  const discard = async () => {
    await conversation.external(() => clearDraft(chatId));
    await ctx.reply(COPY.discardGoodbye);
  };

  const abandon = async () => {
    await conversation.external(() => clearDraft(chatId));
    await ctx.reply(COPY.abandonedGoodbye);
  };

  // ---- Step 1: Greeting (bulk order vs trial sample) ----
  if (!draft.orderType) {
    await ctx.reply(COPY.greetingAsk, { reply_markup: greetingOrderTypeMenu() });
    const orderTypeResult = await waitForStep<"bulk" | "sample">(
      conversation,
      (c) => {
        if (isCancelCallback(c)) return CANCEL;
        const data = c.callbackQuery?.data;
        if (data === "order:bulk") return "bulk";
        if (data === "order:sample") return "sample";
        return undefined;
      },
      (c) => c.reply(COPY.genericReprompt),
    );
    if (orderTypeResult === CANCEL) return discard();
    draft.orderType = orderTypeResult;
    await persist();
  }

  // ---- Step 2: Round Neck vs Collar ----
  if (!draft.garmentSilhouette) {
    await ctx.reply(COPY.garmentSilhouetteAsk, { reply_markup: garmentSilhouetteMenu() });
    const garmentResult = await waitForStep<"round_neck" | "collar" | "back">(
      conversation,
      (c) => {
        if (isCancelCallback(c)) return CANCEL;
        const data = c.callbackQuery?.data;
        if (data === "garment:round_neck") return "round_neck";
        if (data === "garment:collar") return "collar";
        if (data === "back") return "back";
        return undefined;
      },
      (c) => c.reply(COPY.genericReprompt),
    );
    if (garmentResult === CANCEL) return discard();
    if (garmentResult === "back") {
      draft.orderType = undefined;
      await persist();
      return orderFlow(conversation, ctx);
    }
    draft.garmentSilhouette = garmentResult;
    await persist();
  }

  // ---- Step 3: Quantity or Sample Kit Fabric ----
  if (draft.orderType === "sample") {
    if (!draft.fabric) {
      await ctx.reply(COPY.sampleKitFabricAsk, { reply_markup: sampleKitFabricMenu(), parse_mode: "Markdown" });
      const fabricResult = await waitForStep<"cotton" | "polyester" | "back">(
        conversation,
        (c) => {
          if (isCancelCallback(c)) return CANCEL;
          const data = c.callbackQuery?.data;
          if (data === "fabric:cotton") return "cotton";
          if (data === "fabric:polyester") return "polyester";
          if (data === "back") return "back";
          return undefined;
        },
        (c) => c.reply(COPY.genericReprompt),
      );
      if (fabricResult === CANCEL) return discard();
      if (fabricResult === "back") {
        draft.garmentSilhouette = undefined;
        await persist();
        return orderFlow(conversation, ctx);
      }
      draft.fabric = fabricResult;
      draft.qty = 3;
      draft.sizeSplit = resolveEvenSplit(3);
      draft.tier = "standard";
      const isCollar = draft.garmentSilhouette === "collar";
      draft.productId = isCollar
        ? (fabricResult === "cotton" ? "cotton_polo" : "dry_fit_polo")
        : (fabricResult === "cotton" ? "cotton_round_neck" : "dry_fit_round_neck");
      await persist();
    }
  } else {
    // Bulk branch: typed numeric quantity (MOQ 50)
    if (!draft.qty) {
      await ctx.reply(COPY.qtyAsk, { reply_markup: backAndCancelMenu() });
      const qtyResult = await waitForStep<number | "back">(
        conversation,
        (c) => {
          if (isCancelCallback(c)) return CANCEL;
          if (c.callbackQuery?.data === "back") return "back";
          const text = c.message?.text?.trim();
          if (!text) return undefined;
          const parsed = parseInt(text, 10);
          if (isNaN(parsed) || parsed < 1 || parsed > 100000) return undefined;
          return parsed;
        },
        (c) => c.reply(COPY.qtyInvalid),
      );
      if (qtyResult === CANCEL) return discard();
      if (qtyResult === "back") {
        draft.garmentSilhouette = undefined;
        await persist();
        return orderFlow(conversation, ctx);
      }

      if (!meetsMoq(qtyResult)) {
        await ctx.reply(COPY.rejection);
        await conversation.external(() => clearDraft(chatId));
        return;
      }

      draft.qty = qtyResult;
      draft.sizeSplit = resolveEvenSplit(qtyResult);
      await persist();
    }
  }

  const qty = draft.qty!;

  // ---- Step 4: Delivery option (City, Name, Phone, Timeline) ----
  if (!draft.city) {
    await ctx.reply(COPY.cityAsk, { reply_markup: backAndCancelMenu() });
    const cityResult = await waitForStep<string | "back">(
      conversation,
      (c) => {
        if (isCancelCallback(c)) return CANCEL;
        if (c.callbackQuery?.data === "back") return "back";
        const text = c.message?.text?.trim();
        if (!text) return undefined;
        return sanitizeCity(text);
      },
      (c) => c.reply(COPY.genericReprompt),
    );
    if (cityResult === CANCEL) return abandon();
    if (cityResult === "back") {
      if (draft.orderType === "sample") {
        draft.fabric = undefined;
        draft.qty = undefined;
        draft.sizeSplit = undefined;
        draft.productId = undefined;
      } else {
        draft.qty = undefined;
        draft.sizeSplit = undefined;
      }
      await persist();
      return orderFlow(conversation, ctx);
    }
    draft.city = cityResult;
    await persist();
  }

  if (!draft.name) {
    await ctx.reply(COPY.nameAsk, { reply_markup: backAndCancelMenu() });
    const nameResult = await waitForStep<string | "back">(
      conversation,
      (c) => {
        if (isCancelCallback(c)) return CANCEL;
        if (c.callbackQuery?.data === "back") return "back";
        const text = c.message?.text?.trim();
        if (!text) return undefined;
        return sanitizeName(text);
      },
      (c) => c.reply(COPY.genericReprompt),
    );
    if (nameResult === CANCEL) return abandon();
    if (nameResult === "back") {
      draft.city = undefined;
      await persist();
      return orderFlow(conversation, ctx);
    }
    draft.name = nameResult;
    await persist();
  }

  if (!draft.phone) {
    await ctx.reply(COPY.phoneAsk, { reply_markup: backAndCancelMenu() });
    let phone: string | "back" | typeof CANCEL | undefined;
    while (phone === undefined) {
      const raw = await waitForStep<string | "back">(
        conversation,
        (c) => {
          if (isCancelCallback(c)) return CANCEL;
          if (c.callbackQuery?.data === "back") return "back";
          const text = c.message?.text?.trim();
          if (!text) return undefined;
          return text;
        },
        (c) => c.reply(COPY.genericReprompt),
      );
      if (raw === CANCEL) return abandon();
      if (raw === "back") {
        draft.name = undefined;
        await persist();
        return orderFlow(conversation, ctx);
      }
      const normalized = normalizeIndianPhone(raw);
      if (normalized) {
        phone = normalized;
      } else {
        await ctx.reply(COPY.phoneInvalid, { reply_markup: backAndCancelMenu() });
      }
    }
    draft.phone = phone;
    await persist();
  }

  if (!draft.timeline) {
    await ctx.reply(COPY.timelineAsk, { reply_markup: timelineMenu() });
    const timelineResult = await waitForStep<Timeline | "back">(
      conversation,
      (c) => {
        if (isCancelCallback(c)) return CANCEL;
        const data = c.callbackQuery?.data;
        if (data === "timeline:urgent") return "urgent";
        if (data === "timeline:standard") return "standard";
        if (data === "timeline:flexible") return "flexible";
        if (data === "back") return "back";
        return undefined;
      },
      (c) => c.reply(COPY.genericReprompt),
    );
    if (timelineResult === CANCEL) return abandon();
    if (timelineResult === "back") {
      draft.phone = undefined;
      await persist();
      return orderFlow(conversation, ctx);
    }
    draft.timeline = timelineResult;
    draft.timelineUrgent = timelineResult === "urgent";
    await persist();
  }

  // Steps 5, 6 & 7 apply to Bulk orders (Trial sample kits include all 3 qualities)
  if (draft.orderType !== "sample") {
    // ---- Step 5: Quality Tier (Value | Recommended | Premium) ----
    if (!draft.tier) {
      await ctx.reply(COPY.welcome, { reply_markup: tierMenu() });
      const tierResult = await waitForStep<Tier | "back">(
        conversation,
        (c) => {
          if (isCancelCallback(c)) return CANCEL;
          const data = c.callbackQuery?.data;
          if (data === "back") return "back";
          if (!data?.startsWith("tier:")) return undefined;
          return data.slice("tier:".length) as Tier;
        },
        (c) => c.reply(COPY.genericReprompt),
      );
      if (tierResult === CANCEL) return abandon();
      if (tierResult === "back") {
        draft.timeline = undefined;
        await persist();
        return orderFlow(conversation, ctx);
      }
      draft.tier = tierResult;
      await persist();
    }

    // ---- Step 6 & 7: Fabric & Sub-Quality & Color ----
    if (!draft.catalogSelection) {
      const catalogResult = await runCatalogSelection(conversation, ctx, draft, draft.tier!, persist);
      if (catalogResult === CANCEL) return abandon();
      if (catalogResult === "back") {
        draft.tier = undefined;
        await persist();
        return orderFlow(conversation, ctx);
      }
      if (catalogResult === "assisted") return discard();
      draft.catalogSelection = catalogResult;
      draft.productId = catalogResult.productId;
      await persist();
    }
  }

  if (draft.orderType === "sample") {
    draft.printMethod = "none";
    draft.logoReceived = false;
    draft.logos = [];
  } else {
    // ---- Step 8: Branding (Print | Embroidery) ----
    if (!draft.printMethod) {
      await ctx.reply(COPY.brandingTypeAsk, { reply_markup: brandingMenu() });
      const brandingResult = await waitForStep<PrintMethod | "back">(
        conversation,
        (c) => {
          if (isCancelCallback(c)) return CANCEL;
          const data = c.callbackQuery?.data;
          if (data === "branding:print") return "screen_print";
          if (data === "branding:embroidery") return "embroidery";
          if (data === "back") return "back";
          return undefined;
        },
        (c) => c.reply(COPY.genericReprompt),
      );
      if (brandingResult === CANCEL) return abandon();
      if (brandingResult === "back") {
        draft.catalogSelection = undefined;
        draft.colorName = undefined;
        await persist();
        return orderFlow(conversation, ctx);
      }
      draft.printMethod = brandingResult;
      await persist();
    }

    // ---- Step 9: Branding position + logo upload (up to 3) ----
    if (draft.logoReceived === undefined) {
      draft.logos = draft.logos ?? [];
      let addingMore = true;

      while (addingMore && draft.logos.length < 3) {
        await ctx.reply(COPY.placementAsk, { reply_markup: logoPlacementMenu() });
        const placementResult = await waitForStep<LogoPlacement | "skip" | "back">(
          conversation,
          (c) => {
            if (isCancelCallback(c)) return CANCEL;
            const data = c.callbackQuery?.data;
            if (data === "logo:skip") return "skip";
            if (data === "back") return "back";
            if (!data?.startsWith("placement:")) return undefined;
            return data.slice("placement:".length) as LogoPlacement;
          },
          (c) => c.reply(COPY.genericReprompt),
        );
        if (placementResult === CANCEL) return abandon();
        if (placementResult === "back") {
          draft.printMethod = undefined;
          draft.logos = [];
          await persist();
          return orderFlow(conversation, ctx);
        }
        if (placementResult === "skip") {
          addingMore = false;
          break;
        }

        await ctx.reply(COPY.logoUploadPrompt, { reply_markup: backAndCancelMenu() });
        const uploadResult = await waitForStep<{ fileId: string; mimeType: string } | "back">(
          conversation,
          (c) => {
            if (isCancelCallback(c)) return CANCEL;
            if (c.callbackQuery?.data === "back") return "back";
            const photo = c.message?.photo;
            if (photo && photo.length > 0) {
              const best = photo[photo.length - 1];
              return { fileId: best.file_id, mimeType: "image/jpeg" };
            }
            const doc = c.message?.document;
            if (doc && doc.mime_type && ["image/png", "image/jpeg", "image/webp"].includes(doc.mime_type)) {
              return { fileId: doc.file_id, mimeType: doc.mime_type };
            }
            return undefined;
          },
          (c) => c.reply(COPY.genericReprompt),
        );
        if (uploadResult === CANCEL) return abandon();
        if (uploadResult === "back") {
          continue;
        }

        draft.logos.push({
          placement: placementResult,
          fileId: uploadResult.fileId,
        });
        await persist();

        if (draft.logos.length < 3) {
          await ctx.reply(COPY.addAnotherLogoAsk(draft.logos.length), { reply_markup: addAnotherLogoMenu() });
          const continueChoice = await waitForStep<"more" | "done">(
            conversation,
            (c) => {
              if (isCancelCallback(c)) return CANCEL;
              const data = c.callbackQuery?.data;
              if (data === "logo:more") return "more";
              if (data === "logo:done") return "done";
              return undefined;
            },
            (c) => c.reply(COPY.genericReprompt),
          );
          if (continueChoice === CANCEL) return abandon();
          addingMore = continueChoice === "more";
        } else {
          addingMore = false;
        }
      }

      draft.logoReceived = (draft.logos?.length ?? 0) > 0;
      await persist();
    }
  }

  // ---- Assemble Order Data ----
  const tier = draft.tier ?? "standard";
  const productId: ProductId =
    draft.productId ?? (draft.garmentSilhouette === "collar" ? "dry_fit_polo" : "dry_fit_round_neck");
  const isSample = draft.orderType === "sample";
  const garment = isSample
    ? computeSampleKitTotal(draft.fabric ?? "polyester")
    : computeGarmentTotal(tier, productId, qty);
  const printEstimate = isSample ? { low: 0, high: 0 } : computePrintEstimate(draft.printMethod!, qty);
  const grandEstimate = isSample
    ? { low: garment.total, high: garment.total }
    : computeGrandEstimate(garment.total, printEstimate);
  const advanceDue = computeAdvanceDue(garment.total, { orderType: draft.orderType });

  if (!draft.orderId) {
    draft.orderId = await conversation.external(() => nextOrderId());
    await persist();
  }

  const env = await conversation.external(() => getEnv());

  const order: OrderData = {
    orderId: draft.orderId!,
    status: "Pending Payment",
    orderType: draft.orderType,
    tier,
    productId,
    catalogSelection: draft.catalogSelection,
    qty,
    sizeSplit: draft.sizeSplit as OrderData["sizeSplit"],
    printMethod: draft.printMethod!,
    city: draft.city!,
    name: draft.name!,
    phone: draft.phone!,
    timeline: draft.timeline!,
    timelineUrgent: draft.timelineUrgent ?? false,
    logoReceived: draft.logoReceived ?? false,
    logos: draft.logos ?? [],
    garmentRate: garment.ratePerPiece,
    garmentTotal: garment.total,
    printEstLow: printEstimate.low,
    printEstHigh: printEstimate.high,
    grandEstLow: grandEstimate.low,
    grandEstHigh: grandEstimate.high,
    advanceDue,
    customerChatId: `tg:${chatId}`,
    channel: "telegram",
  };

  // ---- Step 10: Mockup step (AFTER logo upload, BEFORE payment) ----
  if (order.logoReceived && order.logos.length > 0) {
    await ctx.reply(COPY.mockupOfferAsk, { reply_markup: generateMockupMenu(), parse_mode: "Markdown" });
    const mockupChoice = await waitForStep<"generate" | "skip" | "back">(
      conversation,
      (c) => {
        if (isCancelCallback(c)) return CANCEL;
        const data = c.callbackQuery?.data;
        if (data === "mockup:generate") return "generate";
        if (data === "mockup:skip") return "skip";
        if (data === "back") return "back";
        return undefined;
      },
      (c) => c.reply(COPY.genericReprompt),
    );
    if (mockupChoice === CANCEL) return abandon();
    if (mockupChoice === "back") {
      draft.logoReceived = undefined;
      draft.logos = [];
      await persist();
      return orderFlow(conversation, ctx);
    }
    if (mockupChoice === "generate") {
      await ctx.reply(COPY.mockupGeneratingNote);
      await conversation.external(async () => {
        await saveOrderSnapshot(order).catch(() => {});
        await triggerMockupDelivery(order.orderId);
      });
    }
  }

  // ---- S11 Payment ----
  await ctx.reply(renderQuoteCard(order), {
    reply_markup: quoteCardMenu(advanceDue, showsCallMe(qty), isSample),
    parse_mode: "Markdown",
  });

  const quoteChoice = await waitForStep<"pay" | "callme">(
    conversation,
    (c) => {
      if (isCancelCallback(c)) return CANCEL;
      const data = c.callbackQuery?.data;
      if (data === "pay") return "pay";
      if (data === "callme") return "callme";
      return undefined;
    },
    (c) => c.reply(COPY.genericReprompt),
  );
  if (quoteChoice === CANCEL) return abandon();

  if (quoteChoice === "callme") {
    await ctx.reply(COPY.callMeAck);
    await conversation.external(async () => {
      await safeAppendOrderRow({ ...order, status: "Lead — High-Value Callback" }).catch(() => {});
      await clearDraft(chatId);
      await notifyAdminsText(
        `📞 HIGH-VALUE CALLBACK REQUESTED for ${order.orderId} (${order.qty} pcs, ~₹${order.garmentTotal.toLocaleString("en-IN")}) by ${order.name} (${order.phone}, ${order.city}).`,
      ).catch(() => {});
    });
    return;
  }

  // Dynamic QR generation
  const qrPng = await conversation.external(() =>
    generateUpiQrPng(env.MERCHANT_VPA, advanceDue, order.orderId),
  );

  await ctx.replyWithPhoto(new InputFile(qrPng, `upi-${order.orderId}.png`), {
    caption: COPY.paymentIntro(`₹${advanceDue.toLocaleString("en-IN")}`, isSample),
    parse_mode: "Markdown",
    reply_markup: paymentScreenMenu(),
  });

  const screenshotResult = await waitForStep<{ fileId: string }>(
    conversation,
    (c) => {
      if (isCancelCallback(c)) return CANCEL;
      const photo = c.message?.photo;
      if (photo && photo.length > 0) {
        return { fileId: photo[photo.length - 1].file_id };
      }
      const doc = c.message?.document;
      if (doc) return { fileId: doc.file_id };
      return undefined;
    },
    (c) => c.reply(COPY.genericReprompt),
  );

  if (screenshotResult === CANCEL) {
    await conversation.external(async () => {
      await safeAppendOrderRow({ ...order, status: "Lead — No Payment" }).catch(() => {});
      await clearDraft(chatId);
      await notifyAdminsText(
        `⚠️ CUSTOMER CANCELLED AT PAYMENT: Order ${order.orderId} (${order.qty} pcs, ~₹${order.garmentTotal.toLocaleString("en-IN")}) by ${order.name} (${order.phone}).`,
      ).catch(() => {});
    });
    await ctx.reply(COPY.abandonedGoodbye);
    return;
  }

  await ctx.reply(COPY.screenshotAck);

  await conversation.external(async () => {
    await safeAppendOrderRow(order);
    if (order.catalogSelection) {
      await appendCatalogSelectionRow(order.orderId, order.catalogSelection).catch((err) => {
        console.error(`CatalogSelection sheet append failed for ${order.orderId}:`, err);
      });
    }
    await saveOrderSnapshot(order).catch(() => {});
    await clearDraft(chatId);
    await notifyAdmins(
      order,
      screenshotResult.fileId,
    ).catch((err) => {
      console.error(`Failed to notify admins for ${order.orderId}:`, err);
      return notifyAdminsText(
        `🚨 EMERGENCY: Payment screenshot received for ${order.orderId} (${order.name}, ${order.phone}), but photo forwarding failed. Check Telegram manually.`,
      ).catch(() => {});
    });
  });
}
