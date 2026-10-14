import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyPortalToken, getPortalUrl, getResendOtpUrl } from "../src/admin/approvalToken.js";
import {
  verifyAndConsumeApprovalCode,
  resendApprovalCode,
} from "../src/admin/approvalCode.js";
import {
  markProcessedIfFirst,
  getProcessedAction,
} from "../src/admin/actions.js";
import { loadOrderSnapshot } from "../src/session/orderStore.js";
import { updateOrderRowStatus } from "../src/sheets/client.js";
import { renderConfirmationDm } from "../src/shared/render.js";
import { sendMessage } from "../src/whatsapp/metaClient.js";
import { sendSecondaryOtpEmail } from "../src/admin/email.js";
import { getEnv } from "../src/config/env.js";

function parseBody(req: VercelRequest): Record<string, any> {
  if (typeof req.body === "object" && req.body !== null) {
    return req.body;
  }
  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      const params = new URLSearchParams(req.body);
      const out: Record<string, any> = {};
      params.forEach((v, k) => {
        out[k] = v;
      });
      return out;
    }
  }
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = req.method?.toUpperCase() || "GET";

  if (method === "GET") {
    return handleGet(req, res);
  } else if (method === "POST") {
    return handlePost(req, res);
  } else {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).send("Method Not Allowed");
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const orderId = String(req.query.orderId || "").trim();
  const token = String(req.query.token || "").trim();
  const action = String(req.query.action || "").trim();

  if (!orderId || !token) {
    return res.status(400).send(renderErrorPage("Missing Parameters", "Both orderId and token are required to access this portal."));
  }

  // Cryptographic token verification
  if (!verifyPortalToken(orderId, token)) {
    return res.status(403).send(renderErrorPage("Access Denied", "This security token is invalid or has expired (valid for 7 days)."));
  }

  // Handle direct link for secondary OTP generation: ?action=resend_otp
  let banner: { type: "success" | "info" | "warning"; message: string } | null = null;
  if (action === "resend_otp") {
    const resend = await resendApprovalCode("order", orderId);
    if (resend.ok && resend.code) {
      await sendSecondaryOtpEmail(orderId, resend.code, getPortalUrl(orderId, token));
      banner = {
        type: "success",
        message: "✅ A fresh 6-digit verification code has been dispatched to your email! Please check your inbox and enter it below.",
      };
    } else {
      banner = {
        type: "info",
        message: `⏳ Please wait ${resend.cooldownRemaining ?? 30}s before generating another code.`,
      };
    }
  }

  // Load order data
  const order = await loadOrderSnapshot(orderId);
  const processedAction = await getProcessedAction(orderId);

  return res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(renderPortalHtml({
    orderId,
    token,
    order,
    processedAction,
    banner,
  }));
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const body = parseBody(req);
  const orderId = String(body.orderId || req.query.orderId || "").trim();
  const token = String(body.token || req.query.token || "").trim();
  const action = String(body.action || "").trim();
  const code = String(body.code || "").trim();

  if (!orderId || !token) {
    return res.status(400).json({ ok: false, error: "Missing orderId or token." });
  }

  if (!verifyPortalToken(orderId, token)) {
    return res.status(403).json({ ok: false, error: "Invalid or expired security token." });
  }

  // 1. Resend OTP action
  if (action === "resend_otp") {
    const resend = await resendApprovalCode("order", orderId);
    if (!resend.ok) {
      return res.status(429).json({
        ok: false,
        error: `Please wait ${resend.cooldownRemaining}s before requesting a new code.`,
        cooldownRemaining: resend.cooldownRemaining,
      });
    }

    const portalUrl = getPortalUrl(orderId, token);
    await sendSecondaryOtpEmail(orderId, resend.code!, portalUrl);

    return res.status(200).json({
      ok: true,
      message: "Secondary verification code sent to admin email! Please check your inbox.",
    });
  }

  // 2. Payment Issue action
  if (action === "issue") {
    const existing = await getProcessedAction(orderId);
    if (existing) {
      return res.status(400).json({ ok: false, error: `Order has already been processed as: ${existing}.` });
    }

    const claimed = await markProcessedIfFirst(orderId, "issue");
    if (!claimed) {
      return res.status(400).json({ ok: false, error: "Order was already processed concurrently." });
    }

    await updateOrderRowStatus(orderId, "Payment Issue").catch((err) => {
      console.error(`[admin-approve] Failed to update sheet on issue for ${orderId}:`, err);
    });

    return res.status(200).json({
      ok: true,
      message: `Order ${orderId} has been marked as Payment Issue 🚩 in CRM.`,
    });
  }

  // 3. Confirm Payment action (Requires 6-Digit OTP)
  if (action === "confirm") {
    const existing = await getProcessedAction(orderId);
    if (existing) {
      return res.status(400).json({
        ok: false,
        error: `Order has already been processed as: ${existing}.`,
      });
    }

    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({
        ok: false,
        error: "Please enter the valid 6-digit verification code from your email.",
      });
    }

    const pending = await verifyAndConsumeApprovalCode(code);
    if (!pending) {
      return res.status(400).json({
        ok: false,
        error: "Verification code is invalid or has expired (valid for 30 minutes). Please use 'Request Secondary OTP' to receive a new code.",
      });
    }

    if (pending.id !== orderId) {
      return res.status(400).json({
        ok: false,
        error: `Verification code does not match order ${orderId}.`,
      });
    }

    const claimed = await markProcessedIfFirst(orderId, "confirm");
    if (!claimed) {
      return res.status(400).json({
        ok: false,
        error: "Order was already processed concurrently.",
      });
    }

    // Update CRM Google Sheet
    await updateOrderRowStatus(orderId, "Confirmed").catch((err) => {
      console.error(`[admin-approve] Failed to update sheet on confirm for ${orderId}:`, err);
    });

    // Send WhatsApp confirmation DM to Customer
    const orderSnap = await loadOrderSnapshot(orderId);
    let dmDelivered = false;
    if (orderSnap && orderSnap.customerChatId) {
      try {
        const customerChatId = orderSnap.customerChatId;
        const dmText = renderConfirmationDm(orderId);
        console.log(`[admin-approve] Sending confirmation DM to customer ${customerChatId} for ${orderId}`);
        await sendMessage(customerChatId, dmText);
        dmDelivered = true;
      } catch (dmErr) {
        console.error(`[admin-approve] Failed to send WhatsApp confirmation DM to customer:`, dmErr);
      }
    } else {
      console.warn(`[admin-approve] No customerChatId found for order ${orderId}`);
    }

    return res.status(200).json({
      ok: true,
      message: `Order ${orderId} confirmed successfully! Status updated in Google Sheets.${
        dmDelivered ? " Customer notified on WhatsApp." : ""
      }`,
    });
  }

  return res.status(400).json({ ok: false, error: `Unknown action: "${action}".` });
}

interface PortalRenderProps {
  orderId: string;
  token: string;
  order: any | null;
  processedAction: string | null;
  banner: { type: string; message: string } | null;
}

function renderPortalHtml(props: PortalRenderProps): string {
  const { orderId, token, order, processedAction, banner } = props;
  const env = getEnv();
  const adminEmailsText = env.ADMIN_EMAILS.join(", ");
  const isProcessed = Boolean(processedAction);

  const resendUrl = getResendOtpUrl(orderId, token);

  // Check if order was placed > 30 mins ago
  let isOlderThan30Mins = false;
  if (order?.createdAt) {
    const ageMs = Date.now() - new Date(order.createdAt).getTime();
    if (ageMs > 30 * 60 * 1000) {
      isOlderThan30Mins = true;
    }
  }

  const sizeSplitHtml = order?.sizeSplit
    ? Object.entries(order.sizeSplit)
        .filter(([_, q]) => Number(q) > 0)
        .map(
          ([s, q]) =>
            `<span class="size-badge"><strong>${s}:</strong> ${q}</span>`,
        )
        .join(" ")
    : "<em>Standard Mix</em>";

  const screenshotUrl = order?.paymentScreenshotUrl;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Verification · ${orderId}</title>
  <style>
    :root {
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --success: #16a34a;
      --success-hover: #15803d;
      --danger: #dc2626;
      --danger-hover: #b91c1c;
      --warning: #d97706;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --radius: 12px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 20px 12px 60px 12px;
    }
    .container {
      max-width: 860px;
      margin: 0 auto;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .logo {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--primary);
    }
    .order-title {
      font-size: 24px;
      font-weight: 800;
      color: var(--text);
    }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 700;
    }
    .badge-pending { background: #fef3c7; color: #92400e; }
    .badge-confirmed { background: #dcfce7; color: #166534; }
    .badge-issue { background: #fee2e2; color: #991b1b; }
    
    .banner {
      padding: 14px 18px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .banner-success { background: #dcfce7; border: 1px solid #bbf7d0; color: #166534; }
    .banner-warning { background: #fffbeb; border: 1px solid #fef3c7; color: #92400e; }
    .banner-info { background: #eff6ff; border: 1px solid #dbeafe; color: #1e40af; }

    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
    }
    @media (min-width: 768px) {
      .grid { grid-template-columns: 1.15fr 0.85fr; }
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .card-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 16px;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .info-table tr { border-bottom: 1px solid var(--border); }
    .info-table tr:last-child { border-bottom: none; }
    .info-table td { padding: 10px 0; }
    .info-table td.label { color: var(--text-muted); width: 38%; }
    .info-table td.val { font-weight: 600; color: var(--text); }
    .advance-row {
      background: #f0fdf4;
      margin-top: 12px;
      padding: 12px;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .advance-label { font-size: 14px; font-weight: 700; color: #166534; }
    .advance-val { font-size: 20px; font-weight: 800; color: #15803d; }

    .size-badge {
      display: inline-block;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      margin: 2px;
    }

    .screenshot-box {
      text-align: center;
    }
    .screenshot-img {
      max-width: 100%;
      max-height: 380px;
      border-radius: 8px;
      border: 1px solid var(--border);
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      cursor: pointer;
      transition: transform 0.2s;
    }
    .screenshot-img:hover {
      transform: scale(1.02);
    }

    .actions-card {
      margin-top: 24px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      text-align: center;
    }
    .btn-group {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 16px;
    }
    .btn {
      padding: 12px 24px;
      font-size: 15px;
      font-weight: 700;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .btn-primary { background: var(--success); color: #fff; }
    .btn-primary:hover { background: var(--success-hover); }
    .btn-secondary { background: #ffffff; color: var(--danger); border: 1px solid #fca5a5; }
    .btn-secondary:hover { background: #fee2e2; }
    .btn-warning { background: var(--warning); color: #fff; }
    .btn-warning:hover { background: #b45309; }
    .btn-disabled { opacity: 0.6; cursor: not-allowed; }

    /* Modal Styles */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.7);
      backdrop-filter: blur(4px);
      justify-content: center;
      align-items: center;
      padding: 20px;
      z-index: 9999;
    }
    .modal-content {
      background: #ffffff;
      max-width: 460px;
      width: 100%;
      border-radius: 16px;
      padding: 32px 28px;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);
      animation: modalFadeIn 0.2s ease-out;
      text-align: center;
    }
    @keyframes modalFadeIn {
      from { opacity: 0; transform: translateY(12px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .modal-title { font-size: 20px; font-weight: 800; margin-bottom: 8px; color: var(--text); }
    .modal-desc { font-size: 13px; color: var(--text-muted); line-height: 1.45; margin-bottom: 24px; }
    
    .otp-inputs {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-bottom: 20px;
    }
    .otp-input {
      width: 48px;
      height: 56px;
      font-size: 26px;
      font-weight: 800;
      text-align: center;
      border: 2px solid var(--border);
      border-radius: 8px;
      background: #f8fafc;
      color: var(--primary);
      transition: all 0.2s;
    }
    .otp-input:focus {
      outline: none;
      border-color: var(--primary);
      background: #ffffff;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }
    .modal-error {
      display: none;
      background: #fee2e2;
      border: 1px solid #fca5a5;
      color: #991b1b;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 16px;
      text-align: left;
    }
    .modal-success {
      display: none;
      background: #dcfce7;
      border: 1px solid #bbf7d0;
      color: #166534;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 16px;
    }
    .modal-failsafe {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      font-size: 13px;
      color: var(--text-muted);
    }
    .link-btn {
      background: none;
      border: none;
      color: var(--warning);
      font-weight: 700;
      cursor: pointer;
      text-decoration: underline;
      font-size: 13px;
      padding: 0;
    }
    .link-btn:disabled {
      color: var(--text-muted);
      cursor: not-allowed;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <div class="logo">Custom Teamwear · Verification Portal</div>
        <h1 class="order-title">Order ${orderId}</h1>
      </div>
      <div>
        ${
          processedAction === "confirm"
            ? '<span class="badge badge-confirmed">Confirmed ✅</span>'
            : processedAction === "issue"
            ? '<span class="badge badge-issue">Payment Issue 🚩</span>'
            : '<span class="badge badge-pending">⏳ Pending Approval</span>'
        }
      </div>
    </header>

    ${
      banner
        ? `<div class="banner banner-${banner.type}">
            <span>${banner.message}</span>
           </div>`
        : ""
    }

    ${
      !isProcessed && isOlderThan30Mins && !banner
        ? `<div class="banner banner-warning">
            <span>⏳ <strong>Order placed > 30 minutes ago:</strong> The initial verification code has likely expired. Click below to generate and email a fresh secondary OTP.</span>
            <a href="${resendUrl}" class="btn btn-warning" style="padding: 6px 14px; font-size: 12px;">🔄 Request Secondary OTP</a>
           </div>`
        : ""
    }

    <div class="grid">
      <!-- Order Summary Card -->
      <div class="card">
        <h2 class="card-title">📋 Order Details</h2>
        <table class="info-table">
          <tr>
            <td class="label">Customer</td>
            <td class="val">${order?.name || "Customer"} (${order?.phone || "—"})</td>
          </tr>
          <tr>
            <td class="label">City</td>
            <td class="val">${order?.city || "—"}</td>
          </tr>
          <tr>
            <td class="label">Timeline</td>
            <td class="val" style="color: ${order?.timelineUrgent ? "#dc2626" : "inherit"}">
              ${order?.timeline || "Standard"} ${order?.timelineUrgent ? "⚠️ (Urgent)" : ""}
            </td>
          </tr>
          <tr>
            <td class="label">Garment Tier</td>
            <td class="val">
              ${order?.qty || 0} pcs · ${order?.tier || "Standard"}
              ${order?.catalogItemName ? `(${order.catalogItemName})` : ""}
            </td>
          </tr>
          <tr>
            <td class="label">Sizes</td>
            <td class="val">${sizeSplitHtml}</td>
          </tr>
          <tr>
            <td class="label">Print Method</td>
            <td class="val">${order?.printMethod || "Standard"}</td>
          </tr>
          <tr>
            <td class="label">Garment Total</td>
            <td class="val">₹${(order?.garmentTotal || 0).toLocaleString("en-IN")} (@ ₹${order?.garmentRate || 0}/pc)</td>
          </tr>
          <tr>
            <td class="label">Print Estimate</td>
            <td class="val">₹${(order?.printEstLow || 0).toLocaleString("en-IN")} – ₹${(order?.printEstHigh || 0).toLocaleString("en-IN")}</td>
          </tr>
        </table>

        <div class="advance-row">
          <div class="advance-label">Advance Due (50%)</div>
          <div class="advance-val">₹${(order?.advanceDue || 0).toLocaleString("en-IN")}</div>
        </div>
      </div>

      <!-- Payment Proof Card -->
      <div class="card">
        <h2 class="card-title">📸 Customer Payment Proof</h2>
        <div class="screenshot-box">
          ${
            screenshotUrl
              ? `<a href="${screenshotUrl}" target="_blank">
                  <img src="${screenshotUrl}" alt="Payment Proof" class="screenshot-img" />
                 </a>
                 <div style="margin-top: 10px;">
                   <a href="${screenshotUrl}" target="_blank" style="font-size: 13px; color: var(--primary);">View Full Resolution Image ↗</a>
                 </div>`
              : `<div style="padding: 40px 10px; background: #f1f5f9; border-radius: 8px; color: var(--text-muted); font-size: 14px;">
                   No direct image URL found in snapshot.<br>Payment screenshot was acknowledged via WhatsApp.
                 </div>`
          }
        </div>
      </div>
    </div>

    <!-- Actions Footer -->
    <div class="actions-card">
      ${
        isProcessed
          ? `<div style="font-size: 16px; font-weight: 700; color: ${
              processedAction === "confirm" ? "var(--success)" : "var(--danger)"
            };">
              This order was already processed as: <strong>${processedAction?.toUpperCase()}</strong>.
             </div>
             <p style="font-size: 13px; color: var(--text-muted); margin-top: 6px;">
               Google Sheets CRM has been updated. No further action needed.
             </p>`
          : `<h3>Authorize or Flag This Order</h3>
             <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">
               To confirm payment, tap "Confirm Payment" and enter the 6-digit code sent to your email.
             </p>
             <div class="btn-group">
               <button id="openConfirmBtn" class="btn btn-primary">
                 ✅ Confirm Payment (Enter OTP)
               </button>
               <button id="flagIssueBtn" class="btn btn-secondary">
                 🚩 Flag Payment Issue
               </button>
               <button id="pageResendBtn" class="btn btn-warning">
                 🔄 Request Secondary OTP
               </button>
             </div>`
      }
    </div>
  </div>

  <!-- 2-Step OTP Modal -->
  <div id="otpModal" class="modal-overlay">
    <div class="modal-content">
      <div class="modal-title">🔐 Enter 6-Digit Verification Code</div>
      <div class="modal-desc">
        Enter the 6-digit approval code sent to <strong>${adminEmailsText}</strong> to confirm payment for order <strong>${orderId}</strong>:
      </div>

      <div id="modalSuccess" class="modal-success"></div>
      <div id="modalError" class="modal-error"></div>

      <form id="otpForm">
        <div class="otp-inputs">
          <input type="text" maxlength="1" class="otp-input" inputmode="numeric" autocomplete="one-time-code" autofocus />
          <input type="text" maxlength="1" class="otp-input" inputmode="numeric" />
          <input type="text" maxlength="1" class="otp-input" inputmode="numeric" />
          <input type="text" maxlength="1" class="otp-input" inputmode="numeric" />
          <input type="text" maxlength="1" class="otp-input" inputmode="numeric" />
          <input type="text" maxlength="1" class="otp-input" inputmode="numeric" />
        </div>

        <div style="display: flex; gap: 10px; justify-content: center; margin-top: 12px;">
          <button type="button" id="modalCancelBtn" class="btn btn-secondary" style="color: var(--text); border-color: var(--border);">
            Cancel
          </button>
          <button type="submit" id="modalSubmitBtn" class="btn btn-primary">
            Verify & Confirm Order
          </button>
        </div>
      </form>

      <!-- Fail-safe inside Modal -->
      <div class="modal-failsafe">
        <span>Didn't receive code or expired (> 30 mins)?</span><br>
        <button type="button" id="modalResendBtn" class="link-btn" style="margin-top: 6px;">
          🔄 Request Secondary OTP
        </button>
        <div id="cooldownText" style="font-size: 12px; color: var(--text-muted); margin-top: 4px; display: none;"></div>
      </div>
    </div>
  </div>

  <script>
    const orderId = ${JSON.stringify(orderId)};
    const token = ${JSON.stringify(token)};
    
    const modal = document.getElementById("otpModal");
    const openConfirmBtn = document.getElementById("openConfirmBtn");
    const flagIssueBtn = document.getElementById("flagIssueBtn");
    const modalCancelBtn = document.getElementById("modalCancelBtn");
    const modalResendBtn = document.getElementById("modalResendBtn");
    const pageResendBtn = document.getElementById("pageResendBtn");
    const otpForm = document.getElementById("otpForm");
    const modalError = document.getElementById("modalError");
    const modalSuccess = document.getElementById("modalSuccess");
    const modalSubmitBtn = document.getElementById("modalSubmitBtn");
    const cooldownText = document.getElementById("cooldownText");

    const otpInputs = Array.from(document.querySelectorAll(".otp-input"));

    if (openConfirmBtn) {
      openConfirmBtn.addEventListener("click", () => {
        modalError.style.display = "none";
        modalSuccess.style.display = "none";
        modal.style.display = "flex";
        otpInputs[0].focus();
      });
    }

    if (modalCancelBtn) {
      modalCancelBtn.addEventListener("click", () => {
        modal.style.display = "none";
      });
    }

    // Auto-advance OTP inputs and handle backspace + paste
    otpInputs.forEach((input, idx) => {
      input.addEventListener("input", (e) => {
        const val = e.target.value.replace(/\\D/g, "");
        e.target.value = val.slice(-1);
        if (e.target.value && idx < otpInputs.length - 1) {
          otpInputs[idx + 1].focus();
        }
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !e.target.value && idx > 0) {
          otpInputs[idx - 1].focus();
        }
      });

      input.addEventListener("paste", (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData("text").replace(/\\D/g, "");
        if (pasted.length >= 6) {
          for (let i = 0; i < 6; i++) {
            otpInputs[i].value = pasted[i];
          }
          otpInputs[5].focus();
        }
      });
    });

    // Helper to request secondary OTP via fail-safe
    async function triggerResendOtp(sourceBtn) {
      if (sourceBtn) sourceBtn.disabled = true;
      try {
        const res = await fetch("/api/admin-approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, token, action: "resend_otp" })
        });
        const data = await res.json();
        if (data.ok) {
          modalSuccess.textContent = "✅ Secondary OTP dispatched to your email! Please check your inbox.";
          modalSuccess.style.display = "block";
          modalError.style.display = "none";
          startCooldown(30);
        } else {
          modalError.textContent = data.error || "Failed to generate secondary code.";
          modalError.style.display = "block";
        }
      } catch (err) {
        modalError.textContent = "Network error requesting secondary code.";
        modalError.style.display = "block";
      } finally {
        if (sourceBtn) sourceBtn.disabled = false;
      }
    }

    function startCooldown(seconds) {
      let remaining = seconds;
      modalResendBtn.disabled = true;
      cooldownText.style.display = "block";
      const timer = setInterval(() => {
        remaining--;
        cooldownText.textContent = "Please wait " + remaining + "s before requesting another code.";
        if (remaining <= 0) {
          clearInterval(timer);
          modalResendBtn.disabled = false;
          cooldownText.style.display = "none";
        }
      }, 1000);
    }

    if (modalResendBtn) {
      modalResendBtn.addEventListener("click", () => triggerResendOtp(modalResendBtn));
    }
    if (pageResendBtn) {
      pageResendBtn.addEventListener("click", () => {
        modal.style.display = "flex";
        triggerResendOtp(modalResendBtn);
      });
    }

    // Submit OTP verification
    if (otpForm) {
      otpForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        modalError.style.display = "none";
        modalSuccess.style.display = "none";

        const code = otpInputs.map(i => i.value).join("");
        if (code.length !== 6) {
          modalError.textContent = "Please enter all 6 digits of the code.";
          modalError.style.display = "block";
          return;
        }

        modalSubmitBtn.disabled = true;
        modalSubmitBtn.textContent = "Verifying code...";

        try {
          const res = await fetch("/api/admin-approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId, token, code, action: "confirm" })
          });
          const data = await res.json();
          if (data.ok) {
            modalSuccess.textContent = "🎉 " + data.message;
            modalSuccess.style.display = "block";
            modalSubmitBtn.textContent = "Confirmed ✅";
            setTimeout(() => {
              window.location.reload();
            }, 1800);
          } else {
            modalError.textContent = data.error || "Verification failed.";
            modalError.style.display = "block";
            modalSubmitBtn.disabled = false;
            modalSubmitBtn.textContent = "Verify & Confirm Order";
          }
        } catch (err) {
          modalError.textContent = "Network error verifying code.";
          modalError.style.display = "block";
          modalSubmitBtn.disabled = false;
          modalSubmitBtn.textContent = "Verify & Confirm Order";
        }
      });
    }

    // Flag Payment Issue
    if (flagIssueBtn) {
      flagIssueBtn.addEventListener("click", async () => {
        const ok = confirm("Are you sure you want to flag order " + orderId + " as a Payment Issue in CRM?");
        if (!ok) return;

        flagIssueBtn.disabled = true;
        flagIssueBtn.textContent = "Flagging...";
        try {
          const res = await fetch("/api/admin-approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId, token, action: "issue" })
          });
          const data = await res.json();
          if (data.ok) {
            alert(data.message);
            window.location.reload();
          } else {
            alert(data.error || "Failed to flag issue.");
            flagIssueBtn.disabled = false;
            flagIssueBtn.textContent = "🚩 Flag Payment Issue";
          }
        } catch (err) {
          alert("Network error.");
          flagIssueBtn.disabled = false;
          flagIssueBtn.textContent = "🚩 Flag Payment Issue";
        }
      });
    }
  </script>
</body>
</html>`;
}

function renderErrorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} · Custom Teamwear</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, sans-serif; background: #f8fafc; color: #0f172a; padding: 40px 16px; display: flex; justify-content: center; align-items: center; min-height: 80vh; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    h1 { font-size: 20px; color: #dc2626; margin-bottom: 12px; font-weight: 800; }
    p { font-size: 14px; color: #64748b; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
