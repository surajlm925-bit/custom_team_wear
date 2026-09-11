# Custom Teamwear — Bulk Order Bot

Click-first Telegram bot for bulk apparel orders (MOQ 50 pcs), built per
`docs/PRD-CTW-WhatsApp-Bot.md` and the steering docs in `.kiro/steering/`.

Stack: grammY + Vercel serverless functions + Upstash Redis + Google Sheets.
No AI/LLM anywhere — every screen is a template, every price is a lookup.

## 🧭 Documentation & AI Agent Navigation

If you are an **LLM / AI Coding Assistant** (Claude, ChatGPT, Gemini, Copilot, DeepSeek, Cursor, Roo, Windsurf, OpenCode) or a **human developer**, start with these guides:

- **[`AGENTS.md`](./AGENTS.md)** — **Primary orientation guide for AI agents & LLMs** (invariants, conventions, architecture rules, project structure).
- **[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)** — High-level architecture, Mermaid component diagrams, security model, and data stores.
- **[`docs/STATE_MACHINE_AND_FLOWS.md`](./docs/STATE_MACHINE_AND_FLOWS.md)** — Detailed screen-by-screen flow (S00 to S12), status transitions, and session lifecycle.
- **[`docs/CATALOG_AND_MOCKUP_SYSTEM.md`](./docs/CATALOG_AND_MOCKUP_SYSTEM.md)** — PDF extraction pipeline, Sharp deterministic mockup engine, and monthly quotas.
- **[`docs/CODEBASE_MAP.md`](./docs/CODEBASE_MAP.md)** — Full symbol & module reference index across the entire codebase.
- **[`docs/DEVELOPER_CHEATSHEET.md`](./docs/DEVELOPER_CHEATSHEET.md)** — Step-by-step modification recipes (updating prices, adding placement zones, adding items, testing).

## 1. Prerequisites

- Node.js 20+ (tested with Node 22)
- A Vercel account (free Hobby tier is fine for testing)
- A **dev** Telegram bot token from [@BotFather](https://t.me/BotFather) — create a
  separate bot from your eventual production bot, per tech.md's environment isolation rule
- An Upstash Redis database (free tier) — REST URL + REST token
- A Google Cloud service account with Sheets API access, and a Google Sheet
  shared with that service account's email (Editor access)
- A UPI VPA (`MERCHANT_VPA`) and a static brand QR image hosted somewhere
  public (`STATIC_QR_URL`)

## 2. Install

```bash
npm install
```

## 3. Configure environment

Copy `.env.example` to `.env.local` and fill in every value. `.env.local` is
git-ignored — never commit real secrets.

```
CHANNEL=telegram
TELEGRAM_BOT_TOKEN=...
WEBHOOK_SECRET=...           # any long random string you choose
ADMIN_CHAT_IDS=111111111,222222222
MERCHANT_VPA=yourbusiness@upi
STATIC_QR_URL=https://.../static-qr.png
REDIS_REST_URL=https://xxxx.upstash.io
REDIS_REST_TOKEN=...
GOOGLE_SERVICE_ACCOUNT_JSON={"client_email":"...","private_key":"..."}
SHEET_ID=...                 # the id segment in the sheet's URL
SENTRY_DSN=                  # optional
```

To find your Telegram numeric chat ID for `ADMIN_CHAT_IDS`, message
[@userinfobot](https://t.me/userinfobot) from the account(s) that should act
as admin.

## 4. Deploy to Vercel (webhooks require a public HTTPS URL)

Serverless functions can't run long polling, so local testing also needs a
real deployment (or a tunnel — see §6 for an alternative).

```bash
npm install -g vercel   # if you don't have the CLI
vercel login
vercel link             # creates/links a Vercel project
```

Add every variable from `.env.local` to the Vercel project (Project Settings
→ Environment Variables, or via CLI):

```bash
vercel env add TELEGRAM_BOT_TOKEN
vercel env add WEBHOOK_SECRET
vercel env add ADMIN_CHAT_IDS
vercel env add MERCHANT_VPA
vercel env add STATIC_QR_URL
vercel env add REDIS_REST_URL
vercel env add REDIS_REST_TOKEN
vercel env add GOOGLE_SERVICE_ACCOUNT_JSON
vercel env add SHEET_ID
vercel env add CHANNEL
```

Then deploy:

```bash
vercel deploy            # preview deploy
vercel deploy --prod     # or straight to your dev project's "prod" env
```

Note the deployment URL Vercel prints, e.g. `https://ctw-bot-dev.vercel.app`.

## 5. Register the Telegram webhook

```bash
set TELEGRAM_BOT_TOKEN=your-dev-token
set WEBHOOK_SECRET=your-webhook-secret
npm run set-webhook -- https://ctw-bot-dev.vercel.app
```

(On PowerShell use `$env:TELEGRAM_BOT_TOKEN="..."` instead of `set`.)

You should see `"ok": true, "description": "Webhook was set"`. Telegram will
now POST every update to `https://<your-app>/api/webhook`.

### 5a. Verify WHICH build is live (deploy-lag check)

Two non-secret checks prove the deployment is serving the code you expect
(this catches the classic "the bot is running an old build / wrong
project" problem):

```bash
# 1. Which URL is Telegram actually calling?
npm run webhook-info            # prints getWebhookInfo (url, last_error, ...)

# 2. Which build is that URL serving?
curl https://<your-app>/api/health
```

`/api/health` returns non-secret build metadata:

```json
{
  "ok": true,
  "buildStamp": "2026-09-03-catalog-colour-50pct-deterministic-mockup",
  "commitSha": "<git sha Vercel built from>",
  "commitRef": "main",
  "features": {
    "catalogColourFlow": true,
    "fiftyPercentAdvance": true,
    "deterministicMockup": true,
    "mockupBeforePayment": true
  }
}
```

If `commitSha` is an old commit or a `features` flag is missing/false, the
deployment is stale — commit + push the current code and redeploy. The
webhook also logs the same `buildStamp`/`commitSha` once per cold start
(visible in `vercel logs`).

## 6. Test it on Telegram

1. Open your dev bot in Telegram (search its @username, or use the link
   BotFather gave you) and press **Start** / send `/start`.
2. Walk the full happy path: tier → brand/category → style → confirm the
   catalog photo → **colour (mandatory — you cannot proceed without
   selecting and confirming a colour)** → quantity (try `49` first to
   confirm the funny rejection, then `60` or `120`) → size split (the
   message explains **even split**, **standard mix**, and **enter my own**)
   → print method → city/name/phone → timeline → **logo upload → "Generate
   my mockup"** → quote card.
3. The mockup is a **deterministic proof**: your exact selected-colour
   garment image with your original logo composited at the chosen zone (no
   AI redraw/recolour). It is generated **before** payment, tagged to the
   Order ID created right after logo upload. First 3 mockups/month are free;
   #4+ require a ₹20 payment proof + admin approval.
4. Press **Pay** → the advance is **~50% of the garment total**
   (`Math.ceil(garmentTotal × 0.5)`; e.g. ₹28,720 garment → **₹14,360**
   advance). You'll get a dynamic QR (amount + Order ID baked in) plus the
   static fallback QR. Send **any photo** as your "screenshot" — the bot
   doesn't verify payment itself, a human does.
5. Check your admin chat(s): you should receive the forwarded screenshot with
   the full order card (showing the exact catalog item + colour + advance)
   and **✅ Confirm** / **🚩 Issue** buttons.
6. Press **✅ Confirm** as the admin — the customer should get an automatic
   confirmation DM, and the Google Sheet "Orders" tab should show a
   `Confirmed` row. Press it again to confirm the idempotency guard
   ("already processed").
7. Try `/start` mid-flow to confirm the **Resume/Fresh start** prompt appears.
8. Try quantity `301` to confirm **📞 Call Me** shows up (300 should not show it).

### Debugging

- Vercel function logs: `vercel logs <deployment-url>` or the Vercel dashboard.
- If the bot doesn't respond at all, re-run `set-webhook` and check
  `getWebhookInfo`: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
  (look at `last_error_message`).
- To stop the dev bot from receiving updates (e.g. before redeploying with a
  different token), run `npm run delete-webhook`.

## 7. Catalog data (brands, styles, colours)

The S1 step of the conversation (tier → brand/category → style → colour)
is driven by a generated catalog, not hand-written code. The catalog is
built from the PDFs under `quality/` by a repeatable ingestion script —
never hand-edit the generated JSON, it's overwritten on every run.

```bash
npm run generate-catalog
```

This reads every PDF under `quality/`, extracts text where possible,
renders each catalog page to a JPEG preview under `assets/catalog/`, and
writes `src/catalog/data/catalog.generated.json` — a versioned manifest
of tiers → groups (brands/categories) → items (styles) → colour variants.
Each item carries a `productId` that maps onto the existing 4-SKU price
book (`src/pricing/priceBook.ts`), so regenerating the catalog never
changes pricing.

Run this whenever:
- A PDF under `quality/` is added, replaced, or removed.
- A brand/style extraction looks wrong and you've fixed the parser.

### Fixing a mis-parsed item without hand-editing generated JSON

Some catalogs are scanned/flattened PDFs with no extractable text
(Reebok, Van Heusen) — these come out as generic "Style (page N)" items
flagged `needsReview: true`. To correct a label, style code, fabric,
colour name, or `productId` without it being overwritten on the next
run, edit `src/catalog/data/overrides.json` (auto-created on first run):

```json
{
  "items": {
    "branded-reebok-i47": { "label": "Reebok Crew Neck — Navy", "needsReview": false }
  },
  "variants": {
    "branded-reebok-i47-v1": { "colorName": "Navy" }
  }
}
```

Overrides are shallow-merged onto the auto-extracted data every time
`generate-catalog` runs. Re-run the script after editing overrides to
apply them.

### Traceability

Every order that goes through the catalog flow stores a `catalogVersion`
(derived from the SHA-256 of every source PDF) plus the exact
`sourceId`/`sourcePage`/`itemId`/`variantId` it was built from, in a
dedicated **CatalogSelections** sheet tab (separate from **Orders**, so
the existing Orders schema is untouched). This means a historic order
stays fully traceable back to the exact PDF page the customer approved,
even after the catalog is regenerated with different PDFs later.

### Deployment note

Catalog preview images live under `assets/catalog/` and are read at
runtime by file path (not statically imported), so Vercel's automatic
file tracing won't pick them up on its own — `vercel.json` explicitly
lists them via `functions["api/webhook.ts"].includeFiles`. If you rename
or move that directory, update the `includeFiles` glob to match, or the
webhook function will 404/error trying to send a catalog photo in
production while working fine locally.

The source PDFs (`quality/**`) and generated previews
(`assets/catalog/**`) are committed to the repo — the catalog is meant to
be reproducible and deployable without any external asset host, aside
from the Stellars swatch images that stay linked to their original
`postimg.cc` source URLs on top of a locally mirrored copy.

## 8. Switching to WhatsApp later

The PRD's whole point is that this migration should be cheap:

- All Telegram-specific code is isolated to `grammy`/`@grammyjs/*` calls
  inside `src/bot/`, `src/admin/notify.ts`, and `api/webhook.ts`. Nothing in
  `src/pricing/`, `src/shared/`, `src/sheets/`, `src/qr/`, or
  `src/conversation/orderFlow.ts`'s *business logic* references Telegram
  types directly beyond the context object shape.
- To add WhatsApp:
  1. Build a WhatsApp Cloud API (or Baileys) adapter implementing the same
     shape as `src/admin/notify.ts` / the bot's send/receive surface
     (`verifyRequest · sendMessage · sendMenu · sendImage · fetchMedia · onUpdate`,
     per tech.md's fixed interface).
  2. Add a `CHANNEL=whatsapp` branch, new secrets (WhatsApp access token,
     phone number ID, app secret for signature verification), and a new
     webhook route that also answers Meta's GET verification handshake.
  3. Re-run the conversation flow against the new adapter — the menus were
     designed to stay within the WhatsApp interactive limits (≤10 options,
     ≤3 buttons/screen) from day one, so `orderFlow.ts` itself should need
     minimal changes.
  4. Point `customerChatId` at the new `wa:` prefix instead of `tg:` (the
     sheet schema already expects a channel-prefixed identifier).
- Until that adapter exists, `CHANNEL` only accepts `"telegram"` — see
  `src/config/env.ts`.

## 9. Project structure

```
api/
  webhook.ts        Telegram webhook entry point (secret check, dedupe, fast-ACK)
  heartbeat.ts       Daily cron -> admin "all good" ping
src/
  admin/             Admin card notification + Confirm/Issue action handlers
  bot/               grammY Bot composition root (session, conversations, routing)
  catalog/           Typed catalog domain module + generated manifest (see §7)
    data/            catalog.generated.json (generated) + overrides.json (hand-maintained)
  config/            env var loading/validation, Sentry init
  conversation/       S00-S11 flow, copy templates, keyboards, size-split + catalog-pick steps
  pricing/           Price book (data) + pure computation functions
  qr/                UPI QR PNG generation
  session/           Redis client, dedupe, order-id counter, rate limit, status machine
  sheets/            Google Sheets CRM writer + outage-safe wrapper + CatalogSelections tab
  shared/            Shared render (quote/admin card), sanitizers, domain types
assets/catalog/      Generated catalog preview images (see §7) — committed, deployable
quality/             Source catalog PDFs (see §7) — committed, kept for re-ingestion
scripts/             set-webhook / delete-webhook CLI helpers + generate-catalog ingestion
tests/               Unit tests for pricing, sanitizers, status machine, catalog module
```

## 10. Tests

```bash
npm test          # unit tests (pricing engine, sanitizers, status machine, catalog module)
npm run typecheck # tsc --noEmit
```

These cover the pure, testable core (pricing math, formula-injection
sanitizer, phone/qty validation, forward-only status transitions, catalog
lookup/validation, catalog callback-payload shape, catalog selection →
sheet-row mapping). The conversation flow itself is exercised manually
against live Telegram per §6 — grammY conversations don't have an
official test harness for the replay engine, so an automated end-to-end
suite would need a mock Telegram transport; consider this a good next
addition before scaling beyond manual QA.
