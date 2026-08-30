/**
 * Google Sheets CRM writer — PRD §9.2, §8.4.
 * Single "Orders" tab. Sheets outage -> 3 retries -> caller escalates the
 * full order as text to the admin chat (money events cannot vanish).
 */

import { GoogleSpreadsheet, type GoogleSpreadsheetWorksheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { getEnv } from "../config/env.js";
import { ORDERS_HEADER, type OrdersRow } from "./schema.js";
import type { OrderData } from "../shared/types.js";
import { LOGO_PLACEMENTS, TIER_LABELS } from "../pricing/priceBook.js";
import { getProduct, getPrintMethod } from "../pricing/index.js";

function logoPlacementSummary(order: OrderData): string {
  if (order.logos.length === 0) return "";
  return order.logos
    .map((logo) => LOGO_PLACEMENTS.find((p) => p.id === logo.placement)?.label ?? logo.placement)
    .join(", ");
}

function logoFileIdSummary(order: OrderData): string {
  return order.logos.map((logo) => logo.fileId).join(", ");
}

let cachedSheet: GoogleSpreadsheetWorksheet | undefined;

async function getOrdersSheet(): Promise<GoogleSpreadsheetWorksheet> {
  if (cachedSheet) return cachedSheet;

  const env = getEnv();
  const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as {
    client_email: string;
    private_key: string;
  };

  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const doc = new GoogleSpreadsheet(env.SHEET_ID, auth);
  await doc.loadInfo();

  let sheet = doc.sheetsByTitle["Orders"];
  if (!sheet) {
    sheet = await doc.addSheet({ title: "Orders", headerValues: [...ORDERS_HEADER] });
  } else {
    await sheet.loadHeaderRow().catch(async () => {
      await sheet!.setHeaderRow([...ORDERS_HEADER]);
    });
  }

  cachedSheet = sheet;
  return sheet;
}

export function orderToRow(order: OrderData): OrdersRow {
  const product = getProduct(order.productId);
  return {
    Timestamp: new Date().toISOString(),
    "Order ID": order.orderId,
    Status: order.status,
    Tier: TIER_LABELS[order.tier],
    Product: product.label[order.tier],
    Qty: order.qty,
    S: order.sizeSplit.S,
    M: order.sizeSplit.M,
    L: order.sizeSplit.L,
    XL: order.sizeSplit.XL,
    XXL: order.sizeSplit.XXL,
    "3XL": order.sizeSplit["3XL"],
    "Print Method": getPrintMethod(order.printMethod).label,
    "Logo Placement": logoPlacementSummary(order),
    City: order.city,
    Name: order.name,
    Phone: order.phone,
    Timeline: order.timeline,
    "Timeline Urgent Y/N": order.timelineUrgent ? "Y" : "N",
    "Logo Received Y/N": order.logoReceived ? "Y" : "N",
    "Logo File ID": logoFileIdSummary(order),
    "Garment Rate/pc": order.garmentRate,
    "Garment Total": order.garmentTotal,
    "Est Print Low": order.printEstLow,
    "Est Print High": order.printEstHigh,
    "Est Grand Low": order.grandEstLow,
    "Est Grand High": order.grandEstHigh,
    "Advance Due": order.advanceDue,
    "Customer Chat ID": order.customerChatId,
    Channel: order.channel,
    "Admin Notes": order.adminNotes ?? "",
    "Last Updated": new Date().toISOString(),
  };
}

async function withRetries<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }
  }
  throw lastError;
}

/** Appends a new row for this order/lead outcome. Throws after 3 retries. */
export async function appendOrderRow(order: OrderData): Promise<void> {
  await withRetries(async () => {
    const sheet = await getOrdersSheet();
    await sheet.addRow(orderToRow(order) as unknown as Record<string, string | number>);
  });
}

/** Finds and updates the row for an existing Order ID (e.g. status change on admin action). */
export async function updateOrderRowStatus(
  orderId: string,
  status: OrderData["status"],
  adminNotes?: string,
): Promise<void> {
  await withRetries(async () => {
    const sheet = await getOrdersSheet();
    const rows = await sheet.getRows();
    const row = rows.find((r) => r.get("Order ID") === orderId);
    if (!row) throw new Error(`Order ${orderId} not found in sheet`);
    row.set("Status", status);
    row.set("Last Updated", new Date().toISOString());
    if (adminNotes !== undefined) row.set("Admin Notes", adminNotes);
    await row.save();
  });
}
