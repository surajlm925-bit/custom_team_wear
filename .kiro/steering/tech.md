# Tech Stack

## Runtime & Hosting
- **Vercel Serverless Functions** (webhook-only; no long polling).
- Telegram webhook registered with a `secret_token`; every invocation validates `X-Telegram-Bot-Api-Secret-Token` (mismatch → 401).
- Fast-ACK pattern: respond 200 immediately, deduplicate on `update_id` (`upd:<update_id>`), and serialize per chat using Redis locks (`lock:<chat_id>`).

## Core Libraries
| Purpose | Library |
|---|---|
| Telegram bot framework | grammY (`grammy`, `@grammyjs/conversations`) |
| Session & Cache store | Upstash Redis (`@upstash/redis`, HTTP client, 24h TTL) |
| Rate limiting | `@upstash/ratelimit` |
| Image processing / Mockups | `sharp` (pixel-accurate deterministic compositing) |
| Durable blob storage | `@vercel/blob` |
| QR generation | `qrcode` (renders `upi://pay` PNG data URLs) |
| CRM / Persistent ledger | `google-spreadsheet` + `google-auth-library` |
| PDF rasterization | `mupdf` (catalog extraction from quality/ PDFs) |
| Error alerting | `@sentry/node` |
| Test runner | Node.js native test runner (`node --import tsx --test`) |

**Zero AI for conversation and pricing.** System is 100% deterministic — no conversational LLMs, no hallucinated prices.

## Data Stores
- **Upstash Redis**:
  - `sess:<chat_id>`: conversation session state (24h TTL).
  - `draft:<chat_id>`: transient order builder (24h TTL).
  - `order:<order_id>`: immutable order snapshot.
  - `oid:YYMMDD`: daily atomic order-ID sequence (`INCR`).
  - `upd:<update_id>`: webhook deduplication marker (24h TTL).
  - `lock:<chat_id>`: distributed concurrency lock (15s TTL).
  - `mockup:quota:<chat_id>:<YYYY-MM>`: monthly mockup quota counter (Asia/Kolkata).
- **Google Sheets**:
  - `Orders` tab: CRM master ledger.
  - `Catalog Selections` tab: Detailed garment style/color audit.
  - `Mockup Generations` tab: Mockup lifecycle and admin payment proof log.
- **Vercel Blob**: Permanent image storage for rendered garment mockups.

## Verified Common Commands
- Install deps: `npm install`
- Run test suite (102+ tests): `npm test`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Local serverless dev: `vercel dev`
- Deploy to Vercel: `vercel deploy` / `vercel deploy --prod`
- Register webhook: `npm run set-webhook -- <deployment-url>`
- Inspect webhook status: `npm run webhook-info`
- Regenerate catalog from PDFs: `npm run generate-catalog`

## Security Requirements
- Webhook secret enforced on 100% of Telegram requests.
- All monetary values computed server-side in `src/pricing/`.
- Admin-only actions strictly gated by `chat_id ∈ ADMIN_CHAT_IDS` checked server-side.
- Formula-injection sanitizer (`sanitizeForSpreadsheet`) on every sheet-bound string.
