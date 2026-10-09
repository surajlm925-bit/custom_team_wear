import { COPY } from "./copy.js";
import { sendMenu } from "./uiMapper.js";
import { sendMessage } from "../whatsapp/metaClient.js";
import { loadDraft, saveDraft, clearDraft } from "../session/draftStore.js";
import { OrderDraft } from "./draft.js";
import { normalizeIndianPhone, sanitizeCity, sanitizeName } from "../shared/sanitize.js";
import {
  meetsMoq,
  resolveEvenSplit,
} from "../pricing/index.js";

// Basic WhatsApp Context
export interface WhatsAppContext {
  chatId: string;
  message: any;
  input: string; // The button payload, list payload, or text body
}

export async function handleWhatsAppMessage(chatId: string, message: any) {
  console.log(`[orderFlow] MESSAGE OBJECT:`, JSON.stringify(message));
  console.log(`[orderFlow] message.text is:`, message.text);
  let input = message.text?.body || message.interactive?.button_reply?.id || message.interactive?.list_reply?.id;
  const isImage = !!message.image;
  if (isImage) {
    input = message.image.id;
  }

  if (!input && !isImage) {
    console.log(`[orderFlow] Empty input and not image, returning early.`);
    return;
  }

  console.log(`[orderFlow] Parsed input: "${input}"`);
  const ctx: WhatsAppContext = { chatId, message, input: input.trim() };
  let draft = (await loadDraft(chatId)) || {};

  // Support global cancel/reset
  if (ctx.input.toLowerCase() === "cancel" || ctx.input === "back_to_start") {
    await clearDraft(chatId);
    await sendMessage(chatId, COPY.discardGoodbye);
    return;
  }

  // Determine current step based on missing draft fields
  const step = determineStep(draft);

  try {
    console.log(`[orderFlow] calling processStep for step: ${step}`);
    await processStep(ctx, draft, step);
    console.log(`[orderFlow] processStep completed`);
  } catch (error) {
    console.error("Error in processStep:", error);
    await sendMessage(chatId, "An error occurred. Please try again.");
  }
}

function determineStep(draft: OrderDraft): string {
  if (!draft.orderType) return "orderType";
  if (!draft.garmentSilhouette) return "garmentSilhouette";
  
  if (draft.orderType === "sample") {
    if (!draft.fabric) return "sampleFabric";
  } else {
    if (!draft.qty) return "qty";
  }

  if (!draft.city) return "city";
  if (!draft.name) return "name";
  if (!draft.phone) return "phone";
  if (!draft.timeline) return "timeline";

  if (draft.orderType !== "sample") {
    if (!draft.tier) return "tier";
    // Catalog selection simplifications for whatsapp
    if (!draft.fabric) return "catalogFabric";
    if (!draft.qualityOptionId) return "catalogQuality";
    if (!draft.colorName) return "catalogColor";
    if (!draft.printMethod) return "printMethod";
    if (draft.logoReceived === undefined) {
      if (!draft.logos || draft.logos.length === 0) {
        return "logoPlacement";
      }
      const lastLogo = draft.logos[draft.logos.length - 1];
      if (!lastLogo.fileId) {
        return "logoUpload";
      }
      return "logoMore";
    }
  }

  if (!draft.mockupDecision && draft.logoReceived && draft.logos && draft.logos.length > 0) return "mockupDecision";
  
  if (!draft.paymentScreenshotId) return "payment";

  return "completed";
}

async function processStep(ctx: WhatsAppContext, draft: OrderDraft, step: string) {
  const { chatId, input } = ctx;

  switch (step) {
    case "orderType":
      if (input === "order:bulk" || input === "order:sample") {
        draft.orderType = input === "order:bulk" ? "bulk" : "sample";
        await saveDraft(chatId, draft);
        await promptNext(chatId, draft);
      } else {
        await promptNext(chatId, draft, true); // initial prompt
      }
      break;

    case "garmentSilhouette":
      if (input === "garment:round_neck" || input === "garment:collar") {
        draft.garmentSilhouette = input === "garment:round_neck" ? "round_neck" : "collar";
        await saveDraft(chatId, draft);
        await promptNext(chatId, draft);
      } else {
        await promptNext(chatId, draft, true);
      }
      break;

    case "sampleFabric":
      if (input === "fabric:cotton" || input === "fabric:polyester") {
        draft.fabric = input === "fabric:cotton" ? "cotton" : "polyester";
        draft.qty = 3;
        draft.sizeSplit = resolveEvenSplit(3);
        draft.tier = "standard";
        draft.productId = draft.garmentSilhouette === "collar"
          ? (draft.fabric === "cotton" ? "cotton_polo" : "dry_fit_polo")
          : (draft.fabric === "cotton" ? "cotton_round_neck" : "dry_fit_round_neck");
        await saveDraft(chatId, draft);
        await promptNext(chatId, draft);
      } else {
         await promptNext(chatId, draft, true);
      }
      break;

    case "qty":
      if (!isNaN(Number(input)) && Number(input) > 0) {
        const qty = Number(input);
        if (!meetsMoq(qty)) {
          await sendMessage(chatId, COPY.rejection);
          await clearDraft(chatId);
          return;
        }
        draft.qty = qty;
        draft.sizeSplit = resolveEvenSplit(qty);
        await saveDraft(chatId, draft);
        await promptNext(chatId, draft);
      } else {
        await promptNext(chatId, draft, true);
      }
      break;

    case "city":
      if (input && input.length > 2) {
        draft.city = sanitizeCity(input);
        await saveDraft(chatId, draft);
        await promptNext(chatId, draft);
      } else {
        await promptNext(chatId, draft, true);
      }
      break;

    case "name":
      if (input && input.length > 2) {
        draft.name = sanitizeName(input);
        await saveDraft(chatId, draft);
        await promptNext(chatId, draft);
      } else {
        await promptNext(chatId, draft, true);
      }
      break;

    case "phone":
      const phone = normalizeIndianPhone(input);
      if (phone) {
        draft.phone = phone;
        await saveDraft(chatId, draft);
        await promptNext(chatId, draft);
      } else {
        await sendMessage(chatId, COPY.phoneInvalid);
        // promptNext(chatId, draft, true);
      }
      break;

    case "timeline":
      if (["timeline:urgent", "timeline:standard", "timeline:flexible"].includes(input)) {
        draft.timeline = input.replace("timeline:", "") as any;
        draft.timelineUrgent = draft.timeline === "urgent";
        await saveDraft(chatId, draft);
        await promptNext(chatId, draft);
      } else {
        await promptNext(chatId, draft, true);
      }
      break;

    case "tier":
      if (["tier:basic", "tier:standard", "tier:premium"].includes(input)) {
        draft.tier = input.replace("tier:", "") as any;
        await saveDraft(chatId, draft);
        await promptNext(chatId, draft);
      } else {
        await promptNext(chatId, draft, true);
      }
      break;

    case "catalogFabric":
      if (["fabric:cotton", "fabric:polyester"].includes(input)) {
        draft.fabric = input.replace("fabric:", "") as any;
        await saveDraft(chatId, draft);
        await promptNext(chatId, draft);
      } else {
        await promptNext(chatId, draft, true);
      }
      break;

    case "catalogQuality":
      // Auto-skip quality since we use a simplified flow
      draft.qualityOptionId = "standard";
      await saveDraft(chatId, draft);
      await promptNext(chatId, draft);
      break;

    case "catalogColor":
      if (["color:black", "color:grey", "color:navy", "color:royal", "color:white"].includes(input)) {
        const colorMap: Record<string, string> = {
          "color:black": "Black",
          "color:grey": "Charcoal Grey",
          "color:navy": "Navy Blue",
          "color:royal": "Royal Blue",
          "color:white": "White"
        };
        draft.colorName = colorMap[input];
        await saveDraft(chatId, draft);
        await promptNext(chatId, draft);
      } else {
        await promptNext(chatId, draft, true);
      }
      break;

    case "printMethod":
      if (["branding:print", "branding:embroidery"].includes(input)) {
        draft.printMethod = input === "branding:print" ? "screen_print" : "embroidery";
        await saveDraft(chatId, draft);
        await promptNext(chatId, draft);
      } else {
        await promptNext(chatId, draft, true);
      }
      break;

    case "logoPlacement":
      if (input === "logo:skip") {
        draft.logoReceived = false;
        draft.logos = [];
        await saveDraft(chatId, draft);
        await promptNext(chatId, draft);
      } else if (input.startsWith("placement:")) {
        const placement = input.replace("placement:", "");
        // We temporarily store the selected placement, waiting for upload
        // We will store it in catalogGroupId just as a temporary hack, or just save it in a transient state.
        // Actually, draft.logos doesn't have the image yet. We can push an incomplete logo object.
        draft.logos = draft.logos || [];
        draft.logos.push({ placement: placement as any, fileId: "" });
        await saveDraft(chatId, draft);
        await promptNext(chatId, draft); // This will map to "logoUpload"
      } else {
        await promptNext(chatId, draft, true);
      }
      break;

    case "logoUpload":
      if (ctx.message.image) {
        const lastLogo = draft.logos![draft.logos!.length - 1];
        lastLogo.fileId = input; // image id
        draft.logoReceived = true;
        await saveDraft(chatId, draft);
        // After upload, prompt for more logos
        // We use a dummy step for this
        await promptNext(chatId, draft); // Maps to "logoMore"
      } else {
        await sendMessage(chatId, COPY.logoUploadPrompt);
      }
      break;
      
    case "logoMore":
      if (input === "logo:more") {
        // user wants more logos, remove the "logoReceived" flag so determineStep goes back to logoPlacement
        draft.logoReceived = undefined;
        await saveDraft(chatId, draft);
        await promptNext(chatId, draft);
      } else if (input === "logo:done") {
        // user is done
        await saveDraft(chatId, draft);
        await promptNext(chatId, draft);
      } else {
        await promptNext(chatId, draft, true);
      }
      break;

    case "mockupDecision":
      if (["mockup:generate", "mockup:skip"].includes(input)) {
        draft.mockupDecision = input.replace("mockup:", "") as any;
        await saveDraft(chatId, draft);
        await promptNext(chatId, draft);
      } else {
        await promptNext(chatId, draft, true);
      }
      break;

    case "payment":
      if (ctx.message.image) {
        draft.paymentScreenshotId = input; // image id
        await saveDraft(chatId, draft);
        await completeOrder(chatId, draft);
      } else if (input === "callme") {
        await sendMessage(chatId, COPY.callMeAck);
        await clearDraft(chatId);
      } else {
        await promptNext(chatId, draft, true);
      }
      break;

    default:
      await sendMessage(chatId, "Flow complete.");
      break;
  }
}

async function promptNext(chatId: string, draft: OrderDraft, isReprompt = false) {
  const step = determineStep(draft);
  if (isReprompt) {
     await sendMessage(chatId, COPY.genericReprompt);
  }

  switch (step) {
    case "orderType":
      await sendMenu(chatId, COPY.greetingAsk, [
        { id: "order:bulk", title: "Bulk Order (50+)" },
        { id: "order:sample", title: "Order Sample Kit" }
      ]);
      break;
    case "garmentSilhouette":
      await sendMenu(chatId, COPY.garmentSilhouetteAsk, [
        { id: "garment:round_neck", title: "Round Neck" },
        { id: "garment:collar", title: "Collar / Polo" }
      ]);
      break;
    case "sampleFabric":
      await sendMenu(chatId, COPY.sampleKitFabricAsk, [
        { id: "fabric:cotton", title: "100% Cotton" },
        { id: "fabric:polyester", title: "Dry Fit" }
      ]);
      break;
    case "qty":
      await sendMessage(chatId, COPY.qtyAsk);
      break;
    case "city":
      await sendMessage(chatId, COPY.cityAsk);
      break;
    case "name":
      await sendMessage(chatId, COPY.nameAsk);
      break;
    case "phone":
      await sendMessage(chatId, COPY.phoneAsk);
      break;
    case "timeline":
      await sendMenu(chatId, COPY.timelineAsk, [
        { id: "timeline:urgent", title: "Urgent (Need soon)" },
        { id: "timeline:standard", title: "Standard (3-4 weeks)" },
        { id: "timeline:flexible", title: "Flexible" }
      ]);
      break;
    case "tier":
      await sendMenu(chatId, COPY.welcome, [
        { id: "tier:basic", title: "Basic (from ₹169)" },
        { id: "tier:standard", title: "Standard (from ₹219)" },
        { id: "tier:premium", title: "Premium (from ₹499)" }
      ]);
      break;
    case "catalogFabric":
      await sendMenu(chatId, COPY.fabricAsk, [
        { id: "fabric:cotton", title: "100% Cotton" },
        { id: "fabric:polyester", title: "Polyester DryFit" }
      ]);
      break;
    case "catalogQuality":
      // Auto-skip quality since we use a simplified flow
      draft.qualityOptionId = "standard";
      await saveDraft(chatId, draft);
      await promptNext(chatId, draft);
      break;
    case "catalogColor":
      await sendMenu(chatId, "Now choose your garment colour:", [
        { id: "color:black", title: "Black" },
        { id: "color:grey", title: "Charcoal Grey" },
        { id: "color:navy", title: "Navy Blue" },
        { id: "color:royal", title: "Royal Blue" },
        { id: "color:white", title: "White" }
      ]);
      break;
    case "printMethod":
      await sendMenu(chatId, COPY.brandingTypeAsk, [
        { id: "branding:print", title: "Print (Screen/DTF)" },
        { id: "branding:embroidery", title: "Embroidery" }
      ]);
      break;
    case "logoPlacement":
      await sendMenu(chatId, COPY.placementAsk, [
        { id: "placement:left_chest", title: "Left Chest" },
        { id: "placement:centre_front", title: "Centre Front" },
        { id: "placement:upper_back", title: "Upper Back" },
        { id: "placement:left_sleeve", title: "Left Sleeve" },
        { id: "placement:right_sleeve", title: "Right Sleeve" },
        { id: "logo:skip", title: "Skip - no artwork" }
      ], "View Placements");
      break;
    case "logoUpload":
      await sendMessage(chatId, COPY.logoUploadPrompt);
      break;
    case "logoMore":
      await sendMenu(chatId, COPY.addAnotherLogoAsk(draft.logos!.length), [
        { id: "logo:more", title: "Add another logo" },
        { id: "logo:done", title: "No more, continue" }
      ]);
      break;
    case "mockupDecision":
      await sendMenu(chatId, COPY.mockupOfferAsk, [
        { id: "mockup:generate", title: "Generate my mockup" },
        { id: "mockup:skip", title: "Skip - go to quote" }
      ]);
      break;
    case "payment":
      await sendMessage(chatId, "Thank you! Please send a screenshot of your payment.");
      // We would normally generate QR code here
      break;
  }
}

async function completeOrder(chatId: string, _draft: OrderDraft) {
  await sendMessage(chatId, COPY.screenshotAck);
  // Normal assembly logic here
  await clearDraft(chatId);
}
