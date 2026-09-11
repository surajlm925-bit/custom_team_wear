/**
 * In-memory fake of the MockupSheetStore, so tests can assert the durable
 * audit sheet's create/update-in-place behaviour without touching Google
 * Sheets. Records one row per Generation ID and counts creates vs updates
 * so tests can prove no duplicate rows are ever created on retries.
 */

import type { MockupSheetStore } from "../../src/sheets/mockupGenerations.js";
import type { MockupGenerationsRow } from "../../src/sheets/mockupSchema.js";

export class FakeSheetStore implements MockupSheetStore {
  rows = new Map<string, MockupGenerationsRow>();
  createCount = 0;
  updateCount = 0;

  async find(generationId: string): Promise<MockupGenerationsRow | undefined> {
    return this.rows.get(generationId);
  }

  async create(row: MockupGenerationsRow): Promise<void> {
    this.createCount++;
    this.rows.set(String(row["Generation ID"]), row);
  }

  async update(generationId: string, row: MockupGenerationsRow): Promise<void> {
    this.updateCount++;
    this.rows.set(generationId, row);
  }

  /** Total distinct rows (== number of generations that ever got a row). */
  get rowCount(): number {
    return this.rows.size;
  }
}
