/**
 * Selected-item persistence — verifies the customer's confirmed catalog
 * pick (CatalogSelection) survives the round trip into the sheet row
 * shape unchanged, and that an order without a catalog selection (e.g.
 * a pre-existing order created before this feature, or a future
 * non-catalog channel) never breaks the mapping.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogSelectionToRow } from "../src/sheets/catalogSelections.js";
import { CATALOG_SELECTIONS_HEADER } from "../src/sheets/catalogSchema.js";
import type { CatalogSelection } from "../src/shared/types.js";

function sampleSelection(overrides: Partial<CatalogSelection> = {}): CatalogSelection {
  return {
    catalogVersion: "1.abc123def456",
    tier: "branded",
    groupId: "branded-adidas",
    groupLabel: "Adidas",
    itemId: "branded-adidas-i41",
    itemLabel: "Adidas Dryfit Tshirt",
    productId: "dry_fit_round_neck",
    garmentType: "round_neck",
    sourceId: "premium-adidas-adidas-catalogue",
    sourcePage: 2,
    styleCode: undefined,
    variantId: "branded-adidas-i41-v601",
    colorName: "Black",
    colorCode: "B30903",
    referenceImagePath: "premium-adidas-adidas-catalogue/page-002.jpg",
    referenceImageKind: "rendered-page",
    mockupEligible: true,
    ...overrides,
  };
}

test("catalogSelectionToRow maps every header column", () => {
  const row = catalogSelectionToRow("CTW-250101-01", sampleSelection());
  const keys = Object.keys(row);
  for (const header of CATALOG_SELECTIONS_HEADER) {
    assert.ok(keys.includes(header), `missing column: ${header}`);
  }
});

test("catalogSelectionToRow preserves exact selection identity fields", () => {
  const selection = sampleSelection();
  const row = catalogSelectionToRow("CTW-250101-01", selection);
  assert.equal(row["Order ID"], "CTW-250101-01");
  assert.equal(row["Catalog Version"], selection.catalogVersion);
  assert.equal(row["Item"], selection.itemLabel);
  assert.equal(row["Group"], selection.groupLabel);
  assert.equal(row["Source PDF"], selection.sourceId);
  assert.equal(row["Source Page"], selection.sourcePage);
  assert.equal(row["Variant ID"], selection.variantId);
  assert.equal(row["Colour"], selection.colorName);
  assert.equal(row["Colour Code"], selection.colorCode);
  assert.equal(row["Reference Image"], selection.referenceImagePath);
});

test("catalogSelectionToRow tolerates a colourless selection (item has no variants)", () => {
  const selection = sampleSelection({
    variantId: undefined,
    colorName: undefined,
    colorCode: undefined,
    styleCode: "380T",
  });
  const row = catalogSelectionToRow("CTW-250101-02", selection);
  assert.equal(row["Variant ID"], "");
  assert.equal(row["Colour"], "");
  assert.equal(row["Colour Code"], "");
  assert.equal(row["Style Code"], "380T");
});

test("catalogSelectionToRow never throws for a minimal selection (only required fields)", () => {
  const minimal: CatalogSelection = {
    catalogVersion: "1.0000",
    tier: "basic",
    groupId: "basic-cotton-polo",
    groupLabel: "Cotton Polo",
    itemId: "basic-cotton-polo-i1",
    itemLabel: "Cotton Polo — Quality No. 380T",
    productId: "cotton_polo",
    garmentType: "polo",
    sourceId: "basic-cotton-polo",
    sourcePage: 1,
    referenceImageKind: "rendered-page",
    mockupEligible: true,
  };
  assert.doesNotThrow(() => catalogSelectionToRow("CTW-250101-03", minimal));
});
