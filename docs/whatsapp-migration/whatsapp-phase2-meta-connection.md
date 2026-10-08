# Phase 2 — Meta Connection Report

## 1. What was verified
Verified that the existing integration natively supports the Meta WhatsApp Cloud API format for webhooks and outbound messaging. The webhook handles Meta's verification challenge and payload format properly, and the outbound client correctly points to the Graph API.

## 2. WABA → Phone Number relationship
Blocked. Could not verify whether `3418179021714024` contains `1305427425990910` because no active Meta token is available in `.env` (it contains the placeholder `your-meta-api-token`).

## 3. Token/API access
Blocked. A real connectivity check could not be completed because the `META_API_TOKEN` is unavailable in the environment. Thus, we cannot confirm if the missing permission issue is resolved.

## 4. Outbound API
File: `src/whatsapp/metaClient.ts`
- **Endpoint:** `https://graph.facebook.com/v20.0/${env.META_PHONE_NUMBER_ID}/messages`
- **API Version:** v20.0 (Appropriate and recent).
- **Authentication Method:** Bearer token in the `Authorization` header using `META_API_TOKEN`.
- **Result:** Verified correct implementation format natively supporting Meta.

## 5. Webhook
File: `api/webhook.ts`
- **GET verification:** Properly validates `hub.mode === 'subscribe'` and matches `hub.verify_token` against `META_WEBHOOK_SECRET`. Responds with `hub.challenge` on success, `403` on failure.
- **POST message handling:** Parses `payload.object === 'whatsapp_business_account'`, iterates through `entry[].changes[].value.messages[]`, performs deduplication (`claimUpdate`), and passes to the bot engine via `handleMessage`.

## 6. Vercel webhook URL
Verified from `.vercel/project.json`. The Vercel project name is `custom-teamwear-bot`. Assuming default Vercel deployment URL format, the webhook URL is:
`https://custom-teamwear-bot.vercel.app/api/webhook`

## 7. WABA subscription
Blocked. The app's subscription to the WABA could not be verified automatically due to missing API credentials. This must be manually checked and configured in the Meta Developer Dashboard.

## 8. Changes made
No production files were modified, as the existing setup is already fully capable of handling the Meta API format natively. A local testing script (`scratch_webhook_test.ts`) was created to simulate and verify the webhook logic locally without external dependencies. No additional environment variables were needed.

## 9. Tests
Ran `node --env-file=.env --import tsx scratch_webhook_test.ts` to test:
- **Webhook GET verification success**: Passed (Result: 200).
- **Webhook GET verification failure**: Passed (Result: 403).
- **Invalid POST Payload**: Passed (Logs warning and returns 200 `EVENT_RECEIVED`).
- **Missing environment variables**: Passed (The `getEnv()` function throws fast on cold start when variables like `CHANNEL` are missing, which was verified before passing `--env-file=.env`).
- **Valid inbound payload & Outbound construction**: The code logic was manually reviewed and found to match Meta's JSON specs exactly. Local script execution for outbound requests failed fast due to the invalid placeholder token.

## 10. Remaining manual Meta steps
1. Generate a valid System User token with `whatsapp_business_messaging` permissions from the Meta Business Settings.
2. Update `.env` (and Vercel environment variables) with the actual `META_API_TOKEN`.
3. Verify that the Phone Number ID belongs to the given WABA.
4. Manually configure the Vercel webhook URL in the Meta App Dashboard and verify it triggers correctly.

## 11. Final status
BLOCKED
