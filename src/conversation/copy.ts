/**
 * Copy templates — PRD Appendix A (authoritative wording).
 * Owner-editable before launch; kept in one place for easy change control.
 */

export const COPY = {
  welcome:
    "👋 Welcome to **Custom Teamwear** — bulk custom apparel for corporates, events, colleges & sports teams.\n" +
    "Minimum order: **50 pieces**.\n\n" +
    "Pick a quality tier to see products:",

  greetingAsk:
    "👋 Welcome to **Custom Teamwear** — premium custom apparel for corporates, teams, and events!\n\n" +
    "Are you planning a bulk order or would you like to order a trial sample first?",

  garmentSilhouetteAsk: "Choose your garment collar style:",

  fabricAsk: "Select fabric material:",

  brandingTypeAsk: "How would you like your branding done on the garment?",

  qtyAskSample: "How many trial sample pieces would you like? (1–5 pieces):",

  resumePrompt: "You have an unfinished quote — resume it?",

  rejection:
    "😅 Whoa there — that's barely enough for one cricket team *and* its reserves!\n\n" +
    "We start at **50 pieces** for bulk production. 🤖\n\n" +
    "Hit 50+ anytime or select Trial Sample (1–5 pcs) to see our quality! Just send /start.",

  qtyAsk: "How many pieces do you need? Type the number below (e.g. 50, 100, 250):",
  qtyInvalid: "Please send a valid number of pieces (1–100,000).",

  catalogProductAsk: "Select a garment & fabric type:",
  catalogQualityAsk: "Select a quality / fabric option:",
  catalogGroupAsk: (kind: "brand" | "category") => (kind === "brand" ? "Which brand?" : "Which category?"),
  catalogNoGroups: "Sorry, we don't have a catalog set up for this tier yet — our team will help you directly. Please use /start to try another tier, or wait for our callback.",
  catalogItemAsk: "Pick a style:",
  catalogNoItems: "No styles found in this category yet — going back.",
  catalogImageConfirmAsk: (label: string) => `Here's **${label}**. Is this the one?`,
  catalogImageMissing: (label: string) =>
    `**${label}** — photo isn't available right now, but here are the details above. Is this the one?`,
  catalogColorAsk: "Which colour?",
  catalogColorConfirmAsk: (label: string, color: string) =>
    `Here's **${label}** in **${color}**. Use this colour?`,
  catalogColorConfirmMissing: (label: string, color: string) =>
    `**${label}** — **${color}**. We couldn't load this colour's photo right now. Use this colour anyway?`,
  catalogSelectionEcho: (label: string, color?: string) =>
    color ? `✅ Selected: **${label}** — ${color}` : `✅ Selected: **${label}**`,
  /** Shown when a whole group (e.g. Reebok, Van Heusen) has no auto-orderable items, or an item has no usable colours — routes to a human. */
  catalogAssistedSelection:
    "🧑‍💼 This range needs a hand from our team — the catalogue here has options we prefer to confirm with you personally (exact style, colour & availability).\n\n" +
    "Please reach us and we'll set your order up for you. You can also send /start to pick from another range in the meantime.",

  sizeSplitAsk: (qty: number) =>
    `How should we split your **${qty} pcs** across sizes (S, M, L, XL, XXL, 3XL)?\n\n` +
    "• **Even split** — divides your quantity as evenly as possible across all 6 sizes.\n" +
    "• **Standard mix** — a typical team spread: S 10%, M 25%, L 30%, XL 20%, XXL 10%, 3XL 5%.\n" +
    "• **Enter my own** — you type the exact quantity for each size.",
  sizeSplitOwnPrompt: (sizeLabel: string) => `Enter the quantity for **${sizeLabel}** (0 is allowed):`,
  sizeSplitOwnInvalid: "Please send a whole number, 0 or greater.",
  sizeSplitMismatch: (entered: number, qty: number, remaining: number) =>
    `You've entered ${entered} of ${qty}. Which size takes the remaining ${remaining}?`,
  sizeSplitSurplus: (entered: number, qty: number, excess: number) =>
    `You've entered ${entered} of ${qty} — that's ${excess} too many. Which size should we reduce?`,

  printAsk: "How should your branding be applied? *(per-piece printing, added to garment price)*",
  printEcho: (label: string, low: number, high: number, hint: string) =>
    `Selected ${label} — ₹${low}–${high}/pc. ${hint}`,

  placementAsk:
    "Where should this logo go on the garment?\n\n" +
    "1️⃣ Left Chest — Professional company logo\n" +
    "2️⃣ Centre Front — Large logo / design\n" +
    "3️⃣ Upper Back — Company / event name\n" +
    "4️⃣ Left Sleeve — Secondary logo / partner logo\n" +
    "5️⃣ Right Sleeve — Secondary logo / partner logo\n\n" +
    "No artwork ready yet? Skip — our design team will help.",
  placementEcho: (label: string) => `📍 ${label} selected. Now upload the logo/design for this placement 📎`,
  logoUploadPrompt: "Please send the logo/design image for this placement.",
  addAnotherLogoAsk: (count: number) =>
    `Got it — ${count} logo${count === 1 ? "" : "s"} added. Want to add another logo at a different position?`,

  cityAsk: "Which city should we deliver to?",
  nameAsk: "Who should we address the order to? Please share your **name**.",
  phoneAsk: "Your **phone number** — used only for order updates & artwork approval.",
  phoneInvalid: "Hmm, that doesn't look like a valid Indian mobile number. Try again (10 digits)?",

  timelineAsk: "When do you need delivery?",

  callMeAck: "Got it! Our senior team will call you within a few hours about your large order. 📞",

  paymentIntro: (advanceDue: string) =>
    `Here's your secure UPI link for **exactly ${advanceDue}** — that's your **garment advance (about 50% of the garment value)**, amount pre-filled with your Order ID attached automatically.\n\n` +
    "Scan & pay with any UPI app 👇\n" +
    "✅ Paid? Send us a **screenshot** here.\n" +
    "⏱ Not now? Reply /start anytime — your quote details are safe.",

  screenshotAck: "Thanks! Verifying now — you'll get confirmation shortly. 🔍",

  abandonedGoodbye: "No worries — cancelled. Send /start anytime to begin a new quote.",
  discardGoodbye: "No worries — cancelled. Send /start anytime.",

  genericReprompt: "Sorry, I didn't get that. Please use one of the buttons above.",
  floodCooldown: "You're sending messages a bit fast — please slow down and try again in a moment. 🙏",
  busyReprompt: "⏳ Still working on your last message — one moment please.",

  mockupEtaNote:
    "\n\n🎨 We're generating a preview mockup of your logo on the garment — it'll land here in a minute or two.",

  /** Offered immediately after logo upload, before the quote/payment step. */
  mockupOfferAsk:
    "📎 Got your logo! Want to see a **preview mockup** of it on your exact selected garment now?\n\n" +
    "Your first **3 mockups each month are free**. (Extra previews after that are ₹20 each, verified by our team.)",

  mockupGeneratingNote: "🎨 Generating your preview on the exact garment you picked — one moment…",

  /** Sent with the deterministic proof so the customer knows it's the real print reference. */
  mockupProofCaption: (view: "front" | "back") =>
    `🎨 Print proof — your logo on the exact selected garment (${view === "front" ? "front" : "back"}). This is the true placement; nothing about the shirt or logo is altered.`,

  mockupUnavailable:
    "🎨 Heads up: we couldn't generate an automatic preview mockup for your exact selected garment this time. " +
    "No problem at all — our design team will prepare your artwork proof manually and share it with you before production. Your order is confirmed and moving ahead. 🙌",

  /** Paid mockup workflow — shown when the customer's free monthly quota is used up. */
  mockupPaidRequired: (priceInr: number, freePerMonth: number) =>
    `🎨 You've used all ${freePerMonth} free mockup previews for this month.\n\n` +
    `Extra previews are **₹${priceInr} each**. To get this one, please send **₹${priceInr}** to our UPI and reply here with the **payment screenshot** — our team will approve it and your mockup will follow shortly. 🙏`,

  mockupPaidProofAck:
    "Thanks! We've received your payment proof for the extra mockup — our team is verifying it now and your preview will follow once approved. 🔍",

  mockupPaidApprovedNote:
    "\n\n✅ Payment approved — generating your mockup now.",

  mockupPaidRejected:
    "😕 We couldn't verify the payment for your extra mockup. If you believe this is a mistake, please reply here and our team will help sort it out.",

  alreadyProcessed: "This order was already processed.",
  adminUnauthorized: "You're not authorized to perform this action.",
  orderNotFound: "Order not found (it may have expired from cache). Check the sheet directly.",
} as const;
