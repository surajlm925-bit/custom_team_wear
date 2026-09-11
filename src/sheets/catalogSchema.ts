/**
 * Google Sheet "CatalogSelections" tab schema.
 * A dedicated tab (rather than extra columns bolted onto "Orders") keeps
 * the existing Orders header/behaviour completely untouched — old rows
 * and any external tooling reading the Orders tab keep working exactly
 * as before. One row per order that went through the PDF-driven catalog
 * flow, linked back to "Orders" by Order ID.
 */

export const CATALOG_SELECTIONS_HEADER = [
  "Timestamp",
  "Order ID",
  "Catalog Version",
  "Tier",
  "Group",
  "Item",
  "Style Code",
  "Source PDF",
  "Source Page",
  "Variant ID",
  "Colour",
  "Colour Code",
  "Reference Image",
  "Reference Image Kind",
  "Mockup Eligible",
] as const;

export type CatalogSelectionsRow = Record<(typeof CATALOG_SELECTIONS_HEADER)[number], string | number>;
