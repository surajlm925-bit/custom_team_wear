/**
 * MockupGenerations sheet writer — durable audit trail, one row per
 * generation, UPSERTED by Generation ID so status changes and retries
 * update the SAME row instead of creating duplicates.
 *
 * The row-store is behind a small injectable interface (MockupSheetStore)
 * so tests can assert create/update behaviour with an in-memory fake and
 * never touch Google Sheets. Production uses the real google-spreadsheet
 * worksheet.
 *
 * Failure follows the "escalation never fails silently" rule: a failed
 * write escalates the full row as text to the admin chat and is otherwise
 * swallowed (the audit sheet must never block the customer's flow). The
 * authoritative state still lives in Redis + Blob regardless.
 */

import { GoogleSpreadsheet, type GoogleSpreadsheetWorksheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { getEnv } from "../config/env.js";
import { MOCKUP_GENERATIONS_HEADER, type MockupGenerationsRow } from "./mockupSchema.js";
import type { MockupGeneration } from "../shared/types.js";
import { notifyAdminsText } from "../admin/notify.js";

/** Minimal row-store surface the upsert needs; lets tests inject a fake. */
export interface MockupSheetStore {
  /** Returns the existing row values for a generation id, or undefined. */
  find(generationId: string): Promise<MockupGenerationsRow | undefined>;
  /** Creates a new row. */
  create(row: MockupGenerationsRow): Promise<void>;
  /** Updates the existing row for a generation id in place. */
  update(generationId: string, row: MockupGenerationsRow): Promise<void>;
}

let cachedSheet: GoogleSpreadsheetWorksheet | undefined;

async function getSheet(): Promise<GoogleSpreadsheetWorksheet> {
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
  let sheet = doc.sheetsByTitle["MockupGenerations"];
  if (!sheet) {
    sheet = await doc.addSheet({ title: "MockupGenerations", headerValues: [...MOCKUP_GENERATIONS_HEADER] });
  } else {
    await sheet.loadHeaderRow().catch(async () => {
      await sheet!.setHeaderRow([...MOCKUP_GENERATIONS_HEADER]);
    });
  }
  cachedSheet = sheet;
  return sheet;
}

/** The real google-spreadsheet-backed store. */
const googleSheetStore: MockupSheetStore = {
  async find(generationId) {
    const sheet = await getSheet();
    const rows = await sheet.getRows();
    const row = rows.find((r) => r.get("Generation ID") === generationId);
    if (!row) return undefined;
    return row.toObject() as unknown as MockupGenerationsRow;
  },
  async create(row) {
    const sheet = await getSheet();
    await sheet.addRow(row as unknown as Record<string, string | number>);
  },
  async update(generationId, row) {
    const sheet = await getSheet();
    const rows = await sheet.getRows();
    const existing = rows.find((r) => r.get("Generation ID") === generationId);
    if (!existing) {
      await sheet.addRow(row as unknown as Record<string, string | number>);
      return;
    }
    for (const [k, v] of Object.entries(row)) existing.set(k, v);
    await existing.save();
  },
};

let store: MockupSheetStore = googleSheetStore;

/** Test seam: swap the row-store (pass undefined to restore the real one). */
export function __setMockupSheetStoreForTests(fake: MockupSheetStore | undefined): void {
  store = fake ?? googleSheetStore;
}

export function generationToRow(record: MockupGeneration): MockupGenerationsRow {
  const outputUrls = record.outputs
    .map((o) => o.url)
    .filter((u): u is string => Boolean(u))
    .join(", ");
  return {
    "Generation ID": record.generationId,
    "Order ID": record.orderId,
    "Chat ID": record.customerChatId,
    Status: record.status,
    "Free/Paid": record.free ? "Free" : "Paid",
    "Amount INR": record.amountInr,
    "Month Key": record.monthKey,
    "Catalog Item": record.catalogSelection?.itemLabel ?? "",
    Colour: record.catalogSelection?.colorName ?? "",
    "Style Code": record.catalogSelection?.styleCode ?? "",
    "Reference Image": record.garmentReferenceRef ?? "",
    "Requested Views": record.requestedViews.join(", "),
    "Output URLs": outputUrls,
    "Payment Proof File ID": record.paymentProofMessageId ?? "",
    "Admin Decision By": record.decidedByAdminChatId ?? "",
    "Failure Reason": record.failureReason ?? "",
    "Created At": record.createdAt,
    "Updated At": record.updatedAt,
    "Completed At": record.completedAt ?? "",
  };
}

async function withRetries<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
  throw lastError;
}

/**
 * Upserts the audit row for a generation. Never throws — a failure
 * escalates the full row to the admin chat and is otherwise swallowed
 * (the durable state of record is Redis + Blob; this sheet is the human-
 * readable audit copy and must not block the flow).
 *
 * Idempotent: repeated calls for the same Generation ID update the same
 * row, so duplicate callbacks / retries never create duplicate rows.
 */
export async function upsertMockupGenerationRow(record: MockupGeneration): Promise<void> {
  const row = generationToRow(record);
  try {
    await withRetries(async () => {
      const existing = await store.find(record.generationId);
      if (existing) {
        await store.update(record.generationId, row);
      } else {
        await store.create(row);
      }
    });
  } catch (err) {
    const rowText = Object.entries(row)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    await notifyAdminsText(
      `⚠️ MockupGenerations write failed for ${record.generationId} (order ${record.orderId}) — full row below (log manually):\n\n${rowText}`,
    ).catch(() => {});
    console.error(`Failed to upsert MockupGenerations row for ${record.generationId}:`, err);
  }
}
