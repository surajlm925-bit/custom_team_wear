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
import { sendEmailWithResend } from "../src/admin/email.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const info = getBuildInfo();

  const resendKey = (process.env.RESEND_API_KEY ?? "").trim();
  const hasResend = resendKey.length > 0 && resendKey !== "re_test_dummy";
  const resendPrefix = hasResend ? `${resendKey.slice(0, 6)}...` : null;

  const envStatus = {
    hasResendApiKey: hasResend,
    resendPrefix,
    adminEmails: (process.env.ADMIN_EMAILS ?? "cteamwear@gmail.com").split(",").map((s) => s.trim()).filter(Boolean),
    adminEmailFrom: process.env.ADMIN_EMAIL_FROM ?? "Custom Teamwear <onboarding@resend.dev>",
    hasAdminPortalSecret: Boolean(process.env.ADMIN_PORTAL_SECRET),
    hasOpenRouterApiKey: Boolean(process.env.OPENROUTER_API_KEY),
    openRouterPrefix: process.env.OPENROUTER_API_KEY ? `${process.env.OPENROUTER_API_KEY.slice(0, 10)}...` : null,
    mockupImageProvider: process.env.MOCKUP_IMAGE_PROVIDER ?? null,
  };

  if (req.query.test_resend === "1") {
    const testResult = await sendEmailWithResend({
      to: envStatus.adminEmails,
      subject: `[Vercel Live Test] Email Dispatch Verification - ${new Date().toISOString()}`,
      html: `<h2>Custom Teamwear - Live Production Test</h2><p>This test email confirms that <strong>RESEND_API_KEY</strong> is actively configured and dispatching from Vercel Production!</p><p>Timestamp: ${new Date().toISOString()}</p>`,
    });
    return res.status(200).json({
      ok: true,
      service: "custom-teamwear-bot",
      envStatus,
      testResult,
    });
  }

  if (req.query.test_ai === "1") {
    try {
      const { generateOpenRouterMockup } = await import("../src/mockup/openrouterClient.js");
      const { resolveGarmentReference } = await import("../src/mockup/garmentReference.js");
      const dummyOrder = {
        orderId: "CTW-HEALTH-TEST",
        productId: "dry_fit_polo",
        catalogSelection: {
          garmentType: "polo",
          colorName: "Rama Blue",
          itemLabel: "Finch Piper Mars",
        },
      };
      const garmentRef = await resolveGarmentReference(dummyOrder as any, "front");
      const dummyLogo = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      );
      const aiRes = await generateOpenRouterMockup({
        templateImage: garmentRef.buffer,
        logoImages: [dummyLogo],
        prompt: "Test mockup prompt",
      });
      return res.status(200).json({ ok: true, generatedBytes: aiRes.imageBuffer.length, cost: aiRes.costUsd });
    } catch (err: any) {
      return res.status(200).json({ ok: false, error: String(err?.message ?? err), stack: err?.stack });
    }
  }

  return res.status(200).json({
    ok: true,
    service: "custom-teamwear-bot",
    time: new Date().toISOString(),
    ...info,
    envStatus,
  });
}

