# Complete Codebase & Symbol Map (`docs/CODEBASE_MAP.md`)

This document is a complete index of all files, modules, symbols, interfaces, and responsibilities in the **Custom Teamwear** codebase.

---

## 1. Top-Level Directory Map

| Path | Description |
|---|---|
| [`api/`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/api) | Vercel serverless function entrypoints (Telegram webhook, health checks, cron) |
| [`src/admin/`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/admin) | Admin notification cards and callback action handlers (Confirm, Issue, Mockup approval) |
| [`src/bot/`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/bot) | grammY bot initialization, middleware setup, command registration |
| [`src/catalog/`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/catalog) | Catalog resolution queries, types, and generated brand/style datasets |
| [`src/config/`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/config) | Environment validation (`env.ts`), Sentry configuration, build stamps |
| [`src/conversation/`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/conversation) | grammY interactive conversation flow (S00 to S12), keyboards, copy text |
| [`src/mockup/`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/mockup) | Sharp deterministic image compositing, zone coordinates, monthly quotas, paid approval |
| [`src/pricing/`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/pricing) | Pure calculation functions and price book matrices (INVARIANT: single source of truth) |
| [`src/qr/`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/qr) | Dynamic UPI QR code string encoding and PNG rendering |
| [`src/session/`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/session) | Redis client, chat locking, deduplication, atomic Order ID generator, state machine |
| [`src/shared/`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/shared) | Shared domain types (`OrderData`, `MockupGeneration`), card renderers, sanitizers |
| [`src/sheets/`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/sheets) | Google Sheets client, thread-safe appending, column schemas |
| [`src/storage/`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/storage) | Vercel Blob persistent storage integration |
| [`scripts/`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/scripts) | Maintenance CLI scripts (webhook registration, catalog generation) |
| [`tests/`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/tests) | 102+ comprehensive automated unit, state machine, and contract tests |
| [`quality/`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/quality) | Source manufacturer PDF catalogs |
| [`assets/`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/assets) | Extracted catalog garment photos and fallback mockup templates |

---

## 2. Serverless Function Endpoints (`api/`)

### [`api/webhook.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/api/webhook.ts)
- **Role**: Main entrypoint for Telegram webhook updates.
- **Key Functions**:
  - `POST`: Validates `x-telegram-bot-api-secret-token`.
  - `isUpdateDuplicate(updateId)`: Redis dedupe check on `upd:<update_id>`.
  - `withChatLock(chatId, fn)`: Distributed lock on `lock:<chat_id>` to serialize updates per user.
  - `bot.handleUpdate(update)`: Hands off update to grammY bot pipeline.

### [`api/health.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/api/health.ts)
- **Role**: Public health check and deployment verification.
- **Output**: Returns JSON with `ok: true`, `buildStamp`, `commitSha`, and enabled feature flags.

### [`api/heartbeat.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/api/heartbeat.ts)
- **Role**: Lightweight uptime monitor for cron services.

### [`api/mockup-delivery.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/api/mockup-delivery.ts)
- **Role**: Async delivery webhook handler for decoupling image rendering from Telegram ACK deadlines.

---

## 3. Application Source (`src/`)

### 3.1 Admin (`src/admin/`)
- **[`src/admin/actions.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/admin/actions.ts)**:
  - Handles inline button clicks from admin alerts:
    - `admin_confirm:<order_id>`: Marks order as Confirmed, notifies customer, updates Google Sheets.
    - `admin_issue:<order_id>`: Marks order as Payment Issue, requests customer re-verification.
    - `mockup_approve:<gen_id>`: Approves paid mockup generation, runs Sharp compositing, delivers proof.
    - `mockup_reject:<gen_id>`: Rejects paid mockup request.
- **[`src/admin/notify.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/admin/notify.ts)**:
  - `notifyAdmins(bot, cardText, keyboard, photoFileId)`: Dispatches alerts to all chat IDs in `ADMIN_CHAT_IDS`.

---

### 3.2 Bot Core (`src/bot/`)
- **[`src/bot/index.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/bot/index.ts)**:
  - Initializes `Bot<BotContext>(env.TELEGRAM_BOT_TOKEN)`.
  - Registers grammY plugins: `conversations()`, `createConversation(orderConversation)`.
  - Attaches rate limiters and error handlers.
- **[`src/bot/context.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/bot/context.ts)**:
  - Defines `BotContext` extending `Context & ConversationFlavor`.

---

### 3.3 Catalog (`src/catalog/`)
- **[`src/catalog/index.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/catalog/index.ts)**:
  - `listCatalogGroups(tier)`: Fetches brands and product groups for a quality tier.
  - `listCatalogItems(groupId)`: Returns specific styles in a brand group.
  - `getCatalogItem(itemId)`: Resolves an individual garment style and its color variants.
  - `resolveCatalogAssetPath(relPath)`: Normalizes local image path under `assets/catalog/`.
- **[`src/catalog/types.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/catalog/types.ts)**:
  - Types: `CatalogTier`, `CatalogGroup`, `CatalogItem`, `CatalogVariant`.
- **[`src/catalog/data/catalog.generated.json`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/catalog/data/catalog.generated.json)**:
  - Auto-generated catalog database produced from PDF parsing.

---

### 3.4 Conversation Engine (`src/conversation/`)
- **[`src/conversation/orderFlow.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/conversation/orderFlow.ts)**:
  - Core grammY conversation orchestrating steps S00 to S12.
- **[`src/conversation/steps/catalogSelection.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/conversation/steps/catalogSelection.ts)**:
  - Sub-conversation managing style browsing, swatch previews, and mandatory colour confirmation.
- **[`src/conversation/steps/sizeSplit.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/conversation/steps/sizeSplit.ts)**:
  - Size split calculator for Even Split, Standard Mix, and manual parsing.
- **[`src/conversation/keyboards.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/conversation/keyboards.ts)**:
  - Factory functions for inline keyboards (tiers, print methods, timelines, placements, admin actions).
- **[`src/conversation/copy.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/conversation/copy.ts)**:
  - Single source for all customer-facing text, welcome copy, prompts, and humorous MOQ rejection copy.
- **[`src/conversation/draft.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/conversation/draft.ts)**:
  - In-memory and Redis-backed progressive order builder.

---

### 3.5 Deterministic Mockup Pipeline (`src/mockup/`)
- **[`src/mockup/composite.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/mockup/composite.ts)**:
  - Sharp-based image compositing. Places user logo at designated pixel coordinates on the confirmed garment photo.
- **[`src/mockup/zones.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/mockup/zones.ts)**:
  - Bounding boxes and anchor coordinates for `round_neck` and `polo` (left chest, center chest, upper back, full back, sleeves).
- **[`src/mockup/quota.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/mockup/quota.ts)**:
  - Monthly quota tracker (3 free/month in `Asia/Kolkata` timezone).
- **[`src/mockup/paidGeneration.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/mockup/paidGeneration.ts)**:
  - State manager for ₹20 deposit, payment proof upload, and admin approval/rejection.
- **[`src/mockup/workflow.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/mockup/workflow.ts)**:
  - High-level orchestrator: reserves slot -> executes Sharp compositing -> stores in Vercel Blob -> commits quota.
- **[`src/mockup/deliver.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/mockup/deliver.ts)**:
  - Sends rendered proof directly to the customer's Telegram chat.

---

### 3.6 Pricing Engine (`src/pricing/`) — INVARIANT
- **[`src/pricing/index.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/pricing/index.ts)**:
  - `calculateQuote(params)`: Pure function calculating garment unit rate, garment total, print estimates, grand total, and advance due.
  - `calculateAdvance(garmentTotal)`: `Math.ceil(garmentTotal * 0.50)` (~50% rounded up).
- **[`src/pricing/priceBook.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/pricing/priceBook.ts)**:
  - Price book lookup table by tier, product silhouette, and volume tier (50-99, 100-249, 250+ pcs).
  - Print method cost ranges (Screen, DTF, Sublimation, Embroidery).

---

### 3.7 Session & Persistence (`src/session/`)
- **[`src/session/redisClient.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/session/redisClient.ts)**:
  - Configured `@upstash/redis` client.
- **[`src/session/statusMachine.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/session/statusMachine.ts)**:
  - `validateStatusTransition(currentStatus, targetStatus)`: Enforces forward-only order status transitions.
- **[`src/session/orderId.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/session/orderId.ts)**:
  - `nextOrderId()`: Generates atomic daily ID (`YYMMDD-XXXX`).
- **[`src/session/orderStore.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/session/orderStore.ts)**:
  - Read/write order snapshots (`order:<order_id>`).
- **[`src/session/draftStore.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/session/draftStore.ts)**:
  - Read/write active draft (`draft:<chat_id>`).
- **[`src/session/chatLock.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/session/chatLock.ts)**:
  - Distributed lock utility (`withChatLock`).
- **[`src/session/dedupe.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/session/dedupe.ts)**:
  - Update deduplication marker (`isUpdateDuplicate`).

---

### 3.8 Shared Utilities (`src/shared/`)
- **[`src/shared/types.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/shared/types.ts)**:
  - Domain models: `OrderData`, `CatalogSelection`, `MockupGeneration`, `OrderStatus`, `SizeSplit`.
- **[`src/shared/render.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/shared/render.ts)**:
  - `renderQuoteCard(order)`: Customer-facing itemized quotation text.
  - `renderAdminCard(order)`: Admin-facing alert card with customer info and breakdown.
- **[`src/shared/sanitize.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/shared/sanitize.ts)**:
  - `sanitizeForSpreadsheet(val)`: Strips `= + - @` leading characters.
  - String length enforcers and phone normalizer.

---

### 3.9 CRM & Sheets (`src/sheets/`)
- **[`src/sheets/client.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/sheets/client.ts)**:
  - Google Service Account authentication using `google-auth-library`.
- **[`src/sheets/safeAppend.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/sheets/safeAppend.ts)**:
  - Thread-safe row append with automatic fallback to Telegram admin alert if Sheets API fails.
- **[`src/sheets/schema.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/sheets/schema.ts)**:
  - Column mapping for `Orders` sheet.
- **[`src/sheets/catalogSchema.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/sheets/catalogSchema.ts)**:
  - Column mapping for `Catalog Selections` sheet.
- **[`src/sheets/mockupSchema.ts`](file:///d:/Work%20Code/Projects/custom%20team%20wear/app/src/sheets/mockupSchema.ts)**:
  - Column mapping for `Mockup Generations` sheet.
