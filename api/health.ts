/**
 * Public, non-secret health/version endpoint.
 *
 * Purpose: prove exactly WHICH build a given deployment is serving, so a
 * "the deployed bot is running an old build" problem can be confirmed
 * without any Telegram traffic. Hit it on the deployed base URL:
 *
 *   curl https://<your-deployment>/api/health
 *
 * and compare buildStamp / commitSha to what you expect. If the features
 * block shows catalogColourFlow:false or the commitSha is an old commit,
 * the deployment is stale (or you're hitting the wrong project/URL).
 *
 * Deliberately exposes NO secrets — only build metadata and capability
 * flags that are already visible in the source tree.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBuildInfo } from "../src/config/version.js";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const info = getBuildInfo();
  res.status(200).json({
    ok: true,
    service: "custom-teamwear-bot",
    time: new Date().toISOString(),
    ...info,
  });
}
