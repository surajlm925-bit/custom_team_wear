/**
 * Ensures the minimal environment variables getEnv() requires are present
 * before any app module that calls getEnv() at first-use is invoked.
 * Import this at the TOP of any test that transitively touches getEnv()
 * (quota, env-derived pricing, etc). Values are throwaway test doubles —
 * no real Upstash/Telegram/Sheets access happens because Redis is faked
 * and the AI provider / blob uploader are injected.
 */

const DEFAULTS: Record<string, string> = {
  CHANNEL: "whatsapp",
  TELEGRAM_BOT_TOKEN: "123456:TEST-token",
  WEBHOOK_SECRET: "test-webhook-secret",
  ADMIN_CHAT_IDS: "999",
  MERCHANT_VPA: "test@upi",
  STATIC_QR_URL: "https://example.com/qr.png",
  REDIS_REST_URL: "https://example.upstash.io",
  REDIS_REST_TOKEN: "test-redis-token",
  GOOGLE_SERVICE_ACCOUNT_JSON: '{"client_email":"test@test.iam","private_key":"x"}',
  SHEET_ID: "test-sheet-id",
  MOCKUP_FREE_PER_MONTH: "1",
  MOCKUP_PAID_PRICE_INR: "20",
  META_API_TOKEN: "test",
  META_PHONE_NUMBER_ID: "1234567890",
  META_BUSINESS_ACCOUNT_ID: "0987654321",
  META_WEBHOOK_SECRET: "test-webhook-secret",
};

for (const [k, v] of Object.entries(DEFAULTS)) {
  if (!process.env[k]) process.env[k] = v;
}

export {};
