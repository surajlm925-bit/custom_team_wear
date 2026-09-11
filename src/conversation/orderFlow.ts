/**
 * The full S00-S11 conversation — PRD §5.
 * Implements the flow map exactly; every step is click-first except the
 * six typed inputs enumerated in PRD §5.5.
 */

import { InputFile } from "grammy";
import { COPY } from "./copy.js";
import {
  addAnotherLogoMenu,
  bracketRevealMenu,
  cancelOnlyMenu,
  generateMockupMenu,
  logoPlacementMenu,
  paymentScreenMenu,
  printMethodMenu,
  quoteCardMenu,
  resumeMenu,
  sizeSplitModeMenu,
  tierMenu,
  timelineMenu,
} from "./keyboards.js";
import { CANCEL, isCancelCallback, waitForStep } from "./waitHelpers.js";
import { collectOwnSizeSplit } from "./steps/sizeSplit.js";
import { runCatalogSelection } from "./steps/catalogSelection.js";
import type { MyConversation, MyConversationContext } from "./types.js";
import {
  computeAdvanceDue,
  computeGarmentTotal,
  computeGrandEstimate,
  computePrintEstimate,
  getNextBracketRate,
  getPrintMethod,
  getProduct,
  meetsMoq,
  resolveEvenSplit,
  resolveStandardMix,
  showsCallMe,
} from "../pricing/index.js";
import type { LogoPlacement, PrintMethod, Tier } from "../pricing/priceBook.js";
import { LOGO_PLACEMENTS } from "../pricing/priceBook.js";
import { isValidQty, normalizeIndianPhone, sanitizeCity, sanitizeName } from "../shared/sanitize.js";
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
  }

  const persist = async () => {
    await conversation.external(() => saveDraft(chatId, draft));
  };

  // ---- S00 Tier menu ----
  if (!draft.tier) {
    await ctx.reply(COPY.welcome, { reply_markup: tierMenu() });
    const tierResult = await waitForStep<Tier>(
      conversation,
      (c) => {
        if (isCancelCallback(c)) return CANCEL;
        const data = c.callbackQuery?.data;
        if (!data?.startsWith("tier:")) return undefined;
        return data.slice("tier:".length) as Tier;
      },
      (c) => c.reply(COPY.genericReprompt),
    );
    if (tierResult === CANCEL) return discard();
    draft.tier = tierResult;
    await persist();
  }

  // ---- S1 Catalog selection: brand/category -> style -> image confirm -> colour ----
  if (!draft.catalogSelection) {
    const catalogResult = await runCatalogSelection(conversation, ctx, draft, draft.tier, persist);
    if (catalogResult === CANCEL) return discard();
    if (catalogResult === "assisted") {
      // Customer was routed to assisted selection (e.g. an image-only
      // brand like Reebok/Van Heusen with no auto-orderable items). The
      // "contact our team" message has already been sent inside
      // runCatalogSelection; end the flow here without a redundant
      // cancellation message. The draft is cleared so /start begins fresh.
      return discard();
    }
    if (catalogResult === "back") {
      draft.tier = undefined;
      draft.catalogGroupId = undefined;
      draft.catalogItemId = undefined;
      await persist();
      return orderFlow(conversation, ctx);
    }
    draft.catalogSelection = catalogResult;
    draft.productId = catalogResult.productId;
    draft.catalogGroupId = undefined;
    draft.catalogItemId = undefined;
    await persist();
  }

  const tier = draft.tier;
  const productId = draft.productId!;

  // ---- S2a/S2b/S2c Quantity gate + bracket reveal ----
  let qtyConfirmed = Boolean(draft.qty);
  while (!qtyConfirmed) {
    await ctx.reply(COPY.qtyAsk);
    const qty = await waitForStep<number>(
      conversation,
      (c) => {
        if (isCancelCallback(c)) return CANCEL;
        const text = c.message?.text;
        if (text === undefined) return undefined;
        const parsed = isValidQty(text);
        return parsed ?? undefined;
      },
      (c) => c.reply(COPY.qtyInvalid),
    );
    if (qty === CANCEL) return discard();

    if (!meetsMoq(qty)) {
      // PRD S2b: TERMINAL, zero logging anywhere.
      await ctx.reply(COPY.rejection);
      await conversation.external(() => clearDraft(chatId));
      return;
    }

    draft.qty = qty;
    await persist();

    const rate = computeGarmentTotal(tier, productId, qty).ratePerPiece;
    const nextBracket = getNextBracketRate(tier, productId, qty);
    const product = getProduct(productId);
    let revealText = `✅ **${qty} pcs qualifies for pricing: ₹${rate}/pc** (${product.label[tier]})`;
    if (nextBracket) {
      revealText += `\n💡 At **${nextBracket.nextBracketQty} pcs** it drops to **₹${nextBracket.nextRate}/pc** — you'd save **₹${nextBracket.savingsTotal.toLocaleString("en-IN")}**.`;
    }
    revealText += `\n\nContinue with ${qty}?`;

    await ctx.reply(revealText, { reply_markup: bracketRevealMenu() });
    const bracketChoice = await waitForStep<"continue" | "change">(
      conversation,
      (c) => {
        if (isCancelCallback(c)) return CANCEL;
        const data = c.callbackQuery?.data;
        if (data === "bracket:continue") return "continue";
        if (data === "bracket:change") return "change";
        return undefined;
      },
      (c) => c.reply(COPY.genericReprompt),
    );
    if (bracketChoice === CANCEL) return discard();
    if (bracketChoice === "continue") qtyConfirmed = true;
    // else loop back to ask quantity again
  }

  const qty = draft.qty!;

  // ---- S3 Size split ----
  if (!draft.sizeSplit) {
    await ctx.reply(COPY.sizeSplitAsk(qty), { reply_markup: sizeSplitModeMenu() });
    const splitMode = await waitForStep<"even" | "standard" | "own">(
      conversation,
      (c) => {
        if (isCancelCallback(c)) return CANCEL;
        const data = c.callbackQuery?.data;
        if (data === "split:even") return "even";
        if (data === "split:standard") return "standard";
        if (data === "split:own") return "own";
        return undefined;
      },
      (c) => c.reply(COPY.genericReprompt),
    );
    if (splitMode === CANCEL) return discard();

    if (splitMode === "even") {
      draft.sizeSplit = resolveEvenSplit(qty);
    } else if (splitMode === "standard") {
      draft.sizeSplit = resolveStandardMix(qty);
    } else {
      const own = await collectOwnSizeSplit(conversation, (text, extra) => ctx.reply(text, extra), qty);
      if (own === CANCEL) return discard();
      draft.sizeSplit = own;
    }
    await persist();
  }

  // ---- S4 Print method ----
  if (!draft.printMethod) {
    await ctx.reply(COPY.printAsk, { reply_markup: printMethodMenu() });
    const printResult = await waitForStep<PrintMethod>(
      conversation,
      (c) => {
        if (isCancelCallback(c)) return CANCEL;
        const data = c.callbackQuery?.data;
        if (!data?.startsWith("print:")) return undefined;
        return data.slice("print:".length) as PrintMethod;
      },
      (c) => c.reply(COPY.genericReprompt),
    );
    if (printResult === CANCEL) return discard();
    draft.printMethod = printResult;
    await persist();

    const method = getPrintMethod(printResult);
    await ctx.reply(COPY.printEcho(method.label, method.range[0], method.range[1], method.hint));
  }

  // ---- S5 City ----
  if (!draft.city) {
    await ctx.reply(COPY.cityAsk, { reply_markup: cancelOnlyMenu() });
    const city = await waitForStep<string>(
      conversation,
      (c) => {
        if (isCancelCallback(c)) return CANCEL;
        const text = c.message?.text?.trim();
        if (!text) return undefined;
        return sanitizeCity(text);
      },
      (c) => c.reply(COPY.genericReprompt),
    );
    if (city === CANCEL) return abandon();
    draft.city = city;
    await persist();
  }

  // ---- S6 Name ----
  if (!draft.name) {
    await ctx.reply(COPY.nameAsk, { reply_markup: cancelOnlyMenu() });
    const name = await waitForStep<string>(
      conversation,
      (c) => {
        if (isCancelCallback(c)) return CANCEL;
        const text = c.message?.text?.trim();
        if (!text) return undefined;
        return sanitizeName(text);
      },
      (c) => c.reply(COPY.genericReprompt),
    );
    if (name === CANCEL) return abandon();
    draft.name = name;
    await persist();
  }

  // ---- S7 Phone ----
  if (!draft.phone) {
    await ctx.reply(COPY.phoneAsk, { reply_markup: cancelOnlyMenu() });
    let attempts = 0;
    let phone: string | typeof CANCEL | undefined;
    while (phone === undefined) {
      const raw = await waitForStep<string>(
        conversation,
        (c) => {
          if (isCancelCallback(c)) return CANCEL;
          const text = c.message?.text?.trim();
          if (!text) return undefined;
          return text;
        },
        (c) => c.reply(COPY.genericReprompt),
      );
      if (raw === CANCEL) return abandon();
      const normalized = normalizeIndianPhone(raw);
      if (normalized) {
        phone = normalized;
      } else {
        attempts += 1;
        if (attempts >= 2) {
          await ctx.reply(COPY.phoneInvalid, { reply_markup: cancelOnlyMenu() });
          const cancelChoice = await waitForStep<"cancel">(
            conversation,
            (c) => (isCancelCallback(c) ? "cancel" : undefined),
            (c) => c.reply(COPY.phoneInvalid, { reply_markup: cancelOnlyMenu() }),
          );
          if (cancelChoice === "cancel") return abandon();
        } else {
          await ctx.reply(COPY.phoneInvalid, { reply_markup: cancelOnlyMenu() });
        }
      }
    }
    draft.phone = phone;
    await persist();
  }

  // ---- S8 Timeline ----
  if (!draft.timeline) {
    await ctx.reply(COPY.timelineAsk, { reply_markup: timelineMenu() });
    const timelineResult = await waitForStep<Timeline>(
      conversation,
      (c) => {
        if (isCancelCallback(c)) return CANCEL;
        const data = c.callbackQuery?.data;
        if (data === "timeline:urgent") return "urgent";
        if (data === "timeline:standard") return "standard";
        if (data === "timeline:flexible") return "flexible";
        return undefined;
      },
      (c) => c.reply(COPY.genericReprompt),
    );
    if (timelineResult === CANCEL) return abandon();
    draft.timeline = timelineResult;
    draft.timelineUrgent = timelineResult === "urgent";
    await persist();
  }

  // ---- S9 Logo upload — multi-logo loop (per client Logo Placement Flow spec) ----
  // Each iteration: pick a placement (or skip entirely on the first pass),
  // then upload the logo image for that placement, then ask whether to add
  // another logo at a different position. Repeats until the user picks
  // "No more" or has skipped.
  if (draft.logoReceived === undefined) {
    draft.logos = draft.logos ?? [];
    let addingMore = true;

    while (addingMore) {
      await ctx.reply(COPY.placementAsk, { reply_markup: logoPlacementMenu() });
      const placementResult = await waitForStep<LogoPlacement | "skip">(
        conversation,
        (c) => {
          if (isCancelCallback(c)) return CANCEL;
          const data = c.callbackQuery?.data;
          if (data === "logo:skip") return "skip";
          if (!data?.startsWith("placement:")) return undefined;
          return data.slice("placement:".length) as LogoPlacement;
        },
        (c) => c.reply(COPY.genericReprompt),
      );
      if (placementResult === CANCEL) return abandon();

      if (placementResult === "skip") {
        addingMore = false;
        break;
      }

      const placementEntry = LOGO_PLACEMENTS.find((p) => p.id === placementResult)!;
      await ctx.reply(COPY.placementEcho(placementEntry.label));

      const logoUploadResult = await waitForStep<{ fileId: string }>(
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
        (c) => c.reply(COPY.logoUploadPrompt),
      );
      if (logoUploadResult === CANCEL) return abandon();

      draft.logos!.push({ fileId: logoUploadResult.fileId, placement: placementResult });
      await persist();

      await ctx.reply(COPY.addAnotherLogoAsk(draft.logos!.length), { reply_markup: addAnotherLogoMenu() });
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
    }

    draft.logoReceived = (draft.logos?.length ?? 0) > 0;
    await persist();
  }

  // ---- Pricing + order object (order ID is created HERE, right after
  // logo upload, so the mockup step below can tag all assets/history to a
  // real order id BEFORE the payment stage) ----
  const garment = computeGarmentTotal(tier, productId, qty);
  const printEstimate = computePrintEstimate(draft.printMethod!, qty);
  const grandEstimate = computeGrandEstimate(garment.total, printEstimate);
  const advanceDue = computeAdvanceDue(garment.total);

  if (!draft.orderId) {
    draft.orderId = await conversation.external(() => nextOrderId());
    await persist();
  }

  const env = await conversation.external(() => getEnv());

  const order: OrderData = {
    orderId: draft.orderId!,
    status: "Pending Payment",
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

  // ---- Mockup step (AFTER logo upload, BEFORE payment) ----
  // Offer a preview mockup the moment we have artwork + a real order id.
  // The mockup is generated (deterministic proof) before the customer
  // pays their garment advance; all assets/history are tagged to
  // order.orderId. Free for the first 3/month; #4+ goes through the
  // ₹20 proof + admin-approval path (the customer is prompted separately).
  if (order.logoReceived && order.logos.length > 0) {
    await ctx.reply(COPY.mockupOfferAsk, { reply_markup: generateMockupMenu(), parse_mode: "Markdown" });
    const mockupChoice = await waitForStep<"generate" | "skip">(
      conversation,
      (c) => {
        if (isCancelCallback(c)) return CANCEL;
        const data = c.callbackQuery?.data;
        if (data === "mockup:generate") return "generate";
        if (data === "mockup:skip") return "skip";
        return undefined;
      },
      (c) => c.reply(COPY.genericReprompt),
    );
    if (mockupChoice === CANCEL) return abandon();
    if (mockupChoice === "generate") {
      await ctx.reply(COPY.mockupGeneratingNote);
      // Persist the order snapshot so the mockup workflow can recover full
      // order data by id, then DISPATCH generation to the standalone
      // /api/mockup-delivery function (fire-and-forget). Generation is far
      // too slow for the webhook's budget, so it must never run here. All
      // outcomes — delivered, quota-exceeded (customer is asked for the
      // ₹20 payment), failures — are handled and messaged by that function
      // (see api/mockup-delivery.ts). Never reintroduce an inline
      // startMockupGeneration() call here.
      await conversation.external(async () => {
        await saveOrderSnapshot(order).catch(() => {});
        await triggerMockupDelivery(order.orderId);
      });
    }
  }

  // ---- S10 Quote card ----
  await ctx.reply(renderQuoteCard(order), {
    reply_markup: quoteCardMenu(advanceDue, showsCallMe(qty)),
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
      if (order.catalogSelection) await appendCatalogSelectionRow(order.orderId, order.catalogSelection);
      await notifyAdminsText(
        `📞 High-value callback requested: ${order.orderId} · ${order.name} · ${order.phone} · qty ${order.qty}`,
      );
      await clearDraft(chatId);
    });
    return;
  }

  // ---- S11 Payment loop ----
  const qrBuffer = await conversation.external(() =>
    generateUpiQrPng(env.MERCHANT_VPA, advanceDue, order.orderId),
  );

  await ctx.replyWithPhoto(new InputFile(qrBuffer, `${order.orderId}-qr.png`), {
    caption: COPY.paymentIntro(`₹${advanceDue.toLocaleString("en-IN")}`),
    reply_markup: paymentScreenMenu(),
    parse_mode: "Markdown",
  });
  await ctx.replyWithPhoto(env.STATIC_QR_URL, {
    caption: "Static brand QR (fallback for older UPI apps)",
  });

  const paymentOutcome = (await waitForStep<
    { type: "screenshot"; fileId: string } | { type: "cancel" }
  >(
    conversation,
    (c) => {
      if (isCancelCallback(c)) return { type: "cancel" };
      const photo = c.message?.photo;
      if (photo && photo.length > 0) {
        return { type: "screenshot", fileId: photo[photo.length - 1].file_id };
      }
      const doc = c.message?.document;
      if (doc) return { type: "screenshot", fileId: doc.file_id };
      return undefined;
    },
    (c) => c.reply(COPY.genericReprompt),
  )) as { type: "screenshot"; fileId: string } | { type: "cancel" };

  if (paymentOutcome.type === "cancel") {
    await conversation.external(async () => {
      await safeAppendOrderRow({ ...order, status: "Lead — No Payment" }).catch(() => {});
      if (order.catalogSelection) await appendCatalogSelectionRow(order.orderId, order.catalogSelection);
      await notifyAdminsText(`⚠️ Payment stalled: ${order.orderId} · ${order.name} · ${order.phone}`);
      await clearDraft(chatId);
    });
    await ctx.reply(COPY.abandonedGoodbye);
    return;
  }

  await ctx.reply(COPY.screenshotAck);

  const screenshotFileId = paymentOutcome.fileId;

  // Money-critical path: sheet write failure must not silently drop the
  // order. safeAppendOrderRow escalates full order text to admins before
  // rethrowing; the customer sees a generic apology instead of false success.
  const sheetWriteFailed = await conversation.external(async () => {
    try {
      await safeAppendOrderRow(order);
      if (order.catalogSelection) await appendCatalogSelectionRow(order.orderId, order.catalogSelection);
      return false;
    } catch {
      return true;
    } finally {
      await clearDraft(chatId);
    }
  });

  await conversation.external(async () => {
    await notifyAdmins(order, screenshotFileId);
  });

  if (sheetWriteFailed) {
    await ctx.reply(
      "Sorry, we hit a hiccup saving your order details — our team has already been notified and will follow up shortly. Your payment screenshot has been received. 🙏",
    );
  }

  async function discard() {
    await conversation.external(() => clearDraft(chatId));
  }

  async function abandon() {
    // PRD §5.3: Cancel after qty entered -> Lead — Abandoned (no admin ping).
    await conversation.external(async () => {
      const partialOrder: OrderData = {
        orderId: draft.orderId ?? `PENDING-${chatId}`,
        status: "Lead — Abandoned",
        tier: draft.tier!,
        productId: draft.productId!,
        catalogSelection: draft.catalogSelection,
        qty: draft.qty!,
        sizeSplit: (draft.sizeSplit as OrderData["sizeSplit"]) ?? {
          S: 0,
          M: 0,
          L: 0,
          XL: 0,
          XXL: 0,
          "3XL": 0,
        },
        printMethod: draft.printMethod ?? "not_sure",
        city: draft.city ?? "",
        name: draft.name ?? "",
        phone: draft.phone ?? "",
        timeline: draft.timeline ?? "flexible",
        timelineUrgent: draft.timelineUrgent ?? false,
        logoReceived: draft.logoReceived ?? false,
        logos: draft.logos ?? [],
        garmentRate: 0,
        garmentTotal: 0,
        printEstLow: 0,
        printEstHigh: 0,
        grandEstLow: 0,
        grandEstHigh: 0,
        advanceDue: 0,
        customerChatId: `tg:${chatId}`,
        channel: "telegram",
      };
      await safeAppendOrderRow(partialOrder).catch(() => {});
      if (partialOrder.catalogSelection) {
        await appendCatalogSelectionRow(partialOrder.orderId, partialOrder.catalogSelection);
      }
      await clearDraft(chatId);
    });
    await ctx.reply(COPY.abandonedGoodbye);
  }
}
