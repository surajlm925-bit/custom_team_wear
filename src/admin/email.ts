import { getEnv } from "../config/env.js";
import type { OrderData } from "../shared/types.js";

const RESEND_API_URL = "https://api.resend.com/emails";
const EMAIL_TIMEOUT_MS = 8000;

interface SendEmailPayload {
  to: string[];
  subject: string;
  html: string;
  from?: string;
}

/**
 * Sends an email via Resend HTTPS REST API.
 * Never throws — catches errors and logs cleanly so the bot flow is not broken.
 */
export async function sendEmailWithResend(payload: SendEmailPayload): Promise<{ ok: boolean; id?: string; error?: string }> {
  const env = getEnv();
  const apiKey = env.RESEND_API_KEY;

  if (!apiKey || apiKey.trim() === "" || apiKey === "re_test_dummy") {
    console.warn(`[email] RESEND_API_KEY is not configured. Simulating email dispatch to: ${payload.to.join(", ")}`);
    console.log(`[email] Subject: ${payload.subject}`);
    return { ok: true, id: `mock-${Date.now()}` };
  }

  const from = payload.from || env.ADMIN_EMAIL_FROM || "Custom Teamwear <onboarding@resend.dev>";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const bodyText = await res.text();
    if (!res.ok) {
      console.error(`[email] Resend API error (${res.status}): ${bodyText}`);
      return { ok: false, error: `Resend HTTP ${res.status}: ${bodyText}` };
    }

    try {
      const data = JSON.parse(bodyText);
      console.log(`[email] Successfully dispatched email via Resend (ID: ${data.id}) to ${payload.to.join(", ")}`);
      return { ok: true, id: data.id };
    } catch {
      return { ok: true };
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error(`[email] Failed to dispatch email via Resend:`, err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Formats size split for clean email table display.
 */
function renderSizeSplitHtml(sizeSplit: Record<string, number>): string {
  const entries = Object.entries(sizeSplit).filter(([_, qty]) => qty > 0);
  if (entries.length === 0) return "<span>None</span>";
  return entries
    .map(
      ([size, qty]) =>
        `<span style="display:inline-block; background:#f1f5f9; padding:4px 10px; border-radius:4px; margin:2px; font-size:12px; font-weight:600; color:#334155;"><strong>${size}:</strong> ${qty}</span>`,
    )
    .join(" ");
}

/**
 * Sends the comprehensive New Bulk Order Alert email to admins.
 * Contains order summary, payment proof preview, 30-min OTP code, portal link,
 * and the fail-safe "Request Secondary OTP (Beyond 30 mins)" button.
 */
export async function sendAdminOrderAlertEmail(
  order: OrderData,
  code: string,
  portalUrl: string,
  resendOtpUrl: string,
  screenshotUrl?: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const env = getEnv();
  const recipients = env.ADMIN_EMAILS;

  const subject = `🛒 NEW BULK ORDER ALERT: ${order.orderId} (₹${order.advanceDue.toLocaleString("en-IN")} Advance)`;

  const sizesHtml = renderSizeSplitHtml(order.sizeSplit);
  const screenshotSection = screenshotUrl
    ? `
      <div style="margin-top: 24px; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="font-weight: 700; font-size: 14px; color: #1e293b; margin-bottom: 12px;">📸 Customer Payment Screenshot</div>
        <div style="text-align: center;">
          <a href="${screenshotUrl}" target="_blank" style="display: inline-block;">
            <img src="${screenshotUrl}" alt="Payment Proof" style="max-width: 100%; max-height: 380px; border-radius: 6px; border: 1px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.05);" />
          </a>
          <div style="margin-top: 8px;">
            <a href="${screenshotUrl}" target="_blank" style="font-size: 13px; color: #2563eb; text-decoration: underline;">Open Full Resolution Screenshot ↗</a>
          </div>
        </div>
      </div>
    `
    : `
      <div style="margin-top: 20px; padding: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; color: #64748b;">
        📸 <em>Payment screenshot uploaded on WhatsApp (View directly on portal or Meta Business Manager)</em>
      </div>
    `;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Order Alert: ${order.orderId}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1);">
    <!-- Header -->
    <tr>
      <td style="background: #0f172a; padding: 24px; text-align: center;">
        <div style="color: #94a3b8; font-size: 13px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;">Custom Teamwear</div>
        <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 6px 0 0 0;">New Bulk Order Received</h1>
        <div style="display: inline-block; background: #2563eb; color: #ffffff; font-size: 14px; font-weight: 700; padding: 4px 14px; border-radius: 20px; margin-top: 10px;">
          ${order.orderId}
        </div>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding: 24px;">
        <!-- Primary 2-Step OTP Verification Box -->
        <div style="background: #eff6ff; border: 2px dashed #3b82f6; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <div style="font-size: 13px; font-weight: 700; color: #1e40af; text-transform: uppercase; letter-spacing: 1px;">🔐 YOUR APPROVAL OTP (VALID FOR 30 MINS)</div>
          <div style="font-size: 40px; font-weight: 800; letter-spacing: 8px; color: #1d4ed8; font-family: 'Courier New', Courier, monospace; margin: 12px 0;">${code}</div>
          <div style="font-size: 13px; color: #475569; line-height: 1.4;">
            To confirm this order, tap below to open the verification portal and enter this 6-digit code in the popup.
          </div>
        </div>

        <!-- Primary Portal CTA -->
        <div style="text-align: center; margin: 24px 0;">
          <a href="${portalUrl}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 15px 32px; font-size: 16px; font-weight: 700; text-decoration: none; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.3);">
            👉 OPEN REVIEW & APPROVAL PORTAL
          </a>
        </div>

        <!-- Order Summary Card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-top: 24px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <tr style="background: #f8fafc;">
            <th colspan="2" style="padding: 12px 16px; text-align: left; font-size: 14px; font-weight: 700; color: #334155; border-bottom: 1px solid #e2e8f0;">
              📋 Order & Customer Summary
            </th>
          </tr>
          <tr>
            <td style="padding: 10px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9; width: 35%;">Customer</td>
            <td style="padding: 10px 16px; font-size: 14px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${order.name} (${order.phone})</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">City</td>
            <td style="padding: 10px 16px; font-size: 14px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${order.city}</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Timeline</td>
            <td style="padding: 10px 16px; font-size: 14px; font-weight: 600; color: ${order.timelineUrgent ? "#b91c1c" : "#0f172a"}; border-bottom: 1px solid #f1f5f9;">
              ${order.timeline} ${order.timelineUrgent ? "⚠️ (Urgent)" : ""}
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Garment / Tier</td>
            <td style="padding: 10px 16px; font-size: 14px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
              ${order.qty} pcs · ${order.tier} (${order.catalogItemName || "Custom"}, ${order.catalogColor || "Standard"})
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Sizes</td>
            <td style="padding: 10px 16px; border-bottom: 1px solid #f1f5f9;">${sizesHtml}</td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Garment Total</td>
            <td style="padding: 10px 16px; font-size: 14px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
              ₹${order.garmentTotal.toLocaleString("en-IN")} (@ ₹${order.garmentRate}/pc)
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">Print Estimate</td>
            <td style="padding: 10px 16px; font-size: 14px; color: #475569; border-bottom: 1px solid #f1f5f9;">
              ₹${order.printEstLow.toLocaleString("en-IN")} – ₹${order.printEstHigh.toLocaleString("en-IN")} (${order.printMethod})
            </td>
          </tr>
          <tr style="background: #f0fdf4;">
            <td style="padding: 12px 16px; font-size: 14px; font-weight: 700; color: #166534;">Advance Due (50%)</td>
            <td style="padding: 12px 16px; font-size: 18px; font-weight: 800; color: #15803d;">
              ₹${order.advanceDue.toLocaleString("en-IN")}
            </td>
          </tr>
        </table>

        <!-- Screenshot Section -->
        ${screenshotSection}

        <!-- ⏳ FAIL SAFE: SECONDARY OTP REGENERATION BOX -->
        <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 18px; margin-top: 28px;">
          <div style="font-weight: 700; color: #92400e; font-size: 14px; margin-bottom: 6px;">
            ⏳ FAIL-SAFE: Reviewing After 30 Minutes?
          </div>
          <p style="margin: 0 0 12px 0; font-size: 13px; color: #78350f; line-height: 1.45;">
            Verification codes automatically expire after 30 minutes for order security. If this code has expired or was lost, click the button below to immediately generate and receive a fresh secondary OTP:
          </p>
          <a href="${resendOtpUrl}" target="_blank" style="background-color: #d97706; color: #ffffff; padding: 10px 18px; font-size: 13px; font-weight: 700; text-decoration: none; border-radius: 6px; display: inline-block;">
            🔄 Request Secondary OTP (Beyond 30 mins)
          </a>
        </div>

        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.4;">
          This email was securely dispatched to authorized Custom Teamwear admins.<br>
          Token-signed link valid for 7 days.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendEmailWithResend({
    to: recipients,
    subject,
    html,
  });
}

/**
 * Sends a secondary OTP code email when requested via fail-safe (beyond 30 mins or from the modal popup).
 */
export async function sendSecondaryOtpEmail(
  orderId: string,
  newCode: string,
  portalUrl: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const env = getEnv();
  const recipients = env.ADMIN_EMAILS;

  const subject = `🔐 SECONDARY APPROVAL CODE for Order ${orderId}: [ ${newCode} ]`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Secondary OTP: ${orderId}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
    <tr>
      <td style="background: #d97706; padding: 20px; text-align: center;">
        <div style="color: #fef3c7; font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;">Custom Teamwear · Fail-Safe Security</div>
        <h1 style="color: #ffffff; font-size: 20px; font-weight: 800; margin: 4px 0 0 0;">Secondary Verification Code</h1>
        <div style="color: #ffffff; font-size: 14px; font-weight: 600; margin-top: 4px;">Order: ${orderId}</div>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px;">
        <p style="font-size: 14px; color: #475569; line-height: 1.5; margin: 0 0 20px 0;">
          A secondary verification code was requested for order <strong>${orderId}</strong> because the original code expired or a new code was generated from the portal.
        </p>

        <div style="background: #fffbeb; border: 2px dashed #d97706; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
          <div style="font-size: 12px; font-weight: 700; color: #b45309; text-transform: uppercase; letter-spacing: 1px;">🔐 YOUR NEW 6-DIGIT OTP (VALID 30 MINS)</div>
          <div style="font-size: 42px; font-weight: 800; letter-spacing: 8px; color: #b45309; font-family: 'Courier New', Courier, monospace; margin: 12px 0;">${newCode}</div>
          <div style="font-size: 12px; color: #78350f;">Enter this code in the portal popup to complete verification.</div>
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${portalUrl}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 14px 28px; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 8px; display: inline-block;">
            👉 Open Verification Portal
          </a>
        </div>

        <div style="margin-top: 20px; font-size: 12px; color: #94a3b8; text-align: center;">
          If you did not request this code, you can safely ignore this email.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendEmailWithResend({
    to: recipients,
    subject,
    html,
  });
}
