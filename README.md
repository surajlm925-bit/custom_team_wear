# Custom Teamwear — Bulk Order Bot

Click-first Telegram bot for bulk apparel orders (MOQ 50 pcs), built per
`docs/PRD-CTW-WhatsApp-Bot.md` and the steering docs in `.kiro/steering/`.

Stack: grammY + Vercel serverless functions + Upstash Redis + Google Sheets.
No AI/LLM anywhere — every screen is a template, every price is a lookup.

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

## 6. Test it on Telegram

1. Open your dev bot in Telegram (search its @username, or use the link
   BotFather gave you) and press **Start** / send `/start`.
2. Walk the full happy path: tier → product → quantity (try `49` first to
   confirm the funny rejection, then `60` or `120`) → size split → print
   method → city/name/phone → timeline → logo skip → quote card.
3. Press **Pay** → you'll get a dynamic QR (amount + Order ID baked in) plus
   the static fallback QR. Send **any photo** as your "screenshot" — the bot
   doesn't verify payment itself, a human does.
4. Check your admin chat(s): you should receive the forwarded screenshot with
   the full order card and **✅ Confirm** / **🚩 Issue** buttons.
5. Press **✅ Confirm** as the admin — the customer should get an automatic
   confirmation DM, and the Google Sheet "Orders" tab should show a
   `Confirmed` row. Press it again to confirm the idempotency guard
   ("already processed").
6. Try `/start` mid-flow to confirm the **Resume/Fresh start** prompt appears.
7. Try quantity `301` to confirm **📞 Call Me** shows up (300 should not show it).

### Debugging

- Vercel function logs: `vercel logs <deployment-url>` or the Vercel dashboard.
- If the bot doesn't respond at all, re-run `set-webhook` and check
  `getWebhookInfo`: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
  (look at `last_error_message`).
- To stop the dev bot from receiving updates (e.g. before redeploying with a
  different token), run `npm run delete-webhook`.

## 7. Switching to WhatsApp later

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

## 8. Project structure

```
api/
  webhook.ts        Telegram webhook entry point (secret check, dedupe, fast-ACK)
  heartbeat.ts       Daily cron -> admin "all good" ping
src/
  admin/             Admin card notification + Confirm/Issue action handlers
  bot/               grammY Bot composition root (session, conversations, routing)
  config/            env var loading/validation, Sentry init
  conversation/       S00-S11 flow, copy templates, keyboards, size-split collector
  pricing/           Price book (data) + pure computation functions
  qr/                UPI QR PNG generation
  session/           Redis client, dedupe, order-id counter, rate limit, status machine
  sheets/            Google Sheets CRM writer + outage-safe wrapper
  shared/            Shared render (quote/admin card), sanitizers, domain types
scripts/             set-webhook / delete-webhook CLI helpers
tests/               Unit tests for pricing, sanitizers, status machine
```

## 9. Tests

```bash
npm test          # unit tests (pricing engine, sanitizers, status machine)
npm run typecheck # tsc --noEmit
```

These cover the pure, testable core (pricing math, formula-injection
sanitizer, phone/qty validation, forward-only status transitions). The
conversation flow itself is exercised manually against live Telegram per §6 —
grammY conversations don't have an official test harness for the replay
engine, so an automated end-to-end suite would need a mock Telegram
transport; consider this a good next addition before scaling beyond manual QA.
