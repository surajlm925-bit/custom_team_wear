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

/**
 * Default outbound API base. Meta's Cloud API uses graph.facebook.com; an
 * approved Tech Provider (e.g. Emovur) can be substituted by overriding
 * META_API_BASE_URL in the deployment environment. The URL is normalised
 * to strip trailing slashes so call sites can append paths without
 * double-slashes.
 */
const DEFAULT_META_API_BASE_URL = "https://graph.facebook.com";

export interface Env {
  CHANNEL: "whatsapp";
  META_API_TOKEN: string;
  META_PHONE_NUMBER_ID: string;
  META_BUSINESS_ACCOUNT_ID: string;
  META_WEBHOOK_SECRET: string;
  /**
   * Base URL for outbound Cloud API calls. Defaults to Meta's graph.facebook.com.
   * When using a Tech Provider (e.g. Emovur at https://metagraph.backendprod.com),
   * set META_API_BASE_URL to the provider's wrapper endpoint — the rest of the
   * URL is built as `${META_API_BASE_URL}/${META_PHONE_NUMBER_ID}/messages`.
   *
   * Must be HTTPS. CSP / webhook configuration is unchanged either way.
   */
  META_API_BASE_URL: string;
  /**
   * Meta App Secret — used to verify the X-Hub-Signature-256 HMAC-SHA256
   * signature on inbound webhook POSTs (Meta's standard).
   *
   * Optional because Tech Providers (e.g. Emovur) may not expose the Meta
   * app secret directly to their customers. When UNSET the webhook logs
   * a WARN once per cold start and accepts unverified POSTs — this is a
   * temporary posture. Get the app secret from Meta App Dashboard ->
   * Settings -> Basic -> App Secret (or ask the Tech Provider) and set
   * META_APP_SECRET as soon as practical.
   */
  META_APP_SECRET?: string;
  ADMIN_CHAT_IDS: string[];
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
  /**
   * Shared secret protecting the internal /api/mockup-delivery endpoint
   * (see src/mockup/deliverTrigger.ts). MUST be a separate value from
   * META_WEBHOOK_SECRET — different trust boundary (internal paid-AI
   * trigger vs internet-facing webhook). Fail-closed when unset.
   */
  INTERNAL_MOCKUP_SECRET?: string;
  /** Explicit override for the base URL used to call /api/mockup-delivery. Falls back to Vercel's system env vars. */
  PUBLIC_BASE_URL?: string;
  /**
   * Vercel Blob read/write token — durable storage for generated mockup
   * images (src/storage/blob.ts). When unset, generated images are still
   * sent to WhatsApp but not persisted to Blob (the generation record
   * When unset, mockup images are NOT deliverable (generation fails
   * gracefully and escalates) — Blob storage is mandatory for proofs.
   * Auto-populated by Vercel when a Blob store is
   * linked; set BLOB_READ_WRITE_TOKEN locally for `vercel dev`.
   */
  BLOB_READ_WRITE_TOKEN?: string;
  /** Price (in whole rupees) charged per paid mockup generation once the monthly free quota is exhausted. */
  MOCKUP_PAID_PRICE_INR: number;
  /** Number of free mockup generations allowed per chat per Asia/Kolkata calendar month. */
  MOCKUP_FREE_PER_MONTH: number;
}

const DEFAULT_MOCKUP_PAID_PRICE_INR = 20;
const DEFAULT_MOCKUP_FREE_PER_MONTH = 1;

function optionalPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${name} must be a non-negative integer (got "${raw}").`);
  }
  return n;
}

let cached: Env | undefined;

/** Loads and validates env vars. Cached per cold start. */
export function getEnv(): Env {
  if (cached) return cached;

  const channel = required("CHANNEL");
  if (channel !== "whatsapp") {
    throw new Error(
      `Unsupported CHANNEL "${channel}". Only "whatsapp" is supported.`,
    );
  }

  const adminIdsRaw = required("ADMIN_CHAT_IDS");
  const adminChatIds = adminIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
    
  if (adminChatIds.length === 0) {
    throw new Error("ADMIN_CHAT_IDS must contain at least one chat id.");
  }

  const apiBaseUrlRaw = (process.env["META_API_BASE_URL"] ?? DEFAULT_META_API_BASE_URL).trim();
  // Normalise: strip trailing slashes so callers can append "/<phone_id>/messages"
  // without accidentally producing "//messages".
  const apiBaseUrl = apiBaseUrlRaw.replace(/\/+$/, "");
  if (!/^https:\/\//i.test(apiBaseUrl)) {
    throw new Error(
      `META_API_BASE_URL must be an https:// URL (got "${apiBaseUrlRaw}"). ` +
        `Refusing to send the bearer token over a non-TLS endpoint.`,
    );
  }

  const metaAppSecret = optional("META_APP_SECRET");

  cached = {
    CHANNEL: "whatsapp",
    META_API_TOKEN: required("META_API_TOKEN"),
    META_PHONE_NUMBER_ID: required("META_PHONE_NUMBER_ID"),
    META_BUSINESS_ACCOUNT_ID: required("META_BUSINESS_ACCOUNT_ID"),
    META_WEBHOOK_SECRET: required("META_WEBHOOK_SECRET"),
    META_API_BASE_URL: apiBaseUrl,
    META_APP_SECRET: metaAppSecret,
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
    INTERNAL_MOCKUP_SECRET: optional("INTERNAL_MOCKUP_SECRET"),
    PUBLIC_BASE_URL: optional("PUBLIC_BASE_URL"),
    BLOB_READ_WRITE_TOKEN: optional("BLOB_READ_WRITE_TOKEN"),
    MOCKUP_PAID_PRICE_INR: optionalPositiveInt("MOCKUP_PAID_PRICE_INR", DEFAULT_MOCKUP_PAID_PRICE_INR),
    MOCKUP_FREE_PER_MONTH: optionalPositiveInt("MOCKUP_FREE_PER_MONTH", DEFAULT_MOCKUP_FREE_PER_MONTH),
  };
  return cached;
}
