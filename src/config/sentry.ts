/**
 * Sentry error alerting (free tier) — PRD §10.4.
 * No-ops if SENTRY_DSN is not configured (e.g. local/dev testing).
 */

import * as Sentry from "@sentry/node";
import { getEnv } from "./env.js";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const env = getEnv();
  if (!env.SENTRY_DSN) return;
  Sentry.init({ dsn: env.SENTRY_DSN, tracesSampleRate: 0 });
  initialized = true;
}

export function captureException(err: unknown): void {
  if (initialized) Sentry.captureException(err);
}
