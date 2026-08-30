/**
 * Copy templates — PRD Appendix A (authoritative wording).
 * Owner-editable before launch; kept in one place for easy change control.
 */

export const COPY = {
  welcome:
    "👋 Welcome to **Custom Teamwear** — bulk custom apparel for corporates, events, colleges & sports teams.\n" +
    "Minimum order: **50 pieces**.\n\n" +
    "Pick a quality tier to see products:",

  resumePrompt: "You have an unfinished quote — resume it?",

  rejection:
    "😅 Whoa there — that's barely enough for one cricket team *and* its reserves!\n\n" +
    "We start at **50 pieces** because below that our machines go on strike. 🤖\n\n" +
    "Hit 50+ anytime — you know where to find me. Just send /start!",

  qtyAsk: "How many pieces do you need? *(Minimum 50)*",
  qtyInvalid: "Please send a valid number of pieces (1–100,000).",

  sizeSplitAsk: (qty: number) => `How should we split your **${qty} pcs** across sizes?`,
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
    `Here's your secure UPI link for **exactly ${advanceDue}** — amount pre-filled, Order ID attached automatically.\n\n` +
    "Scan & pay with any UPI app 👇\n" +
    "✅ Paid? Send us a **screenshot** here.\n" +
    "⏱ Not now? Reply /start anytime — your quote details are safe.",

  screenshotAck: "Thanks! Verifying now — you'll get confirmation shortly. 🔍",

  abandonedGoodbye: "No worries — cancelled. Send /start anytime to begin a new quote.",
  discardGoodbye: "No worries — cancelled. Send /start anytime.",

  genericReprompt: "Sorry, I didn't get that. Please use one of the buttons above.",
  floodCooldown: "You're sending messages a bit fast — please slow down and try again in a moment. 🙏",

  alreadyProcessed: "This order was already processed.",
  adminUnauthorized: "You're not authorized to perform this action.",
  orderNotFound: "Order not found (it may have expired from cache). Check the sheet directly.",
} as const;
