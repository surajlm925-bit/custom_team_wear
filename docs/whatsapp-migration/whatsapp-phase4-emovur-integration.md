# WhatsApp Phase 4 — Emovur Integration Runbook

**Date:** 2026-10-06
**Author:** mavis (MiniMax Code)
**Status:** Ready to deploy (HMAC verification active when META_APP_SECRET is set)
**Companion spec:** [docs/superpowers/specs/2026-10-06-emovur-integration-design.md](../superpowers/specs/2026-10-06-emovur-integration-design.md)

This runbook covers the production wiring of the bot with the **Emovur**
Tech Provider's wrapper of Meta's WhatsApp Cloud API.

Emovur provides two distinct URL surfaces; only one is needed for the
current conversational bot flow:

| Purpose | URL pattern |
|---|---|
| Standard Cloud API messaging (text, image, interactive buttons/lists, status) | `https://metagraph.backendprod.com/v20.0/{phone_number_id}/messages` |
| Business-initiated **template** messages (outside the 24h session window) | `https://adminapis.backendprod.com/lms_campaign/api/whatsapp/template/{template_id}/process` |

The standard Cloud API surface is what `metaFetch` already uses; only the
base URL changes from `https://graph.facebook.com` (Meta-direct) to
`https://metagraph.backendprod.com` (Emovur wrapper). All request/response
shapes, message types, and the inbound webhook payload format are
unchanged — Emovur forwards Meta's payload unchanged.

Template messages are **not** in scope for this MVP and would require a
separate `sendEmovurTemplate()` helper if you later need to fire templates
out of session (e.g. abandoned-cart reminders).

## What this PR changes

- `src/config/env.ts` — adds `META_API_BASE_URL` (default
  `https://graph.facebook.com`, must be HTTPS) and optional `META_APP_SECRET`.
- `src/whatsapp/metaClient.ts` — reads base URL from `getEnv()`. PII
  (message body / image URL) removed from log lines.
- `api/webhook.ts` — adds HMAC-SHA256 verification (constant-time) over
  the raw POST body when `META_APP_SECRET` is set. Redacts logs to mask
  customer phone numbers and to never print message contents / headers.
  Disables Vercel body parser so we have byte-exact body for HMAC.
- `api/mockup-delivery.ts` — fails closed (HTTP 503) when
  `INTERNAL_MOCKUP_SECRET` is unset. No longer falls back to
  `META_WEBHOOK_SECRET` (which would mean a leaked webhook secret also
  unlocks paid AI generations).
- `.env.example` — documents `META_API_BASE_URL`, `META_APP_SECRET`,
  clarifies `INTERNAL_MOCKUP_SECRET`.

## Deploy

1. In Vercel → Project → Settings → Environment Variables, **add**:

   | Name | Value | Notes |
   |---|---|---|
   | `META_API_BASE_URL` | `https://metagraph.backendprod.com` | BSP wrapper. |
   | `META_APP_SECRET` | (your Meta app secret) | See step 3 below — if you don't have it yet, leave unset for the test window. |
   | `INTERNAL_MOCKUP_SECRET` | a long random string | Distinct from `META_WEBHOOK_SECRET`. |
   | `META_API_TOKEN` | Emovur-issued bearer token | Same key as before; only the issuing party changes. |
   | `META_PHONE_NUMBER_ID` | `1404775792711749` | As provided. |
   | `META_BUSINESS_ACCOUNT_ID` | `1595948008687111` | WABA ID, as provided. |
   | `META_WEBHOOK_SECRET` | (your existing verify token) | Unchanged — what Emovur sends during the GET handshake. |

2. Redeploy. Hit `/api/health` first to confirm the new build is live and
   that `/api/health` returns `commitSha` matching the deploy.

3. **Get the Meta App Secret** (this is the missing piece for HMAC
   verification). The webhook in this codebase supports two paths:

   a. **You have Meta App Dashboard access** (best option):
   - Go to [developers.facebook.com/apps](https://developers.facebook.com/apps)
   - Select the app linked to the WABA
   - Settings → Basic → "App Secret" → "Show"
   - Copy it into `META_APP_SECRET`. The webhook will now reject any POST
     that doesn't carry a valid `X-Hub-Signature-256`.

   b. **You don't have Meta Dashboard access (Emovur-managed)**:
   - Ask Emovur support for the App Secret. Their security page mentions
     webhook signature verification, which means they sign or forward the
     Meta signature.
   - Until you have it, set `META_APP_SECRET=` (empty) in Vercel. The
     webhook will log one WARN at cold start and accept unverified POSTs.
     Get this set ASAP — it's the single biggest C1 finding.

4. **Configure Emovur's webhook to point at your deployment.** Emovur's
   official process (per
   [support.emovur.com](https://support.emovur.com/developers/webhooks)):
   - Log in to [admin.emovur.com](https://admin.emovur.com/)
   - Dashboard → WhatsApp → Integrations → "Create Webhook"
   - Paste your callback URL: `https://<your-deployment>.vercel.app/api/webhook`
   - Save. The dashboard generates a callback URL you can paste into
     Meta's Webhook Configuration as well (Emovur acts as an intermediary).

5. **Verify Meta's Webhook configuration in the Meta App Dashboard.**
   The standard handshake (GET) is unchanged in this PR — verify token
   is `META_WEBHOOK_SECRET`. Meta sends:
   `GET /api/webhook?hub.mode=subscribe&hub.verify_token=<META_WEBHOOK_SECRET>&hub.challenge=<challenge>`

   Response: 200 with body = the challenge value. We already handle this.

## Test

1. **Handshake**: From Meta App Dashboard Webhook → "Test" (or via curl):
   ```bash
   curl -i "https://<deployment>.vercel.app/api/webhook?hub.mode=subscribe&hub.verify_token=$META_WEBHOOK_SECRET&hub.challenge=1234"
   ```
   Expect: `200 OK`, body `1234`.

2. **Signature rejection** (when META_APP_SECRET is set):
   ```bash
   curl -i -X POST https://<deployment>.vercel.app/api/webhook \
        -H "Content-Type: application/json" \
        -d '{"object":"whatsapp_business_account","entry":[]}'
   ```
   Expect: `401 Invalid signature`.

3. **Signature acceptance** (when META_APP_SECRET is set):
   ```bash
   BODY='{"object":"whatsapp_business_account","entry":[]}'
   SIG="sha256=$(printf %s "$BODY" | openssl dgst -sha256 -hmac "$META_APP_SECRET" -hex | awk '{print $NF}')"
   curl -i -X POST https://<deployment>.vercel.app/api/webhook \
        -H "Content-Type: application/json" \
        -H "X-Hub-Signature-256: $SIG" \
        -d "$BODY"
   ```
   Expect: `200 EVENT_RECEIVED`.

4. **End-to-end**: Send a real WhatsApp message from a non-admin phone to
   the bot's number (`+91 91879 51540`). Watch Vercel logs for the
   redacted summary line, then confirm the bot's reply.

## Rollback

Set `META_API_BASE_URL` back to `https://graph.facebook.com` (and unset
`META_APP_SECRET`) and redeploy. The Cloud API call paths are byte-identical
modulo the hostname; messages and webhooks will resume flowing through Meta
directly. There is no schema migration, no versioned URL path, no data
move.

## Open questions for followup

- Confirm the App Secret is the same Meta app Emovur registers for the WABA
  (i.e. the HMAC signatures match what Emovur forwards). If they don't,
  Emovur may use a different signing scheme — we'll add it next.
- Move admin actions behind `ADMIN_CHAT_IDS` (audit H1).
- Confirm none of `.env*` files are tracked in git (`git ls-files .env*`).