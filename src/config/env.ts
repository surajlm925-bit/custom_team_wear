/**
 * Central environment variable loader + validator.
 * Fails fast at cold start if a required secret is missing, rather than
 * failing confusingly deep inside a handler later.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : undefined;
}

export interface Env {
  CHANNEL: "telegram";
  TELEGRAM_BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  ADMIN_CHAT_IDS: number[];
  MERCHANT_VPA: string;
  STATIC_QR_URL: string;
  REDIS_REST_URL: string;
  REDIS_REST_TOKEN: string;
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
  SHEET_ID: string;
  SENTRY_DSN?: string;
  OPENROUTER_API_KEY?: string;
  MOCKUP_IMAGE_MODEL?: string;
  GEMINI_API_KEY?: string;
  MOCKUP_IMAGE_PROVIDER?: string;
}

let cached: Env | undefined;

/** Loads and validates env vars. Cached per cold start. */
export function getEnv(): Env {
  if (cached) return cached;

  const channel = required("CHANNEL");
  if (channel !== "telegram") {
    // WhatsApp adapter is architecture-ready but not implemented in v1 (PRD §2.2).
    throw new Error(
      `Unsupported CHANNEL "${channel}". Only "telegram" is implemented in v1.`,
    );
  }

  const adminIdsRaw = required("ADMIN_CHAT_IDS");
  const adminChatIds = adminIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const n = Number(s);
      if (!Number.isInteger(n)) {
        throw new Error(`ADMIN_CHAT_IDS contains a non-integer value: "${s}"`);
      }
      return n;
    });
  if (adminChatIds.length === 0) {
    throw new Error("ADMIN_CHAT_IDS must contain at least one chat id.");
  }

  cached = {
    CHANNEL: "telegram",
    TELEGRAM_BOT_TOKEN: required("TELEGRAM_BOT_TOKEN"),
    WEBHOOK_SECRET: required("WEBHOOK_SECRET"),
    ADMIN_CHAT_IDS: adminChatIds,
    MERCHANT_VPA: required("MERCHANT_VPA"),
    STATIC_QR_URL: required("STATIC_QR_URL"),
    REDIS_REST_URL: required("REDIS_REST_URL"),
    REDIS_REST_TOKEN: required("REDIS_REST_TOKEN"),
    GOOGLE_SERVICE_ACCOUNT_JSON: required("GOOGLE_SERVICE_ACCOUNT_JSON"),
    SHEET_ID: required("SHEET_ID"),
    SENTRY_DSN: optional("SENTRY_DSN"),
    OPENROUTER_API_KEY: optional("OPENROUTER_API_KEY"),
    MOCKUP_IMAGE_MODEL: optional("MOCKUP_IMAGE_MODEL"),
    GEMINI_API_KEY: optional("GEMINI_API_KEY"),
    MOCKUP_IMAGE_PROVIDER: optional("MOCKUP_IMAGE_PROVIDER"),
  };
  return cached;
}
