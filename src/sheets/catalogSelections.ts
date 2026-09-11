/**
 * CatalogSelections sheet writer — dedicated tab for the PDF-driven
 * catalog brand/style/colour pick (src/catalog/), kept separate from
 * "Orders" so the existing Orders schema/behaviour is never touched.
 * Linked back to the Orders row by Order ID.
 *
 * Failure here follows the same "escalation never fails silently" rule
 * as the Orders writer (src/sheets/safeAppend.ts): a failed write
 * escalates the full row as text to the admin chat rather than vanishing.
 */

import { GoogleSpreadsheet, type GoogleSpreadsheetWorksheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { getEnv } from "../config/env.js";
import { CATALOG_SELECTIONS_HEADER, type CatalogSelectionsRow } from "./catalogSchema.js";
import type { CatalogSelection } from "../shared/types.js";
import { TIER_LABELS } from "../pricing/priceBook.js";
import { notifyAdminsText } from "../admin/notify.js";

let cachedSheet: GoogleSpreadsheetWorksheet | undefined;

async function getCatalogSelectionsSheet(): Promise<GoogleSpreadsheetWorksheet> {
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

  let sheet = doc.sheetsByTitle["CatalogSelections"];
  if (!sheet) {
    sheet = await doc.addSheet({ title: "CatalogSelections", headerValues: [...CATALOG_SELECTIONS_HEADER] });
  } else {
    await sheet.loadHeaderRow().catch(async () => {
      await sheet!.setHeaderRow([...CATALOG_SELECTIONS_HEADER]);
    });
  }

  cachedSheet = sheet;
  return sheet;
}

export function catalogSelectionToRow(orderId: string, selection: CatalogSelection): CatalogSelectionsRow {
  return {
    Timestamp: new Date().toISOString(),
    "Order ID": orderId,
    "Catalog Version": selection.catalogVersion,
    Tier: TIER_LABELS[selection.tier],
    Group: selection.groupLabel,
    Item: selection.itemLabel,
    "Style Code": selection.styleCode ?? "",
    "Source PDF": selection.sourceId,
    "Source Page": selection.sourcePage,
    "Variant ID": selection.variantId ?? "",
    Colour: selection.colorName ?? "",
    "Colour Code": selection.colorCode ?? "",
    "Reference Image": selection.referenceImagePath ?? selection.referenceImageUrl ?? "",
    "Reference Image Kind": selection.referenceImageKind,
    "Mockup Eligible": selection.mockupEligible ? "Y" : "N",
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

/**
 * Appends the catalog selection row for an order. Never throws — a
 * failure escalates the full row as text to the admin chat (same
 * "money event cannot vanish" guarantee as Orders) and is otherwise
 * swallowed, since this is supplementary trace data and must never block
 * the customer's order/payment flow.
 */
export async function appendCatalogSelectionRow(orderId: string, selection: CatalogSelection): Promise<void> {
  const row = catalogSelectionToRow(orderId, selection);
  try {
    await withRetries(async () => {
      const sheet = await getCatalogSelectionsSheet();
      await sheet.addRow(row as unknown as Record<string, string | number>);
    });
  } catch (err) {
    const rowText = Object.entries(row)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    await notifyAdminsText(
      `⚠️ CatalogSelections write failed for ${orderId} — full row below (please log manually):\n\n${rowText}`,
    ).catch(() => {});
    console.error(`Failed to write CatalogSelections row for ${orderId}:`, err);
  }
}
