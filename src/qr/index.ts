/**
 * Dynamic UPI QR generation — PRD §7.4.
 * Encoding: upi://pay?pa=<MERCHANT_VPA>&am=<advance_due>&tn=<OrderID>
 */

import QRCode from "qrcode";

export function buildUpiUri(merchantVpa: string, advanceDue: number, orderId: string): string {
  const params = new URLSearchParams({
    pa: merchantVpa,
    am: String(advanceDue),
    tn: orderId,
    cu: "INR",
  });
  return `upi://pay?${params.toString()}`;
}

/** Renders the dynamic UPI QR as a PNG buffer. */
export async function generateUpiQrPng(
  merchantVpa: string,
  advanceDue: number,
  orderId: string,
): Promise<Buffer> {
  const uri = buildUpiUri(merchantVpa, advanceDue, orderId);
  return QRCode.toBuffer(uri, {
    type: "png",
    width: 512,
    margin: 2,
  });
}
