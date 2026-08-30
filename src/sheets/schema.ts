/**
 * Google Sheet "Orders" tab schema — PRD §9.2.
 * One row per interaction outcome (orders AND leads share this schema).
 */

export const ORDERS_HEADER = [
  "Timestamp",
  "Order ID",
  "Status",
  "Tier",
  "Product",
  "Qty",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "3XL",
  "Print Method",
  "Logo Placement",
  "City",
  "Name",
  "Phone",
  "Timeline",
  "Timeline Urgent Y/N",
  "Logo Received Y/N",
  "Logo File ID",
  "Garment Rate/pc",
  "Garment Total",
  "Est Print Low",
  "Est Print High",
  "Est Grand Low",
  "Est Grand High",
  "Advance Due",
  "Customer Chat ID",
  "Channel",
  "Admin Notes",
  "Last Updated",
] as const;

export type OrdersRow = Record<(typeof ORDERS_HEADER)[number], string | number>;
