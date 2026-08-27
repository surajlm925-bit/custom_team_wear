# Tech Stack

No code has been written yet — this reflects the approved architecture in `docs/PRD-CTW-WhatsApp-Bot.md` (§4, §10) to follow once implementation starts.

## Runtime & Hosting
- **Vercel serverless functions** (webhook-only; no long polling — long polling doesn't work on serverless).
- Telegram webhook registered once with a `secret_token`; every invocation must validate `X-Telegram-Bot-Api-Secret-Token` (mismatch → 401 + log).
- Fast-ACK pattern: respond 200 immediately, process async-safe, dedupe on `update_id`.

## Core Libraries
| Purpose | Library |
|---|---|
| Telegram bot framework | grammY |
| Conversation flow / menus | `@grammyjs/conversations`, `@grammyjs/menu` |
| Session store | Upstash Redis (HTTP client, 24h TTL) |
| Rate limiting | `@upstash/ratelimit` (same Redis instance) |
| QR generation | `qrcode` (renders `upi://pay` PNG) |
| CRM writer | `google-spreadsheet` (service account auth) |
| Error alerting | Sentry (free tier) |

**No AI/LLM libraries.** The system is fully deterministic — no OpenAI, no NLP, no classifiers anywhere.

## Data Stores
- **Upstash Redis**: conversation session state (`sess:<chat_id>`, 24h TTL), daily order-ID counter (`oid:YYMMDD`, race-safe via `INCR`), webhook dedupe markers (`upd:<update_id>`), rate-limit buckets.
- **Google Sheets**: single "Orders" tab is the persistent CRM — one row per order/lead outcome. Service account must have access to exactly one spreadsheet (least privilege).

## Architecture Rules
- **Channel adapter interface is fixed**: `verifyRequest · sendMessage · sendMenu · sendImage · fetchMedia · onUpdate`. All Telegram-specific code lives behind this interface so a future WhatsApp adapter is a drop-in replacement (selected via `CHANNEL` env var).
- **Pricing engine is pure functions** over the config in PRD §6 — the single computational source. No price/rupee figure may be hardcoded or derived outside it.
- **One shared renderer** produces both the customer quote card and the admin card, so the two can never disagree.
- Redis session state machine only allows forward transitions through the defined status enum (PRD §8.1) — reject anything else.
- Menus must stay within the WhatsApp interactive denominator (≤10 options, ≤3 action buttons/screen) to keep the WhatsApp-portability contract intact.

## Security Requirements
- Webhook secret enforced on 100% of requests.
- All monetary values computed server-side; client only contributes validated integers (quantity, size counts).
- Admin-only actions gated by `chat_id ∈ ADMIN_CHAT_IDS`, checked server-side.
- Formula-injection sanitizer on every sheet-bound string: strip leading `= + - @` and control characters; cap name 60 / city 40 / phone 15 chars.
- Secrets via environment variables only (Vercel encrypted). Required: `CHANNEL`, `TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET`, `ADMIN_CHAT_IDS`, `MERCHANT_VPA`, `STATIC_QR_URL`, `REDIS_REST_URL`, `REDIS_REST_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `SHEET_ID`.
- Never commit secrets; lockfile must be committed for reproducible installs.

## Environments
Dev and prod are fully isolated: separate bot token, separate spreadsheet, separate admin chat per environment. Testing must never reach real customers.

## Common Commands
No `package.json` exists yet. Once scaffolded (expected Node.js + TypeScript on Vercel), this section should be updated with the actual commands, e.g.:
- Install deps: `npm install`
- Local dev: `vercel dev`
- Deploy: `vercel deploy` / `vercel --prod`
- Test: `npm test`
- Lint: `npm run lint`

## Superseded stack (do not use)
`docs/Project-Plan-CTW-WhatsApp-Bot.md` describes an earlier direction (Next.js, Supabase/Postgres, WhatsApp Cloud API, OpenAI/LLM). This has been superseded by the approved PRD above and should not be used unless the user explicitly says otherwise.
