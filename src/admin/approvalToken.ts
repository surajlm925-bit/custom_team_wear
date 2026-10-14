import crypto from "node:crypto";
import { getEnv } from "../config/env.js";

const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Creates a cryptographically signed portal access token for an Order ID.
 * Token format: <timestamp>.<hmac-hex>
 */
export function createPortalToken(orderId: string, timestamp = Date.now()): string {
  const secret = getEnv().ADMIN_PORTAL_SECRET;
  const payload = `${orderId}:${timestamp}`;
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${timestamp}.${hmac}`;
}

/**
 * Validates the HMAC signature and timestamp of a portal token.
 */
export function verifyPortalToken(orderId: string, token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [tsStr, providedHmac] = parts;
  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return false;

  // Check expiration (7 days)
  if (Date.now() - ts > TOKEN_MAX_AGE_MS || ts > Date.now() + 60_000) {
    return false;
  }

  const secret = getEnv().ADMIN_PORTAL_SECRET;
  const payload = `${orderId}:${ts}`;
  const expectedHmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  if (expectedHmac.length !== providedHmac.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expectedHmac, "hex"), Buffer.from(providedHmac, "hex"));
  } catch {
    return false;
  }
}

/**
 * Resolves the public base URL for portal links and webhook redirects.
 */
export function resolveBaseUrl(): string {
  const env = getEnv();
  if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionUrl) return `https://${productionUrl}`;
  const deploymentUrl = process.env.VERCEL_URL;
  if (deploymentUrl) return `https://${deploymentUrl}`;
  return "https://custom-teamwear-bot.vercel.app";
}

/**
 * Returns the secure, token-authenticated URL to the admin approval portal.
 */
export function getPortalUrl(orderId: string, token: string): string {
  const base = resolveBaseUrl();
  return `${base}/api/admin-approve?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`;
}

/**
 * Returns the direct fail-safe URL to generate and email a secondary OTP beyond 30 mins.
 */
export function getResendOtpUrl(orderId: string, token: string): string {
  const base = resolveBaseUrl();
  return `${base}/api/admin-approve?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}&action=resend_otp`;
}
