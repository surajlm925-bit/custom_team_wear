# Security Hardening Checklist — Post-Audit (2026-10-06)

Status of every finding from the pre-deploy security audit (see
`docs/superpowers/specs/2026-10-06-emovur-integration-design.md` for context).

## CRITICAL — fix before going live

| ID | Finding | Status | Where |
|---|---|---|---|
| **C1** | Webhook POST did not verify Meta's `X-Hub-Signature-256` HMAC-SHA256. | **Fixed** | `api/webhook.ts` — `verifyMetaSignature()` activates when `META_APP_SECRET` is set; constant-time `timingSafeEqual`; missing/invalid → 401. |
| **C2** | Outbound base URL hard-coded to Meta; no Emovur support. | **Fixed** | `src/config/env.ts` adds `META_API_BASE_URL` (HTTPS-validated, default `https://graph.facebook.com`); `src/whatsapp/metaClient.ts` reads it; deployment overrides to `https://metagraph.backendprod.com`. |
| **C3** | Webhook dumped full message bodies + headers to stdout. | **Fixed** | `api/webhook.ts` — `summarizePayload()` masks phones, omits message contents and headers; `src/whatsapp/metaClient.ts` no longer logs message body or image URLs. |
| **C4** | `mockup-delivery` silently fell back to `META_WEBHOOK_SECRET`. | **Fixed** | `api/mockup-delivery.ts` — fail-closed (503) when `INTERNAL_MOCKUP_SECRET` is unset. Different trust boundary now has a different secret. |

## HIGH — fix in first week after launch

| ID | Finding | Status | Where |
|---|---|---|---|
| **H1** | Admin actions (e.g. `admin:confirm:<orderId>`) gated only by `input.startsWith("admin:")`; any phone sending a matching text fires admin actions. | **Open** | `src/bot/index.ts:39-46` — needs an `ADMIN_CHAT_IDS.includes(senderFrom)` guard around `handleAdminAction`. Not in scope for the Emovur-integration PR; do before the bot is publicly reachable. |
| **H2** | `META_API_TOKEN` is a USER token with broad scopes (incl. `public_profile`). | **Open** | Outside this codebase — request a System User token from Meta App Dashboard → Business Settings → System Users, scoped to the WABA. Update Vercel env var. |
| **H3** | `.env*` files committed to local working tree (gitignored but worth a `git ls-files .env*` sanity check). | **Open** | Run on the user's machine: `git -C "D:\Work Code\Projects\custom team wear\app" ls-files .env*` — expect empty output. |
| **H4** | (folded into C2.) | — | — |

## MEDIUM — fix as bandwidth allows

| ID | Finding | Status |
|---|---|---|
| **M1** | `MOCKUP_PAID_PRICE_INR` defaults to `20` (ok) and `MOCKUP_FREE_PER_MONTH` defaults to `1` while the README says `3`. | **Open** — pick one canonical value, update both default and docs. |
| **M2** | `metaClient.ts` retries only on body status; no exponential backoff, no rate-limit handling for Meta's 80 mps limit. | **Open** |
| **M3** | `src/whatsapp/types.ts` has unused `Zaptilo*` interfaces. | **Open** — separate small cleanup PR. |
| **M4** | Google Sheet has full customer PII with no field-level ACL. | **Open** — depends on threat model; consider a restricted tab or per-field sheet. |
| **M5** | Admin actions have no expiry — clicking an old button still confirms. | **Open** — store an `exp` timestamp alongside `admin:<action>:<orderId>` and reject on stale. |

## LOW / monitor

- Telemetry from Emovur or Meta (delivery status callbacks) goes through
  `X-Hub-Signature-256` like messages; covered by the C1 fix.
- Sentry DSN exposed in env (not in source). Sensible.

## Done well

- Constant-time comparison on the `mockup-delivery` secret check (was already
  correct).
- Dedup on `message.id` (24h TTL SETNX in Redis).
- Rate-limit + per-chat busy lock.
- Sheet formula-injection sanitizer.
- Indian phone validator.
- `/api/health` deliberately exposes only build metadata, no secrets.

## Verification commands

```bash
# 1. Type-check (must succeed).
npx tsc -p tsconfig.json --noEmit

# 2. Test suite (must be 86/86 passing).
npm test

# 3. Re-confirm no .env in git.
git ls-files .env*   # should output no rows.

# 4. Confirm no PII in webhook logs after a test POST.
grep -c 'message.body' vercel_logs.txt  # expect 0 hits
grep -c 'maskPhone' vercel_logs.txt     # expect > 0
```

## Last touched

- 2026-10-06 — first audit + critical fixes (C1, C2, C3, C4) in the
  Emovur-integration PR.
- Status of remaining H/M items to be re-reviewed at first production deploy.