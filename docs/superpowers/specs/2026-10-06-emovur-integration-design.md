# WhatsApp Emovur Integration + Webhook Hardening — Design

**Date:** 2026-10-06
**Status:** Draft, awaiting approval
**Owner:** mavis (MiniMax Code)
**Author context:** Sales automation bot (`custom-teamwear-bot`). User is going through Emovur (Meta Tech Provider, India) with base URL `https://metagraph.backendprod.com/v20.0`. Token is from Emovur, not direct Meta.

---

## Goal

Wire the existing `app/` codebase to the Emovur Meta API endpoint and ship the webhook with the three CRITICAL security fixes called out in the pre-deploy audit:

1. **C1** — verify Meta's `X-Hub-Signature-256` on every webhook POST.
2. **C2** — point outbound calls at `META_API_BASE_URL` (configurable; default `https://graph.facebook.com`).
3. **C3** — stop logging full message bodies and headers; log only message-id/chat-id/type.

## Non-goals

- Refactoring the conversation flow or sheet schema.
- Migrating away from the existing `customerChatId` "wa:" prefix scheme.
- Switching to direct Meta (out of scope — user is on Emovur).
- Generating Meta's System User token (requires Meta dashboard access).
- Cleaning up the unused `Zaptilo` types in `src/whatsapp/types.ts` (separate task).
- Verifying the H1 admin-authorization gap (separate task).

## Decisions (with rationale)

| Decision | Choice | Why |
|---|---|---|
| Where the API base URL lives | New env var `META_API_BASE_URL`, defaults to `https://graph.facebook.com` | (a) Keeps a safe fallback if env not set; (b) avoids hard-coding the BSP URL in source; (c) lets the user switch back to direct Meta without code changes. |
| Auth on `metaClient.ts` | Read base URL from `getEnv()`, append `/${META_PHONE_NUMBER_ID}/messages` | Mirrors existing structure; no behaviour change other than hostname. |
| Signature scheme on POST | HMAC-SHA256 over the raw body, hex-encoded, compared against `X-Hub-Signature-256` (or `X-Hub-Signature` for legacy SHA1). Activated when `META_APP_SECRET` is set. | Matches Meta's published spec; most BSPs (incl. Emovur, Zaptilo, Twilio, 360dialog) forward Meta's signature header unmodified. If Emovur strips the header, the user can clear `META_APP_SECRET` to restore inbound while we capture device-info for later. |
| Bypass mechanism | If `META_APP_SECRET` is empty, webhook logs a single `WARN` per cold start and proceeds | Allows the user to test with Emovur before obtaining the Meta app secret. Once we know whether Emovur forwards `X-Hub-Signature-256`, set the secret and the check engages. |
| Log redaction | Replace `console.log("[webhook] body:", ...)` with a redacting helper that logs only `object`, `entry[].id`, `value.metadata.display_phone_number`, `value.metadata.phone_number_id`, and per-message: `id`, `from` (masked), `type`, `timestamp`. Drop full headers dump entirely (only `content-length` and `x-hub-signature-256` presence are useful). | Removes PII from Vercel logs. |
| `INTERNAL_MOCKUP_SECRET` fallback to `META_WEBHOOK_SECRET` | Remove the silent fallback. Require `INTERNAL_MOCKUP_SECRET` separately. Log a `WARN` on cold start if not set, and reject calls. | C4 from audit. Different trust boundaries must have different secrets. |

## Files changed

| File | Change |
|---|---|
| `src/config/env.ts` | Add `META_API_BASE_URL` (default `https://graph.facebook.com`), `META_APP_SECRET` (optional), deprecate fallback for `INTERNAL_MOCKUP_SECRET`. Add validation of `META_API_BASE_URL` shape (https only). |
| `src/whatsapp/metaClient.ts` | Pull base URL from `getEnv()`. |
| `api/webhook.ts` | Add `verifyMetaSignature()` helper using `crypto.timingSafeEqual`. Add redacting `summarizePayload()`. Remove header/body dumps. |
| `api/mockup-delivery.ts` | Replace silent fallback with hard rejection + WARN log. |
| `.env.example` | Document `META_API_BASE_URL`, `META_APP_SECRET`, clarify `INTERNAL_MOCKUP_SECRET`. |
| `docs/whatsapp-migration/whatsapp-phase4-emovur-integration.md` | Integration runbook (emovur-specific). |
| `docs/whatsapp-migration/security-hardening-checklist.md` | Audit C1-C4 + H1-H3 statuses and what remains. |

## New env vars

```bash
# META_API_BASE_URL — base for outbound Cloud API calls.
# Direct Meta (production-grade): https://graph.facebook.com
# Emovur (BSP wrapper, your current provider): https://metagraph.backendprod.com
# Leave unset in dev unless you have a real token.
META_API_BASE_URL=https://graph.facebook.com

# META_APP_SECRET — used to verify HMAC-SHA256 signature on webhook POSTs.
# Get this from Meta App Dashboard -> WhatsApp -> Configuration (the "App Secret"
# field on the App's Basic Settings). When unset, webhook logs a warning and
# accepts unverified POSTs — only do this for short windows.
META_APP_SECRET=

# INTERNAL_MOCKUP_SECRET — required, no fallback to META_WEBHOOK_SECRET.
# A long random string distinct from META_WEBHOOK_SECRET. Used in the
# x-internal-api header on /api/mockup-delivery calls.
INTERNAL_MOCKUP_SECRET=
```

## Flow: webhook POST

1. Read raw body bytes (before JSON parse) — needed for HMAC.
2. If `META_APP_SECRET` set: compute HMAC-SHA256 over raw body with the secret, compare against `X-Hub-Signature-256` using `timingSafeEqual`. If missing or mismatch → 401.
3. Parse JSON.
4. Build a redacted summary `{ object, entries: [{ id, phone: metadata.display_phone_number, messages: [{ id, from_masked, type, ts }] }] }` and log it.
5. Existing dedupe + handleMessage logic unchanged.

## Flow: outbound message

1. `metaFetch('/messages', body)` reads `META_API_BASE_URL` + `META_PHONE_NUMBER_ID` from env.
2. URL becomes `${META_API_BASE_URL}/${META_PHONE_NUMBER_ID}/messages`.
3. No other behaviour change.

## Flow: mockup-delivery

1. Always require `INTERNAL_MOCKUP_SECRET`. If unset, cold-start fail.
2. Existing `x-internal-api` check stays.

## Acceptance criteria

- `npm run typecheck` passes.
- `npm test` passes (no new tests required for this scope).
- Manual: hit `/api/webhook` GET with the right `hub.verify_token` → 200. With wrong token → 403.
- Manual: hit `/api/webhook` POST with no `X-Hub-Signature-256` and `META_APP_SECRET` set → 401.
- Manual: hit `/api/webhook` POST with a valid signature and a sample `whatsapp_business_account` payload → 200, redacted log line.
- Manual: `metaFetch('/messages', …)` reads `META_API_BASE_URL` from env, not a hard-coded value. Verified via a one-off `tsx` script that monkey-patches `process.env` and asserts the constructed URL.

## Rollback

All changes are additive; reverting `META_API_BASE_URL` to default re-enables direct Meta, and clearing `META_APP_SECRET` reverts signature bypass. No schema migrations.

## Open questions / followups (not in this PR)

- H1 — verify admin actions come from a `from` in `ADMIN_CHAT_IDS`.
- H3 — confirm none of `app/.env`, `app/.env.local`, `app/.env.vercel` are committed (`git ls-files .env*`).
- M — replace `META_PAID_PRICE_INR` default `1` with documented `3` (the env.ts:59 default is `1`, README says `3`).
- M — `src/whatsapp/types.ts` has unused `Zaptilo*` interfaces; remove in a separate small PR.
- Confirm Emovur forwards `X-Hub-Signature-256` by sending a test webhook from their dashboard and inspecting headers in Vercel logs (a special debug log line — added behind a `META_DEBUG_WEBHOOK` env var).