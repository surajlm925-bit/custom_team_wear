/**
 * Non-secret build/version identifiers used to prove WHICH build is
 * actually running on a given deployment (the deploy-lag diagnosis).
 *
 * BUILD_STAMP is bumped by hand whenever we want an unambiguous marker in
 * the running code; VERCEL_GIT_COMMIT_SHA/REF are injected automatically
 * by Vercel at build time and pin the exact commit the deployment was
 * built from. FEATURE_FLAGS advertise capabilities present in THIS build,
 * so /api/health can confirm the catalog/colour/deterministic-mockup code
 * is live without needing to run a full Telegram flow.
 *
 * None of these are secrets — they're safe to expose on a public health
 * endpoint and to log.
 */

export const BUILD_STAMP = "2026-09-11-redesigned-order-flow-with-trial-sample";

export interface BuildInfo {
  buildStamp: string;
  commitSha: string;
  commitRef: string;
  commitMessage: string;
  /** Capabilities compiled into this build — quick "is the new code live?" check. */
  features: {
    catalogColourFlow: boolean;
    fiftyPercentAdvance: boolean;
    deterministicMockup: boolean;
    mockupBeforePayment: boolean;
  };
}

export function getBuildInfo(): BuildInfo {
  return {
    buildStamp: BUILD_STAMP,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
    commitRef: process.env.VERCEL_GIT_COMMIT_REF ?? "unknown",
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "unknown",
    features: {
      catalogColourFlow: true,
      fiftyPercentAdvance: true,
      deterministicMockup: true,
      mockupBeforePayment: true,
    },
  };
}
