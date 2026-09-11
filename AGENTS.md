# AGENTS.md — AI Agent Guide

This document is for AI coding assistants working in this repository. For human setup
(deploy, env vars, webhook registration, testing on Telegram), read `README.md`.
For the product spec, see `docs/PRD-CTW-WhatsApp-Bot.md` (may live in the workspace
root, outside `app/`).

> **Note:** `.kiro/steering/*.md` files are partially stale (they predate the
> implementation). Treat `src/` + this file as ground truth.

## What this is

**Custom Teamwear — Bulk Order Bot.** A click-first Telegram bot for bulk apparel
orders (MOQ 50 pcs), designed so the conversational core is portable to WhatsApp Cloud
API later. Telegram users walk a fixed flow (tier → catalog → qty → sizes → print →
contact → timeline → logo → mockup → quote → UPI payment); admins verify payment
manually from an admin card; orders land in Google Sheets.

**Stack:** TypeScript (ESM, `"type": "module"`), grammY 1.46 + `@grammyjs/conversations`,
Vercel serverless functions, Upstash Redis (sessions/dedupe/locks), Google Sheets
(CRM), Sharp (deterministic mockup compositing), Vercel Blob (mockup storage),
qrcode (UPI QR), mupdf (catalog PDF ingestion), Sentry. Node ≥ 20.
Tests: Node's built-in test runner via tsx (`node --import tsx --test`) — no jest/vitest.

## Non-negotiable invariants

These are the rules of the codebase. Violating them is a bug.

1. **Pricing is centralized.** `src/pricing/` is the ONLY place rupee amounts are
   computed; `pricing/priceBook.ts` is the only place they are hardcoded. The catalog
   maps items onto pricing `ProductId`s; the pricing engine is catalog-agnostic.
2. **One shared renderer.** `src/shared/render.ts` renders both the customer quote
   card and the admin card from the same `OrderData` — they can never disagree.
3. **Money events never fail silently.** Sheet write failures escalate the FULL order
   as text to admin chats and throw (customer sees a generic apology). Admin
   notifications have plain-text fallbacks.
4. **Env validated once, fail-fast.** `src/config/env.ts` `getEnv()` validates all
   required vars at cold start. Access env only via `getEnv()`.
5. **Security gates.** Webhook secret checked on 100% of requests; admin actions
   gated server-side by `ADMIN_CHAT_IDS`; `sanitizeForSheet` strips spreadsheet
   formula injection from all user text; monetary values computed server-side only.
6. **Forward-only status machines.** Orders: `Pending Payment → Confirmed | Payment Issue`
   (leads are terminal). Mockup generations have their own forward-only machine
   (see below). Both throw on invalid transitions.
7. **Below-MOQ rejection is terminal and logs nothing** (no sheet row, no admin ping).
8. **Click-first UX.** Buttons everywhere; typed input only for qty, size counts,
   city, name, phone, and logo/proof uploads. Copy lives in
   `src/conversation/copy.ts` — it is the authoritative product wording, don't
   improvise new phrasing casually.
9. **AI exception.** No AI touches pricing or flow — the single exception is the
   *optional* AI-styled mockup visualization (`src/mockup/generateAi.ts`). The
   authoritative print proof is always the deterministic Sharp composite of the
   customer's confirmed catalog image + original logo bytes.

## Repo layout

```
api/
  webhook.ts            Telegram webhook entry (secret check, dedupe, fast 200-ACK, 25s grammY timeout)
  mockup-delivery.ts    Internal-only 202+waitUntil worker for slow mockup generation (x-internal-secret)
  heartbeat.ts          Daily cron -> admin ping
  health.ts             Public build/feature info (deploy-lag diagnosis; non-secret)
src/
  admin/                Admin card notify + Confirm/Payment-Issue + mockup approve/reject handlers
  bot/                  grammY composition root (getBot), context types, middleware order
  catalog/              Generated catalog domain module (tiers→groups→items→colour variants)
    data/               catalog.generated.json (GENERATED, never hand-edit) + overrides.json
  config/               env.ts (validation), sentry.ts, version.ts (BUILD_STAMP + feature flags)
  conversation/         orderFlow.ts (S00–S11), copy.ts, keyboards.ts, draft.ts,
                        waitHelpers.ts, steps/{catalogSelection,sizeSplit}.ts
  mockup/               composite, zones, garmentReference, workflow, quota, generationStore,
                        paidGeneration, deliver, deliverTrigger, customerNotify, rateLimit,
                        generateAi/imageProvider/{gemini,openrouter}Client, promptBuilder, generate (legacy)
  pricing/              priceBook.ts (data) + index.ts (pure math)
  qr/                   UPI URI + 512px PNG generation
  session/              redisClient, redisStorageAdapter, chatLock, dedupe, draftStore,
                        orderId, orderStore, rateLimit, statusMachine
  shared/               types.ts (OrderData etc.), render.ts, sanitize.ts
  sheets/               client (Orders tab), safeAppend, catalogSchema/Selections,
                        mockupSchema/Generations — 3 tabs: Orders, CatalogSelections, MockupGenerations
  storage/              blob.ts (Vercel Blob wrapper, injectable uploader)
assets/catalog/         Generated catalog preview images — COMMITTED, shipped via includeFiles
quality/                Source catalog PDFs — input to generate-catalog
scripts/                set-webhook, delete-webhook, webhook-info, generate-catalog
tests/                  Node test-runner suites + support/ fakes (fakeRedis, fakeSheetStore, testEnv)
```

## Conversation flow (src/conversation/orderFlow.ts)

One long grammY conversation, `orderFlow`, registered via `createConversation`.
Progress lives in an `OrderDraft` persisted to Redis (`sess:<chatId>`) after every
step; each step is skipped if its draft field is already set (resume support).
`/start` exits any active conversation and re-enters, offering Resume/Fresh start
if a draft with qty exists and is < 24h old. `cancel` callback works on every screen.

Steps: resume check → **S00** tier → **S1** catalog selection (group → item → image
confirm → colour, mandatory; may end "assisted" for unscannable brands or go "back")
→ **S2** qty (MOQ 50 hard gate; bracket reveal + upsell) → **S3** size split
(even / standard mix / own with exact-sum fix-up) → **S4** print method →
**S5–S7** city / name / phone → **S8** timeline → **S9** multi-logo loop
(placement → upload → more?) → **S10** order assembly: `nextOrderId()` created here,
mockup offered (generate → quota decision) → **S11** quote card → payment screen
(dynamic UPI QR with amount=50% advance + static QR) → screenshot upload → sheet
append + admin card with ✅ Confirm / 🚩 Issue buttons.

Exit taxonomy matters: pre-qty cancels discard silently; post-qty cancels write a
"Lead — Abandoned" row; qty > 300 shows "📞 Call Me" → "Lead — High-Value Callback";
no-payment cancel → "Lead — No Payment".

## Mockup subsystem (src/mockup/)

- **Order in flow:** mockup generation happens AFTER logo upload, BEFORE payment.
  Order ID already exists, so everything is tagged. Admin payment-confirm does NOT
  trigger generation.
- **Quota (`quota.ts`):** first `MOCKUP_FREE_PER_MONTH` (3) *successful* generations
  per chat per **Asia/Kolkata calendar month** are free; #4+ costs
  `MOCKUP_PAID_PRICE_INR` (₹20) with admin approval. Commit-on-success: reservation
  decides free/paid (sticky per generation); failure releases free slots; paid
  decisions never re-charge.
- **Generation record (`generationStore.ts`):** `mockupgen:<generationId>` in Redis
  (60d), indexes by order and pending-by-chat. Forward-only:
  `reserved → awaiting_payment | generating; awaiting_payment → awaiting_approval;
  awaiting_approval → approved | rejected; approved → generating;
  generating → completed | failed; failed → generating` (retry).
- **Deterministic proof (`composite.ts`):** Sharp "contain"-fits the original logo
  bytes into a zone rect on the customer's confirmed catalog image. `zones.ts`
  defines the 5 placement rects + front/back view mapping. Never AI for proofs.
- **Paid flow (`paidGeneration.ts`):** proof screenshot routed via the top-level
  `bot.on("message")` → admins get approve/reject buttons (`mockupgen:` callbacks,
  idempotent, admin-gated).
- **Serverless dispatch (`deliverTrigger.ts`):** mockup generation takes 30–60s+,
  far beyond grammY's 25s webhook budget — it is dispatched fire-and-forget to
  `POST /api/mockup-delivery` (120s maxDuration, `waitUntil`), protected by
  `x-internal-secret` with timing-safe compare. Both triggers call it: the
  order-flow mockup step and the admin paid-approval. **Never run slow
  generation inside the webhook handler** — `tests/mockupTiming.test.ts`
  enforces this structurally. The paid-approval delivery seam is injectable
  (`__setAfterApprovalDeliverForTests`) for tests.
- **Over-quota UX:** when the free quota is exhausted, `api/mockup-delivery.ts`
  itself messages the customer (`COPY.mockupPaidRequired`) and the admins; the
  customer's next photo/document is matched as the ₹20 payment proof via
  `mockupgen:pending:<chatId>` and routed by the top-level `bot.on("message")`
  (falling through to a fresh order flow if the proof no longer attaches).
- **Delivery (`deliver.ts`):** download logos, validate (3/day/chat, ≤4 logos, ≤8MB,
  jpeg/png/webp), generate, upload to Blob, send, advance record, commit/release quota.

## Redis key conventions

| Key | TTL | Purpose |
|---|---|---|
| `upd:<updateId>` | 24h | webhook dedupe (SETNX) |
| `busy:<chatId>` | 90s | per-chat concurrency lock |
| `outer-sess:*`, `conv:*` | 24h | grammY storages |
| `sess:<chatId>` | 24h | order draft |
| `oid:<YYMMDD>` | 48h | order-id counter (INCR → `CTW-YYMMDD-nn`) |
| `order:<orderId>` | 14d | order snapshot (admin confirm / mockup recovery) |
| `admin-action:<orderId>` | 90d | admin confirm/issue idempotency |
| `mockupgen:*` | 60d | generation record + indexes (`mockupgen:<genId>`, `mockupgen:order:<orderId>`, `mockupgen:pending:<chatId>`, `mockupgen:decision:<genId>`) |
| `mockupquota:*` | ~40d | free-monthly quota (`mockupquota:freecommitted:<chat>:<month>`, sticky `mockupquota:decision:<genId>`, `mockupquota:committed:<genId>`) |
| `ratelimit:ctw*`, `ratelimit:mockup*` | — | sliding-window limiters |

Customer chat ids are stored as `"tg:<id>"` prefix strings (future `wa:`).

## Serverless/Vercel gotchas

- **Always 200-ACK the webhook**, even on error (avoid Telegram retry storms).
- `api/webhook.ts` needs `includeFiles: "assets/catalog/**"` in `vercel.json` —
  catalog images are read from disk at runtime, not bundled by tracing.
- `catalog.generated.json` is read with `fs.readFileSync` — tsconfig module settings
  don't support JSON import attributes. Keep that pattern.
- `sharp` (compositing) and `mupdf` (catalog script) are native deps; sharp must
  match the Vercel runtime.
- Base URL for internal dispatch: `PUBLIC_BASE_URL` → `VERCEL_PROJECT_PRODUCTION_URL`
  → `VERCEL_URL`.
- Tests NEVER hit real Redis/Sheets — use `__setRedisForTests()` and the
  `MockupSheetStore`/`BlobUploader` injection seams (`tests/support/`).

## Commands

```bash
npm install
npm run typecheck        # tsc --noEmit (also aliased as lint)
npm test                 # node --import tsx --test tests/**/*.test.ts
npm run dev              # vercel dev
npm run generate-catalog # re-ingest quality/*.pdf -> assets/catalog + catalog.generated.json
npm run set-webhook / delete-webhook / webhook-info
```

## Catalog data pipeline

- Never hand-edit `src/catalog/data/catalog.generated.json` — regenerate via
  `npm run generate-catalog` (mupdf renders PDF pages from `quality/`).
- Fix mis-parsed items in `src/catalog/data/overrides.json` (shallow-merged on
  every run), then regenerate.
- Orders store `catalogVersion` (SHA-256 of source PDFs) + exact
  sourcePage/itemId/variantId in the **CatalogSelections** tab — historic orders
  stay traceable to the exact PDF page.

## Testing guidance

- Add tests alongside changes in `tests/`, using the Node test runner style of
  existing files and the fakes in `tests/support/`.
- Covered: pricing math, sanitizers/validators, status machine, catalog domain +
  S1 flow, mockup compositing (pixel-exact), quota, workflow, durability, timing.
- Not covered: the live grammY conversation end-to-end (manual QA on Telegram per
  README §6). A mock-transport e2e suite is a known good future addition.

## Common tasks

- **Change user-facing text:** edit `src/conversation/copy.ts` only.
- **Change a price/rate:** edit `src/pricing/priceBook.ts` only, then run tests.
- **Add a conversation step:** extend `OrderDraft` in `draft.ts`, add the step in
  `orderFlow.ts` (with `persist()` + cancel support + resume skip-if-set), add
  keyboards in `keyboards.ts`, copy in `copy.ts`.
- **Bump deploy marker:** update `BUILD_STAMP` in `src/config/version.ts` (it shows
  on `/api/health` for deploy-lag checks).
- **Admin action:** follow `src/admin/actions.ts` patterns — parse order/generation
  id from callback data, gate by `ADMIN_CHAT_IDS`, SETNX idempotency.
