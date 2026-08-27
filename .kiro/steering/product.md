# Product: Custom Teamwear Bulk Order Bot

A click-first Telegram bot that qualifies and collects bulk apparel orders (MOQ 50 pcs) for **Custom Teamwear**. It guides customers through: tier → product → quantity → size split → print method → contact details → itemized quote → garment-advance payment via dynamic UPI QR.

## Core flow
1. Customer picks a quality tier (Basic / Standard / Premium Branded) and product.
2. Quantity gate: <50 pcs → polite rejection, discarded with zero logging. ≥50 pcs proceeds.
3. Size split (S–3XL), print method (Screen Print / DTF / Sublimation / Embroidery / Not sure), city, name, phone, delivery timeline, optional logo upload.
4. Itemized quote card (garment = EXACT, print = ESTIMATE, GST = TBD) with garment-advance payment via dynamic `upi://pay` QR.
5. Screenshot of payment → admin Telegram chat verifies against bank/UPI statement → ✅ Confirm or 🚩 Issue.
6. Confirmed orders auto-DM the customer. All outcomes (orders and leads) log to a single Google Sheets "Orders" tab.

## Design principles (non-negotiable)
- **Click > type** — every decision is a button press; typed input only where menus can't work (quantity, size counts, city, name, phone, logo).
- **Never invent a price** — every rupee shown traces to the price book in the PRD (§6). No LLM/AI is used anywhere; the system is fully deterministic.
- **Escalation never fails silently** — every money event reaches the admin chat; sheet-write failures escalate as full text to the admin chat.
- **One channel-agnostic core** — a fixed adapter interface (`verifyRequest · sendMessage · sendMenu · sendImage · fetchMedia · onUpdate`) means a future WhatsApp migration is a new adapter + new secrets, nothing else changes.

## Roles
- **Customer**: bulk buyer (corporate/event/college/sports), places orders ≥50 pcs or becomes a lead.
- **Admin**: verifies payments via Telegram chat, triggers order confirmation.
- **Agent**: handles artwork approval, GST invoicing, balance collection, delivery — outside the bot, via sheet + admin relay.

## Explicitly out of scope (v1)
Payment-gateway automation, artwork proofing, GST invoicing, balance/print-balance collection, delivery tracking, auto-chase/reminders, multi-language, WhatsApp adapter implementation, analytics dashboards, and **any AI/NLP features**.

## Source of truth
`docs/PRD-CTW-WhatsApp-Bot.md` is the approved v1.0 spec and is authoritative. `docs/Project-Plan-CTW-WhatsApp-Bot.md` describes an earlier/alternate architecture (WhatsApp Cloud API + Supabase + OpenAI) that has been superseded — do not build against it unless the user explicitly revives that direction.
