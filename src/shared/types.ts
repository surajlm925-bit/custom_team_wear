/**
 * Shared domain types used across pricing, session, sheets, and rendering.
 */

import type { LogoPlacement, PrintMethod, ProductId, Silhouette, SizeKey, Tier } from "../pricing/priceBook.js";

export interface LogoUpload {
  fileId: string;
  placement: LogoPlacement;
}

/**
 * The customer's confirmed catalog pick — PDF-driven brand/style/colour
 * selection (src/catalog/). Stored on the order for traceability even
 * after the catalog is regenerated: catalogVersion + sourceId + sourcePage
 * always point back to the exact PDF page the customer approved,
 * independent of whether that item still exists in a later catalog run.
 */
/** Where the confirmed reference image physically lives — determines how the mockup pipeline loads it. */
export type ReferenceImageKind = "rendered-page" | "external-link" | "placeholder";

export interface CatalogSelection {
  catalogVersion: string;
  tier: Tier;
  groupId: string;
  groupLabel: string;
  itemId: string;
  itemLabel: string;
  /** Drives the existing pricing engine — pricing itself is unaffected by which brand/style was picked (see src/pricing/, tech.md's pricing invariant). */
  productId: ProductId;
  /** Garment silhouette (round_neck | polo) of the selected item — used to describe the garment in the mockup prompt and to pick the legacy template only when no catalog reference exists. */
  garmentType: Silhouette;
  sourceId: string;
  sourcePage: number;
  styleCode?: string;
  variantId?: string;
  colorName?: string;
  colorCode?: string;
  /**
   * Repo-relative path (under assets/catalog/) of the exact image the
   * customer confirmed — the primary garment reference for mockup
   * generation. Present for locally-available images (rendered PDF pages
   * and downloaded Stellars swatches). Absent for placeholder/missing
   * images.
   */
  referenceImagePath?: string;
  /** Original external URL the reference image came from (Stellars swatch hyperlink), kept for traceability even after local mirroring. */
  referenceImageUrl?: string;
  referenceImageKind: ReferenceImageKind;
  /**
   * True only when this selection has a usable exact-garment reference
   * image the mockup pipeline can send to the AI provider. When false
   * (placeholder/missing image), an exact preview cannot be produced and
   * the customer/admin are notified instead of falling back to a generic
   * template — a generic template is reserved strictly for legacy orders
   * with no catalog selection at all.
   */
  mockupEligible: boolean;
}

export type OrderStatus =
  | "Pending Payment"
  | "Confirmed"
  | "Payment Issue"
  | "Lead — High-Value Callback"
  | "Lead — No Payment"
  | "Lead — Abandoned";

/** Which template view a produced mockup image represents. */
export type MockupView = "front" | "back";

/**
 * Lifecycle of a single mockup-generation REQUEST (not per image — a
 * front+back request is ONE MockupGeneration that yields two images).
 *
 * Forward-only. Free generations skip the payment/approval states and go
 * straight to "generating". Paid generations (#4+ in a Kolkata month) must
 * pass through payment proof + explicit admin approval first.
 *
 *  free path : reserved -> generating -> completed | failed
 *  paid path : reserved -> awaiting_payment -> awaiting_approval
 *                        -> approved -> generating -> completed | failed
 *              (or -> rejected  from awaiting_approval)
 */
export type MockupGenerationStatus =
  | "reserved"
  | "awaiting_payment"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "generating"
  | "completed"
  | "failed";

/** One durably-stored generated image within a MockupGeneration. */
export interface MockupOutputImage {
  view: MockupView;
  /** Durable Vercel Blob URL. Absent if durable storage was unavailable at generation time. */
  url?: string;
  /** Blob object pathname (stable id) when stored. */
  pathname?: string;
  /** If delivered successfully, the Zaptilo message ID. */
  zaptiloMessageId?: string;
  /** Provider cost in USD for this image, when reported. */
  costUsd?: number;
}

/**
 * One mockup-generation request, persisted per request and linked to the
 * order + chat. This is the durable record the whole paid-generation
 * workflow (quota, payment, admin approval, generation, storage) mutates.
 */
export interface MockupGeneration {
  /** Idempotency key for the whole request (stable across retries). */
  generationId: string;
  orderId: string;
  /** Channel-prefixed chat id, e.g. "tg:5512345678" — matches OrderData.customerChatId. */
  customerChatId: string;
  status: MockupGenerationStatus;
  /** True once this generation consumed a free monthly slot; false when it's a paid generation. */
  free: boolean;
  /** Amount charged in whole rupees (0 for free generations). */
  amountInr: number;
  /** The Asia/Kolkata calendar-month key (YYYY-MM) this generation was reserved against. */
  monthKey: string;
  /** The exact garment reference the request will render onto (traceability). */
  catalogSelection?: CatalogSelection;
  /** Repo-relative path or URL of the exact garment reference image used. */
  garmentReferenceRef?: string;
  /** Views requested for this generation (e.g. ["front","back"]). */
  requestedViews: MockupView[];
  /** Logo (fileId, placement) pairs this generation renders. */
  logos: LogoUpload[];
  /** Durably-stored output images (one per produced view). */
  outputs: MockupOutputImage[];
  /** Zaptilo message ID of the customer's payment proof (paid generations only). */
  paymentProofMessageId?: string;
  /** Admin chat id that approved/rejected (paid generations only). */
  decidedByAdminChatId?: string;
  createdAt: string;
  updatedAt: string;
  /** Set when status reaches completed. */
  completedAt?: string;
  /** Human-readable failure reason when status === "failed". */
  failureReason?: string;
}

export type Timeline = "urgent" | "standard" | "flexible";

export interface SizeSplit extends Record<SizeKey, number> {}

export interface OrderData {
  orderId: string;
  status: OrderStatus;
  orderType?: "bulk" | "sample";
  tier: Tier;
  productId: ProductId;
  /** The exact catalog brand/style/colour the customer confirmed (PDF-driven catalog selection flow). Optional so pre-existing orders created before this feature continue to load/validate unchanged. */
  catalogSelection?: CatalogSelection;
  qty: number;
  sizeSplit: SizeSplit;
  printMethod: PrintMethod;
  city: string;
  name: string;
  phone: string;
  timeline: Timeline;
  timelineUrgent: boolean;
  logoReceived: boolean;
  /** Zero or more (logo, placement) pairs — customer can upload multiple logos, each at its own position. */
  logos: LogoUpload[];
  garmentRate: number;
  garmentTotal: number;
  printEstLow: number;
  printEstHigh: number;
  grandEstLow: number;
  grandEstHigh: number;
  advanceDue: number;
  customerChatId: string; // channel-prefixed, e.g. "wa:919876543210"
  channel: "whatsapp";
  adminNotes?: string;
}
