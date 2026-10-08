# WhatsApp Phase 1 Audit Report

## Current Architecture
The current WhatsApp integration receives incoming messages via a Vercel serverless function (`api/webhook.ts`). These messages are authenticated via `hub.challenge` and `hub.verify_token`, then processed by the bot engine (`src/bot/index.ts` and `src/conversation/orderFlow.ts`). Outbound messaging is done directly using `fetch` to the Meta Graph API v20.0 (`src/whatsapp/metaClient.ts`). 

## WhatsApp-related Files
- `api/webhook.ts`: The entry point for the webhook payload.
- `src/bot/index.ts`: The main handler coordinating locks, rate limits, and dispatching.
- `src/conversation/orderFlow.ts`: The conversation engine containing the state machine.
- `src/whatsapp/metaClient.ts`: Contains the methods for outbound API calls to Meta.
- `src/whatsapp/types.ts`: Contains some legacy Zaptilo type definitions that are either unused or remnant.

## Webhook Route
The webhook is located at `api/webhook.ts`.
In a production Vercel environment, the webhook URL should be configured as:
`https://<your-vercel-domain>/api/webhook`

## Outbound Messaging Implementation
Implemented in `src/whatsapp/metaClient.ts`. It directly utilizes `fetch` to make `POST` requests to `https://graph.facebook.com/v20.0/${env.META_PHONE_NUMBER_ID}/messages` using the `META_API_TOKEN` for authorization.

## Environment Variables
Defined in `.env` and `src/config/env.ts`:
- `CHANNEL` (set to `whatsapp`)
- `META_API_TOKEN`
- `META_PHONE_NUMBER_ID`
- `META_BUSINESS_ACCOUNT_ID`
- `META_WEBHOOK_SECRET`

## Zaptilo Dependencies
While `api/webhook.ts` has a comment describing it as the entry point for the "Zaptilo WhatsApp API", and `src/whatsapp/types.ts` defines types like `ZaptiloWebhookPayload`, the actual implementation logic inside `api/webhook.ts` and `src/whatsapp/metaClient.ts` uses the native Meta WhatsApp Cloud API format. Zaptilo dependencies appear to be leftover comments/types, and Zaptilo is not actively used in the payload parsing or outbound API calls.

## Existing Meta Cloud API Support
The implementation is **already fully designed for Meta WhatsApp Cloud API**.
- `api/webhook.ts` verifies the payload using `hub.mode` and `hub.verify_token` (standard Meta webhook verification).
- `api/webhook.ts` parses the incoming payload expecting `payload.object === "whatsapp_business_account"`.
- `src/whatsapp/metaClient.ts` makes outbound requests directly to `graph.facebook.com/v20.0/`.

## Vercel Compatibility
The current implementation is fully compatible with the Vercel serverless runtime. `api/webhook.ts` utilizes the standard `@vercel/node` types (`VercelRequest`, `VercelResponse`). It returns `200 EVENT_RECEIVED` promptly after processing.

## Problems Found
The user provided the following Meta API error when attempting to register the test number:
`"Unsupported post request. Object with ID '1305427425990910' does not exist, cannot be loaded due to missing permissions, or does not support this operation."`

This error strongly indicates an issue with the Meta Developer App configuration:
1. The `META_API_TOKEN` used is likely a System User token or generic token that lacks the `whatsapp_business_messaging` permission.
2. The Meta App might not be properly linked to the WhatsApp Business Account (WABA).
3. The Phone Number ID (`1305427425990910`) may be incorrect, or the token doesn't have access to this specific number.

## Recommended Next Implementation Steps
1. **Fix Meta Permissions:** Go to the Meta Developer Dashboard, ensure the app has the `WhatsApp` product added, and generate a temporary access token directly from the API Setup page to verify if the issue is token-related. 
2. **Verify IDs:** Double-check the Phone Number ID and WABA ID in the Meta dashboard.
3. **Register Webhook:** Once the permissions are fixed, register the Vercel webhook URL (`https://<domain>/api/webhook`) in the Meta dashboard using the `META_WEBHOOK_SECRET`.
4. **Cleanup Zaptilo Leftovers:** Remove the misleading Zaptilo comments in `api/webhook.ts` and the unused types in `src/whatsapp/types.ts` to avoid confusion.
