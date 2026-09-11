/**
 * Typed catalog domain module — loads the generated manifest
 * (src/catalog/data/catalog.generated.json, produced by
 * scripts/generate-catalog.ts) and exposes lookup/validation helpers for
 * the conversation flow. This module never computes a price; every
 * CatalogItem carries a productId that the existing pricing engine
 * (src/pricing/) consumes unchanged.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CatalogGroup,
  CatalogItem,
  CatalogManifest,
  CatalogTier,
  CatalogVariant,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, "data", "catalog.generated.json");

// Loaded via fs.readFileSync (rather than a JSON module import) so the
// project's tsconfig "module" target doesn't need to change to support
// import attributes — this keeps the loader a plain runtime read, same
// pattern already used for on-disk assets elsewhere (e.g. mockup
// templates in src/mockup/generateAi.ts).
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) as CatalogManifest;

const groupsById = new Map<string, CatalogGroup>(manifest.groups.map((g) => [g.id, g]));
const itemsById = new Map<string, CatalogItem>(manifest.items.map((i) => [i.id, i]));
const variantsById = new Map<string, CatalogVariant>();
for (const item of manifest.items) {
  for (const variant of item.variants) {
    variantsById.set(variant.id, variant);
  }
}

export type { CatalogGroup, CatalogItem, CatalogManifest, CatalogTier, CatalogVariant } from "./types.js";

/** The catalog version stamped onto every order for traceability (PDFs can be re-ingested later). */
export function getCatalogVersion(): string {
  return manifest.catalogVersion;
}

export function getCatalogManifest(): CatalogManifest {
  return manifest;
}

/** Groups (brands for Premium, categories for Basic/Standard) available within a tier, in manifest order. */
export function getGroupsForTier(tier: CatalogTier): CatalogGroup[] {
  return manifest.groups.filter((g) => g.tier === tier);
}

export function getGroup(groupId: string): CatalogGroup | undefined {
  return groupsById.get(groupId);
}

/** Catalog items belonging to a group, in manifest order. */
export function getItemsForGroup(groupId: string): CatalogItem[] {
  const group = groupsById.get(groupId);
  if (!group) return [];
  return group.itemIds.map((id) => itemsById.get(id)).filter((i): i is CatalogItem => Boolean(i));
}

export function getItem(itemId: string): CatalogItem | undefined {
  return itemsById.get(itemId);
}

/** The pricing SKUs a catalog item is allowed to map onto — must match the pricing engine's ProductId union exactly. */
const VALID_PRODUCT_IDS = new Set<string>([
  "dry_fit_round_neck",
  "dry_fit_polo",
  "cotton_round_neck",
  "cotton_polo",
]);
const VALID_GARMENT_TYPES = new Set<string>(["round_neck", "polo"]);

/**
 * True when an item is safe to offer as a normal, orderable catalog item.
 *
 * An item is NOT selectable when any of these hold, because we can't
 * confidently show/quote/mockup it:
 *  - `needsReview` — produced by the image-only fallback parser (Reebok,
 *    Van Heusen) or otherwise flagged for a human to verify before trust.
 *  - placeholder/missing preview image — nothing to show the customer.
 *  - unknown product/garment mapping — can't be priced or rendered.
 *
 * Such items are hidden from the pickable list; a group that has none
 * routes the customer to assisted selection instead (see the conversation
 * flow). Colour variants are validated separately at pick time.
 */
export function isItemSelectable(item: CatalogItem): boolean {
  if (item.needsReview) return false;
  if (item.previewImage.kind === "placeholder" || !item.previewImage.localPath) return false;
  if (!VALID_PRODUCT_IDS.has(item.productId)) return false;
  if (!VALID_GARMENT_TYPES.has(item.garmentType)) return false;
  return true;
}

/** Selectable catalog items belonging to a group, in manifest order (excludes needs-review / placeholder / unmappable items). */
export function getSelectableItemsForGroup(groupId: string): CatalogItem[] {
  return getItemsForGroup(groupId).filter(isItemSelectable);
}

/**
 * True when a colour variant is safe to finalize as the ordered variant:
 * it must have a usable (non-placeholder) image so we can show the exact
 * colour and use it as the mockup reference.
 */
export function isVariantSelectable(variant: CatalogVariant): boolean {
  return variant.image.kind !== "placeholder" && Boolean(variant.image.localPath || variant.image.sourceUrl);
}

/** Selectable colour variants for an item (excludes placeholder/no-image variants from failed downloads). */
export function getSelectableVariantsForItem(itemId: string): CatalogVariant[] {
  return getVariantsForItem(itemId).filter(isVariantSelectable);
}

export function getVariant(variantId: string): CatalogVariant | undefined {
  return variantsById.get(variantId);
}

/** Variants belonging to a specific item, in manifest order. */
export function getVariantsForItem(itemId: string): CatalogVariant[] {
  return itemsById.get(itemId)?.variants ?? [];
}

/**
 * Validates a (groupId, tier) pair came from a real callback payload and
 * actually belongs to that tier — guards against a stale/forged callback
 * data string (e.g. from an old inline keyboard after a catalog
 * regeneration) being trusted blindly.
 */
export function isValidGroupForTier(groupId: string, tier: CatalogTier): boolean {
  const group = groupsById.get(groupId);
  return Boolean(group && group.tier === tier);
}

/** Validates an itemId actually belongs to the given groupId. */
export function isValidItemForGroup(itemId: string, groupId: string): boolean {
  const item = itemsById.get(itemId);
  return Boolean(item && item.groupId === groupId);
}

/** Validates a variantId actually belongs to the given itemId. */
export function isValidVariantForItem(variantId: string, itemId: string): boolean {
  const item = itemsById.get(itemId);
  if (!item) return false;
  return item.variants.some((v) => v.id === variantId);
}

/** Resolves the local (repo-relative) preview image path for an item, or undefined if the referenced image can't be served (no localPath — e.g. a failed external download). */
export function getItemPreviewPath(item: CatalogItem): string | undefined {
  return item.previewImage.localPath;
}

/** Resolves the local preview image path for a variant, falling back to the parent item's preview when the variant has no image of its own. */
export function getVariantImagePath(variant: CatalogVariant, fallbackItem?: CatalogItem): string | undefined {
  if (variant.image.localPath) return variant.image.localPath;
  return fallbackItem?.previewImage.localPath;
}

const ASSETS_CATALOG_DIR = path.resolve(__dirname, "../../assets/catalog");

/** Resolves a CatalogImageRef.localPath (repo-relative, under assets/catalog/) to an absolute filesystem path for sending via Telegram's InputFile. */
export function resolveCatalogAssetPath(localPath: string): string {
  return path.join(ASSETS_CATALOG_DIR, localPath);
}

/** True when a variant's photo actually differs from its parent item's preview image — used to decide whether picking a colour warrants a second image-confirm step. */
export function variantHasDistinctImage(item: CatalogItem, variant: CatalogVariant): boolean {
  if (!variant.image.localPath) return false;
  return variant.image.localPath !== item.previewImage.localPath;
}
