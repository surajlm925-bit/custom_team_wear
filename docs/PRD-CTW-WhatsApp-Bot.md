# PRD — Custom Teamwear Bulk Order Bot

**Version:** 1.0 · **Status:** Approved for build · **Channel:** Telegram (WhatsApp-portable) · **Owner:** Custom Teamwear

---

## 1. Overview

### 1.1 Purpose
A click-first Telegram bot that qualifies and collects bulk apparel orders (MOQ 50 pcs): guides the customer through tier → product → quantity → size split → print method → contact details → itemized transparent quote → garment-advance payment via dynamic UPI QR. All outcomes log to Google Sheets; payment verification routes through an admin Telegram chat; customer receives automatic confirmation upon admin approval. Sub-MOQ inquiries receive a humorous-polite rejection and are discarded entirely.

### 1.2 Design Principles
1. **Click > type** — every decision is a button press wherever possible; typed input exists only where menus cannot (see §5.5).
2. **Never invent a price** — every rupee displayed traces to the §6 price book. Unknown figures render as labeled estimates, never guesses.
3. **Escalation never fails silently** — every money event reaches the admin chat; sheet-write failures escalate with full data.
4. **One channel-agnostic core** — WhatsApp migration = new adapter file + new secrets. Nothing else changes.

---

## 2. Scope

### 2.1 In Scope (v1)
Single Telegram bot · 3-tier × 4-product priced catalog · MOQ gate · size-split collector · print-method selector with live ranges · itemized quoting · dynamic UPI QR advance collection · screenshot intake · admin verification loop with auto-confirmation · Google Sheets CRM (single tab) · leads for high-value callbacks and payment drop-offs.

### 2.2 Out of Scope (v1 Non-Goals)
- Payment-gateway automation (manual admin verification instead)
- Artwork proofing workflow / design collaboration
- GST invoicing (agent-prepared, outside bot)
- Balance/print-balance collection (agent-invoiced post-artwork)
- Delivery tracking, order-history lookup for customers
- Auto-chase / payment reminder timers
- Multi-language (English only)
- WhatsApp adapter implementation (architecture-ready only)
- Analytics dashboards
- AI/NLP features of any kind

### 2.3 Roadmap Placeholders (post-v1)
WhatsApp Cloud API adapter · balance-payment invoice links · automated payment reconciliation via gateway · reminder nudges · CRM views/filtering conventions.

---

## 3. Users & Roles

| Role | Description | Interacts via |
|---|---|---|
| **Customer** | Bulk buyer (corporate/event/college/sports). Places orders ≥50 pcs or becomes a lead. | Customer-facing bot chat |
| **Admin** | Business owner/manager. Verifies payments against bank/UPI statements; triggers confirmation. | Admin chat(s), `ADMIN_CHAT_IDS` |
| **Agent** | Human downstream. Receives leads/callbacks, handles artwork approval, GST invoice, balance collection, delivery coordination. | Sheet + admin chat relay (no bot UI) |

---

## 4. System Architecture

### 4.1 Diagram

```
Telegram ⇄ Webhook (Vercel function) ⇄ grammY runtime
                                        ├─ Channel Adapter ★ (sole channel-specific code)
                                        ├─ Conversation engine (@grammyjs/conversations + @grammyjs/menu)
                                        ├─ Pricing engine (pure functions over §6 config)
                                        ├─ Session store ──── Upstash Redis (HTTP; 24h TTL)
                                        ├─ QR generator ('qrcode' → upi://pay PNG)
                                        ├─ CRM writer (google-spreadsheet · service account)
                                        ├─ Rate limiter (@upstash/ratelimit · same Redis)
                                        └─ Admin notifier ─── Admin Telegram chat(s)
```
★ **Adapter interface (fixed):** `verifyRequest · sendMessage · sendMenu · sendImage · fetchMedia · onUpdate`

### 4.2 Deployment Model
- **Vercel serverless functions, webhook-only.** Long polling impossible on serverless; endpoint registered once with Telegram using `secret_token`; every invocation validated against `X-Telegram-Bot-Api-Secret-Token` (fail → 401, logged).
- Fast-ACK pattern: respond 200 immediately; process async-safe; dedupe on `update_id`.
- Route pre-wired to also answer Meta's GET verification handshake (future WhatsApp).

### 4.3 Third-Party Services & Running Costs

| Service | Purpose | Test-phase cost |
|---|---|---|
| Telegram Bot API | Messaging | Free |
| Vercel Hobby | Hosting/webhooks | ₹0 (⚠️ non-commercial ToS — see §13) |
| Upstash Redis (free tier) | Sessions, counters, dedupe, rate limits | Free |
| Google Sheets API | Persistent CRM | Free |
| OSS libraries (grammY, qrcode, google-spreadsheet) | Building blocks | Free |

**AI usage: zero.** Every screen is a hard-coded template; every figure is a lookup/computation. The system contains no LLM/NLP calls — behavior is fully deterministic. **Total monthly burn during testing: ₹0.**

### 4.4 Environment Isolation
Dev and prod are physically separate: dev bot token, dev spreadsheet, dev admin chat. Testing cannot reach real customers.

---

## 5. Conversation Experience

### 5.1 Flow Map (priced path — the only path)

```
S00 Tier Menu → S1 Product → S2 Qty Gate ─(<50)→ [reject & discard]
                                  │(≥50)
                                  ▼
                        S2c Bracket reveal/upsell
                                  ▼
                    S3 Size Split → S4 Print Method
                                  ▼
              S5 City → S6 Name → S7 Phone → S8 Timeline
                                  ▼
                     S9 Logo upload/skip
                                  ▼
                  S10 Quote Card ──(qty>300 adds)──> [📞 Call Me] → lead
                                  │ [Pay advance]
                                  ▼
                  S11 Dynamic QR → screenshot received
                                  ▼
              Row: Pending Payment → ADMIN CARD ─✅→ row: Confirmed → auto-DM customer
                                             └🚩→ manual follow-up
```

Any exit/stall/refusal after quantity entered (but before confirmed payment) → appropriate lead row + admin ping. Exit before quantity entered → silent discard.

### 5.2 Step Specification

| # | Step | Input | Validation / Rules |
|---|---|---|---|
| S00 | Welcome + tier menu | Buttons | 3 tiers + Cancel. `/start` anywhere restarts; offers Resume if <24h session exists |
| S1 | Product menu | Buttons | 4 products per tier, live rates shown; Back |
| S2a | Quantity ask | **Typed number** | Integer, sane bounds (e.g., 1–100,000). `<50` → S2b |
| S2b | Rejection | Terminal | Funny-polite copy (App. A). **Discarded entirely — zero logging anywhere** |
| S2c | Bracket reveal | Buttons | Shows applicable rate (`50+` or `100+`), unit-price save nudge at next bracket; Continue / Change |
| S3 | Size split | Buttons + optional typed | Even / Standard mix / Own. Own mode: six numeric prompts; **sum must equal qty exactly**; mismatch prompts deficit assignment with size quick-picks. Presets resolved server-side to sum exactly |
| S4 | Print method | Buttons | 4 methods with live ₹/pc ranges + "Not sure — advise me" (widest range). Selection echoes range + suitability hint |
| S5 | City | **Typed** | ≤40 chars, sanitized |
| S6 | Name | **Typed** | ≤60 chars, sanitized |
| S7 | Phone | **Typed** | Strip separators; accept `+91`/`0` prefixes; require 10 digits starting 6–9; one reprompt then Cancel offer |
| S8 | Timeline | Buttons | ⚡Urgent ≤7d sets `timeline_urgent` flag (no fee invented) · Standard 8–15d · Flexible 15+d |
| S9 | Logo | Image / Skip button | File captured; forwarded to admin with order card |
| S10 | Quote card | Buttons | Itemized EXACT/ESTIMATE/TBD render (§7). `[💳 Pay X]` always; `[📞 Call Me]` **iff qty > 300** |
| S11 | Payment | QR image + typed screenshot | Dynamic `upi://pay` QR + static fallback; request screenshot; ack message on receipt |

### 5.3 Global Controls (every screen)

| Trigger | Behavior |
|---|---|
| `/start` | Reset session → S00 (Resume/Fresh prompt if recent session exists) |
| `[❌ Cancel]` | If qty entered → lead row `Lead — Abandoned` (no admin ping); else silent discard |
| Unexpected reply / junk text | Current screen re-presented gently; never crashes forward |
| Flood (>~20 msg/min) | Polite cooldown message |

### 5.4 Copy Guidelines
Friendly-professional English; emoji-light; short lines; no jargon. All money statements follow §7 labeling. Sample copy fixed in Appendix A (owner-editable before launch, then change-controlled).

### 5.5 Input Inventory (click-first accounting)

**Button-only steps:** tier, product, bracket continue, split-mode, print method, timeline, logo skip, pay/call-me, cancel — plus all admin actions.
**Entered inputs (complete list):** ① quantity ② per-size counts *only* in Own-split mode ③ city ④ name ⑤ phone ⑥ logo upload (media).
Every conversational decision is otherwise a click.

---

## 6. Pricing Engine

### 6.1 Garment Price Book (per piece, ex-GST)

| Product | Basic 50+/100+ | Standard 50+/100+ | Branded 50+/100+ |
|---|---|---|---|
| Dry Fit Round Neck | 169 / 159 | 219 / 199 | *(Branded Dry Fit Tee)* 499 / 449 |
| Dry Fit Polo | 289 / 249 | 359 / 309 | *(Branded Polo Tee)* 709 / 629 |
| Cotton Round Neck | 259 / 239 | 319 / 289 | *(Branded Cotton Tee)* 599 / 529 |
| Cotton Polo | 389 / 359 | 469 / 429 | *(Branded Corporate Polo)* 869 / 789 |

Brands represented in Branded tier: Adidas, Allen Solly, Reebok, Peter England, Van Heusen (menu labels use product names; brand availability communicated by agent).

### 6.2 Print Add-Ons (per piece, tier-independent, ex-GST)

| Method | Range | Hint line |
|---|---|---|
| Screen Print | ₹25–45 | Most economical; best for bold logos on cotton |
| DTF Print | ₹35–70 | Vivid multi-colour, works on all fabrics |
| Sublimation | ₹30–60 | All-over prints; sportswear favourite |
| Embroidery | ₹50–120 | Premium; ideal for polos & corporate wear |
| Not sure (assist) | ₹25–120 | Agent recommends after artwork review |

### 6.3 Computation Rules
- Bracket: `50 ≤ qty ≤ 99` → 50+ column; `qty ≥ 100` → 100+ column. Only these brackets exist.
- Size S–3XL carries **no surcharge** (assumption pending owner confirmation — §14).
- All amounts integer rupees. Print totals rendered as low–high range spanning the method's band.
- **Invariant:** the pricing module is the single computational source; display strings may never contain a constant derived outside it.

---

## 7. Money & Payments

### 7.1 Transparency Framework
- Every displayed amount carries exactly one label: **EXACT** (garment line, advance due) · **ESTIMATE** (print range) · **TBD** (final invoice post-artwork) · GST flagged "+GST" everywhere totals appear.
- One shared renderer produces the customer quote card AND the admin card — disagreement between the two is structurally impossible.

### 7.2 Quote Card Spec (S10)
Itemized: garment line (qty × rate = EXACT) · print line (range, ESTIMATE, "finalized after you approve artwork") · estimated grand range (+GST) · **advance-due callout = garment value only** · reassurance line: printing balance + GST invoiced after artwork approval, before production; "No hidden charges."

### 7.3 Advance Model — "Option C" (Garment Advance)
- `advance_due = qty × applicable rate`. Rationale: garment value is computable exactly; print genuinely isn't until artwork review. Customer pays a precisely-labeled partial, never a guess dressed as a final number.

### 7.4 Dynamic QR
- Encoding: `upi://pay?pa=<MERCHANT_VPA>&am=<advance_due>&tn=<OrderID>` → rendered PNG via `qrcode` lib. Amount and order reference pre-filled.
- Static brand QR sent alongside as fallback (older UPI apps).

### 7.5 Verification Loop
- Screenshot receipt ≠ proof of payment. Trust anchor: **admin matches bank/UPI statement against the order card** (amount + payer reference + Order ID remark).
- Admin card includes forwarded screenshot + full order fields + `✅ Confirm` / `🚩 Issue`.
- ✅ → status `Confirmed`, customer auto-DM (template in App. A). Irreversible; duplicate presses answered "already processed", zero side effects.
- 🚩 → `Payment Issue`; customer contacted manually by agent.
- Multiple admins supported; first ✅ wins, others notified.
- Confirmation message fires **only** from authorized admin action — auto-fire is structurally impossible.

### 7.6 High-Value Escalation
- `📞 Call Me` visible strictly when `qty > 300` (301+ shows it; 300 does not).
- Press → acknowledgment DM → row `Lead — High-Value Callback` → admin ping → senior-team callback.

### 7.7 No-Hidden-Money Guarantee
Nothing bills automatically after the advance, ever. Balance flows exclusively through agent-prepared invoices the customer reviews.

---

## 8. Order Lifecycle

### 8.1 Status Enum (Sheet `Status` column)

| Status | Set when |
|---|---|
| `Pending Payment` | Screenshot received; admin card dispatched |
| `Confirmed` | Admin ✅ pressed |
| `Payment Issue` | Admin 🚩 pressed |
| `Lead — High-Value Callback` | Call Me pressed (qty>300) |
| `Lead — No Payment` | Refusal/stall at S11 |
| `Lead — Abandoned` | Cancel after qty entered (silent; no ping) |

Transitions are forward-only as listed; Redis session state machine rejects anything else.

### 8.2 Order ID
Format `CTW-YYMMDD-nn`. Daily counter via Redis `INCR` on `oid:YYMMDD` (race-safe). Assigned at quote-card time (S10).

### 8.3 Admin Card Contents
Forwarded screenshot · Order ID · tier/product/qty · full size split · print method · timeline (flagged if urgent) · city · itemized amounts + advance due · name/phone/customer chat-ID (`tg:` prefixed) · logo file.

### 8.4 Edge Cases
Double-webhook delivery → dedupe ⇒ exactly one row/card/DM. Double-✅ → benign no-op reply. Sheets outage → 3 retries → **admin chat receives complete order as text** (money events cannot vanish); customer sees generic apology. Redis flush → affected chats re-enter cleanly at S00.

---

## 9. Data Model

### 9.1 Redis Keys

| Key | Type/Purpose | TTL |
|---|---|---|
| `sess:<chat_id>` | Conversation state JSON (current step, collected fields, last menu msg id) | 24h |
| `oid:YYMMDD` | Daily order-ID counter | 48h |
| `upd:<update_id>` | SETNX dedupe marker | 24h |
| ratelimit buckets | Per-chat flood control | rolling |

### 9.2 Google Sheet Schema — single "Orders" tab, one row per interaction outcome

`Timestamp · Order ID · Status · Tier · Product · Qty · S · M · L · XL · XXL · 3XL · Print Method · City · Name · Phone · Timeline · Timeline Urgent Y/N · Logo Received Y/N · Logo File ID · Garment Rate/pc · Garment Total · Est Print Low · Est Print High · Est Grand Low · Est Grand High · Advance Due · Customer Chat ID · Channel · Admin Notes · Last Updated`

Leads reuse the identical schema with blanks — one filterable CRM table.

### 9.3 PII & Retention
Collected: name, phone, city only — minimum necessary. Screenshots live solely in the admin chat thread; not archived by the app. No PII in application logs (shared-infra visibility). DPDP-compliance-friendly posture by construction.

---

## 10. Non-Functional Requirements

### 10.1 Security
- Webhook secret enforced on 100% of requests; mismatch → 401 + log.
- Callback payloads opaque & short; authoritative state in Redis; transition machine rejects injected/out-of-order presses.
- All monetary values computed server-side; client contributes only validated integers (quantity, size counts).
- Admin-only actions gated by `chat_id ∈ ADMIN_CHAT_IDS`, checked server-side, no exceptions.
- Formula-injection sanitizer on every sheet-bound string: strip leading `= + - @`, control characters; caps name 60 / city 40 / phone 15 chars.
- Secrets via environment variables only (Vercel encrypted): `CHANNEL`, `TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET`, `ADMIN_CHAT_IDS`, `MERCHANT_VPA`, `STATIC_QR_URL`, `REDIS_REST_URL`, `REDIS_REST_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `SHEET_ID`.
- Google service account granted access to **exactly one** spreadsheet (least privilege).
- Per-chat rate limiting (~20 msg/min).
- Repo hygiene: lockfile committed; 2FA on GitHub/Vercel/Google; dependency updates on cadence.

### 10.2 Reliability
- Fail-fast ACK + idempotency throughout (§8.4).
- Retry-then-escalate on external write failures; the admin chat doubles as the guaranteed-delivery channel.
- Daily heartbeat cron → 👍 to admin chat; silence = investigate.
- Cold starts imperceptible; all dependencies HTTP-based (serverless-clean).

### 10.3 Portability Contract (WhatsApp-readiness)
- Fixed adapter interface (§4.1); selection via `CHANNEL` env var.
- Menus constrained to the WhatsApp interactive denominator (≤10 options, ≤3 action buttons/screen); formatting owned by adapters; identities channel-prefixed (`tg:` / `wa:`); Meta GET handshake pre-wired.
- Contract tests replay the full conversation suite against a mock channel; any future WhatsApp adapter must pass the same suite to merge. Baileys may serve as interim provider under the same interface.

### 10.4 Observability
Structured logs (no PII) · error alerting (Sentry free tier acceptable) · heartbeat · admin-visible failure escalation path.

---

## 11. Launch Dependencies (blockers checklist)

| # | Item | Owner |
|---|---|---|
| 1 | Merchant VPA (for dynamic QR) | Owner |
| 2 | Static brand QR image asset | Owner |
| 3 | BotFather bot token (prod + dev bots) | Owner |
| 4 | Admin chat ID(s) | Owner |
| 5 | Google service-account JSON + spreadsheet shared with its address | Owner |
| 6 | Final copy sign-off (Appendix A wording, incl. rejection lines) | Owner |
| 7 | XXL/3XL surcharge ruling (§14 Q1) | Owner |

---

## 12. Acceptance Criteria

| # | Test |
|---|---|
| AC1 | Happy path 60 pcs Basic → all math matches §6; admin card renders; ✅ → customer DM + row `Confirmed` |
| AC2 | Qty 49 → funny rejection; **zero rows written anywhere** |
| AC3 | Qty 301 shows Call Me; qty 300 does not |
| AC4 | QR encodes correct VPA + exact advance + Order ID; static fallback attached |
| AC5 | Duplicate webhook delivery → exactly one row, one admin card, one customer DM |
| AC6 | Forged POST sans secret → 401; non-admin chat pressing Confirm → ignored + logged |
| AC7 | Name `=HYPERLINK(...)` → stored inert; cell safe |
| AC8 | Second ✅ on same order → "already processed"; no second customer message |
| AC9 | Induced Sheets outage mid-order → admin still receives complete order text |
| AC10 | Heartbeat lands daily |
| AC11 | Size-split Own mode sum-mismatch → deficit assignment flow; presets always sum exactly to qty |
| AC12 | Boundary math: qty 99 uses 50+ rate; qty 100 uses 100+ rate; upsell nudge figures match §6 |
| AC13 | `/start` mid-flow offers Resume; Resume restores prior answers |
| AC14 | Flood trigger → cooldown message; normal users unaffected |

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| XXL/3XL surcharge unconfirmed | Under-quoting larger sizes if real surcharges exist | Blocked on owner answer; bot assumes none meanwhile |
| Vercel Hobby ToS = non-commercial | Compliance exposure at commercial go-live | Test freely now; move to Vercel Pro or Railway paid at launch |
| UPI screenshots forgeable | False payment claims | Human statement-match is the control; screenshots never treated as evidence |
| Screenshot-not-sent stallers | Unpaid "orders" clog pipeline | Stall → `Lead — No Payment` → agent call; no auto-chase in v1 |
| Single-tab CSV-like CRM scale | Filtering pain at volume | Acceptable v1; schemas defined for later Supabase/DB lift |
| Telegram dependency | Platform policy shifts | Adapter contract keeps WhatsApp exit cheap by design |

---

## 14. Open Questions

1. **XXL/3XL upcharge** — do real-world plus-size surcharges exist? (Blocks final pricing config only.)
2. Who prepares the GST/balance invoice post-artwork — assumed agent, manual. Confirm.
3. Target date for WhatsApp switch (informational; non-blocking).

---

## 15. Appendix A — Full Conversation Script (authoritative copy)

*Bracketed = inline keyboard buttons. Cancel available on every screen even where omitted for brevity.*

---

### S00 — Entry & Main Menu
*(triggered by `/start`, greeting text, or first contact)*
> 👋 Welcome to **Custom Teamwear** — bulk custom apparel for corporates, events, colleges & sports teams.
> Minimum order: **50 pieces**.
>
> Pick a quality tier to see products:
> `[ Basic · from ₹169/pc ]` `[ Standard · from ₹219/pc ]` `[ Premium Branded · from ₹499/pc ]` `[ ❌ Cancel ]`

If a <24h interrupted session exists, prepend:
> You have an unfinished quote — resume it?
> `[ ▶️ Resume my quote ]` `[ 🔄 Fresh start ]`

---

### S1 — Product Menu *(renders picked tier's pitch + its four products, live rates)*
Basic:
> Great choice. **Basic tier — best value for events & colleges:**
> `[ Round Neck Dry Fit · ₹169/pc (₹159 @100+) ]`
> `[ Polo Dry Fit · ₹289/pc (₹249 @100+) ]`
> `[ Round Neck Cotton · ₹259/pc (₹239 @100+) ]`
> `[ Cotton Polo · ₹389/pc (₹359 @100+) ]`
> `[ 🔙 Back ]`

Standard opens *"Better quality, better finish:"*, Premium Branded opens *"Global brands. Corporate prestige."* and lists its four branded labels (₹499–₹869).

---

### S2a — Quantity Ask *(typed)*
> How many pieces do you need? *(Minimum 50)*

### S2b — Rejection *(funny-polite; TERMINAL; zero logging)*
> 😅 Whoa there — that's barely enough for one cricket team *and* its reserves!
>
> We start at **50 pieces** because below that our machines go on strike. 🤖
>
> Hit 50+ anytime — you know where to find me. Just send `/start`!

### S2c — Bracket Reveal & Honest Upsell *(example qty 80, Standard Polo)*
> ✅ **80 pcs qualifies for 50+ pricing: ₹359/pc** *(Standard · Polo Dry Fit)*
> 💡 At **100 pcs** it drops to **₹309/pc** — you'd save **₹5,000** on 100 shirts.
>
> Continue with 80?
> `[ ▶️ Yes, continue with 80 ]` `[ 🔄 Change quantity ]`

*(Save figure = rate-delta × next-bracket quantity, computed from §6 only.)*

---

### S3 — Size Split *(qty echo; S·M·L·XL·XXL·3XL)*
> How should we split your **80 pcs** across sizes?

> `[ ⚖️ Even split ]` → resolved server-side to sum exactly 80
> `[ 📊 Standard mix ]` → S:10 M:25 L:30 XL:20 XXL:10 3XL:5 scaled proportionally
> `[ ✏️ Enter my own ]` → six sequential numeric prompts, `0` allowed

Mismatch state (e.g., 46 of 80):
> You've entered 46 of 80. Which size takes the remaining 34?
> `[ S ][ M ][ L ][ XL ][ XXL ][ 3XL ]`

---

### S4 — Print Method *(each shows live range; hint echoes on select)*
> How should your branding be applied? *(per-piece printing, added to garment price)*
> `[ 🖨 Screen Print · ₹25–45/pc ]`
> `[ 🖼 DTF Print · ₹35–70/pc ]`
> `[ 🌈 Sublimation · ₹30–60/pc ]`
> `[ 🧵 Embroidery · ₹50–120/pc ]`
> `[ 🤔 Not sure — advise me ]` *(→ widest range ₹25–120; agent recommends post-artwork)*

Selection echo example:
> 🖼 DTF selected — ₹35–70/pc depending on colours & coverage. Vivid multi-colour designs, great on all fabrics.

---

### S5 — City *(typed)*
> Which city should we deliver to?

### S6 — Name *(typed)*
> Who should we address the order to? Please share your **name**.

### S7 — Phone *(typed, validated)*
> Your **phone number** — used only for order updates & artwork approval.

Invalid retry:
> Hmm, that doesn't look like a valid Indian mobile number. Try again (10 digits)? Or `[ ❌ Cancel ]`.

### S8 — Timeline
> When do you need delivery?
> `[ ⚡ Urgent — within 7 days ]`
> `[ 🚚 Standard — 8–15 days ]`
> `[ 🗓 Flexible — 15+ days ]`

Urgent adds internal `timeline_urgent` flag only — no rush fee exists in the system.

---

### S9 — Logo Upload
> Almost done! Upload your **logo or design** 📎
> No artwork ready? Skip — our design team will help.
> `[ ⏭ Skip — no artwork yet ]`

---

### S10 — Quote Card *(transparency centerpiece; qty 80 · Standard · Polo Dry Fit · DTF)*
> 🧾 **Your Estimate** · #CTW-250614-03
> Standard · Polo Dry Fit · 80 pcs
> ─────────────────────
> 👕 Garment: 80 × ₹359 = **₹28,720**
> 🖼 Printing (DTF): 80 × ₹35–70 = **₹2,800 – ₹5,600**
> 　　⚠️ *estimate — finalized after you approve the artwork*
> ─────────────────────
> **Est. Total: ₹31,520 – ₹34,320 (+GST)**
>
> 💳 **Pay today (garment advance): ₹28,720**
> Printing balance + GST invoiced only after artwork approval — before production begins. **No hidden charges.**

> `[ 💳 Pay ₹28,720 garment advance ]`
> `[ 📞 Call Me ]` ← present iff qty > 300

Call-Me press:
> Got it! Our senior team will call you within a few hours about your large order. 📞

→ row `Lead — High-Value Callback` + admin ping. Flow ends warmly.

---

### S11 — Payment Loop
> Here's your secure UPI link for **exactly ₹28,720** — amount pre-filled, Order ID attached automatically.
>
> Scan & pay with any UPI app → *[dynamic QR PNG]*
> *[static brand QR attached as fallback]*
>
> ✅ Paid? Send us a **screenshot** here.
> ⏱ Not now? Reply `/start` anytime — your quote details are safe.

Screenshot received:
> Thanks! Verifying now — you'll get confirmation shortly. 🔍

→ row `Pending Payment` → **admin card fires** (below).
Stall/refusal → row `Lead — No Payment` + admin ping; agent calls; bot stays quiet unless resumed.

### ADMIN CARD *(admin chats only)*
> 🛒 **NEW ORDER — PENDING PAYMENT VERIFICATION**
> *[customer's screenshot forwarded above]*
> ─────────────────
> `CTW-250614-03` · Standard · Polo Dry Fit · 80 pcs
> Sizes: S:10 M:25 L:30 XL:20 XXL:10 3XL:5
> Print: DTF · Timeline: Standard (8–15d) · City: Pune
> Garment ₹28,720 · Est. print ₹2,800–5,600 · Advance due **₹28,720**
> Customer: Rahul Sharma · 98XXXXXX21 · tg:5512345678 · Logo: received ✔
> ─────────────────

> `[ ✅ Confirm payment ]` `[ 🚩 Issue — no/wrong payment ]`

✅ pressed → row `Confirmed` → customer auto-DM:
> 🎉 **Order CTW-250614-03 confirmed!** Production planning begins. Our team will reach out shortly with your artwork proof & next steps.

🚩 pressed → row `Payment Issue`; agent follows up manually.
Duplicate ✅ → *"This order was already processed."*

---

## 16. Revision History

| Ver | Date | Change |
|---|---|---|
| 1.0 | — | Initial approved spec · Telegram MVP · custom branch removed per owner |

---

*Doc ends. Project plan (repo scaffold, milestones, deploy runbook) intentionally excluded — awaiting your go.*