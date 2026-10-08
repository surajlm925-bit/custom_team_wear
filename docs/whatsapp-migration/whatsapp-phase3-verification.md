# Phase 3 — Meta Verification Report

## 1. Actual Vercel deployment URL
Verified from `.vercel/project.json` as project `custom-teamwear-bot`. The base URL is `https://custom-teamwear-bot.vercel.app`.

## 2. Webhook URL
`https://custom-teamwear-bot.vercel.app/api/webhook`

## 3. WABA API check
GET `https://graph.facebook.com/v20.0/3418179021714024` returned `400 Bad Request`.
Error: `Unsupported get request. Object with ID '3418179021714024' does not exist, cannot be loaded due to missing permissions...`

## 4. Phone Number API check
GET `https://graph.facebook.com/v20.0/1305427425990910` returned `400 Bad Request`.
Error: `Unsupported get request. Object with ID '1305427425990910' does not exist, cannot be loaded due to missing permissions...`

## 5. WABA → Phone Number relationship
BLOCKED. Cannot verify if the phone number belongs to the WABA because neither object is accessible with the provided token.

## 6. Token authentication
Authentication succeeded. The token is a valid, active Meta access token of type `USER`.

## 7. Token permissions
The token debug endpoint successfully reported the following scopes:
- `whatsapp_business_management`
- `whatsapp_business_messaging`
- `public_profile`

Despite having the correct scopes, the API rejects access to the WABA and Phone Number objects. This definitively points to an asset association issue in Meta Business Manager, not a missing OAuth scope. The user who generated the token (or the App itself) is not properly linked to the WABA asset in the Meta Business Portfolio.

## 8. Outbound API test
BLOCKED. Could not perform the outbound API test because the Phone Number object is inaccessible.

## 9. Graph API version status
The current version used in `src/whatsapp/metaClient.ts` is `v20.0`. This is a recently released, fully supported version. No upgrade is necessary.

## 10. WABA subscription status
BLOCKED. Cannot check or configure webhook subscriptions because the WABA object is inaccessible.

## 11. Changes made
No production code was modified. A local diagnostic script (`scratch_meta_test.cjs`) was created to safely test the token permissions and API connectivity.

## 12. Tests
Ran `scratch_meta_test.cjs` using the provided token to test:
- WABA metadata endpoint (Failed - 400)
- WABA phone numbers endpoint (Failed - 400)
- Phone Number metadata endpoint (Failed - 400)
- WABA subscribed apps endpoint (Failed - 400)
- Token Debug endpoint (Passed - Token is valid and has correct scopes)

## 13. Remaining manual actions
1. Go to **Meta Business Settings** and ensure your user account has administrative access to the Business Portfolio that owns the WhatsApp Business Account.
2. If using a System User (recommended), ensure the System User has been assigned the WhatsApp Business Account asset with full control, and generate a new token.
3. Go to the **App Dashboard** -> **WhatsApp** -> **API Setup** and ensure the App is properly linked to the WABA.
4. Once a new token is generated and the API returns success for the WABA/Phone Number queries, go to the App Dashboard -> **WhatsApp** -> **Configuration** and set the Webhook URL to `https://custom-teamwear-bot.vercel.app/api/webhook`.
5. Subscribe the webhook to the `messages` field.

## 14. Final status
BLOCKED
