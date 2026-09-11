/**
 * Google Sheet "MockupGenerations" tab schema — the durable audit trail
 * for every mockup-generation request. One row per generation, keyed by
 * Generation ID and UPDATED IN PLACE as the request moves through its
 * lifecycle (reserved → payment → approval → generating → completed/failed).
 * Redis holds the fast atomic state/idempotency; this sheet is the durable
 * record of record that survives Redis TTL expiry.
 *
 * A dedicated tab (not extra Orders columns) keeps the existing Orders
 * schema untouched. Linked back to "Orders" by Order ID.
 */

export const MOCKUP_GENERATIONS_HEADER = [
  "Generation ID",
  "Order ID",
  "Chat ID",
  "Status",
  "Free/Paid",
  "Amount INR",
  "Month Key",
  "Catalog Item",
  "Colour",
  "Style Code",
  "Reference Image",
  "Requested Views",
  "Output URLs",
  "Payment Proof File ID",
  "Admin Decision By",
  "Failure Reason",
  "Created At",
  "Updated At",
  "Completed At",
] as const;

export type MockupGenerationsRow = Record<(typeof MOCKUP_GENERATIONS_HEADER)[number], string | number>;
