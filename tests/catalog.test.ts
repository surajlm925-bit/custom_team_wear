import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  getCatalogManifest,
  getCatalogVersion,
  getGroup,
  getGroupsForTier,
  getItem,
  getItemsForGroup,
  getVariant,
  getVariantsForItem,
  isValidGroupForTier,
  isValidItemForGroup,
  isValidVariantForItem,
  resolveCatalogAssetPath,
  variantHasDistinctImage,
} from "../src/catalog/index.js";

test("catalog manifest loads with sources, groups, and items", () => {
  const manifest = getCatalogManifest();
  assert.ok(manifest.sources.length > 0, "expected at least one source PDF");
  assert.ok(manifest.groups.length > 0, "expected at least one group");
  assert.ok(manifest.items.length > 0, "expected at least one item");
  assert.equal(typeof manifest.catalogVersion, "string");
  assert.ok(manifest.catalogVersion.length > 0);
});

test("getCatalogVersion matches the manifest's stamped version", () => {
  assert.equal(getCatalogVersion(), getCatalogManifest().catalogVersion);
});

test("getGroupsForTier returns only groups for the requested tier", () => {
  for (const tier of ["basic", "standard", "branded"] as const) {
    const groups = getGroupsForTier(tier);
    assert.ok(groups.length > 0, `expected at least one group for tier=${tier}`);
    for (const g of groups) assert.equal(g.tier, tier);
  }
});

test("every group's itemIds resolve to real items via getItemsForGroup", () => {
  const manifest = getCatalogManifest();
  for (const group of manifest.groups) {
    const items = getItemsForGroup(group.id);
    assert.equal(items.length, group.itemIds.length, `group ${group.id} item count mismatch`);
    for (const item of items) {
      assert.equal(item.groupId, group.id);
    }
  }
});

test("getItem / getGroup / getVariant round-trip real manifest ids", () => {
  const manifest = getCatalogManifest();
  const sampleItem = manifest.items[0];
  assert.deepEqual(getItem(sampleItem.id), sampleItem);
  assert.ok(getGroup(sampleItem.groupId));

  const itemWithVariant = manifest.items.find((i) => i.variants.length > 0);
  assert.ok(itemWithVariant, "expected at least one item with variants in the catalog");
  const variant = itemWithVariant!.variants[0];
  assert.deepEqual(getVariant(variant.id), variant);
  assert.deepEqual(getVariantsForItem(itemWithVariant!.id), itemWithVariant!.variants);
});

test("getItem/getGroup/getVariant return undefined for unknown ids", () => {
  assert.equal(getItem("does-not-exist"), undefined);
  assert.equal(getGroup("does-not-exist"), undefined);
  assert.equal(getVariant("does-not-exist"), undefined);
  assert.deepEqual(getItemsForGroup("does-not-exist"), []);
  assert.deepEqual(getVariantsForItem("does-not-exist"), []);
});

// ---------------------------------------------------------------------
// Callback payload validation — guards against a stale/forged callback
// (e.g. an old inline keyboard button pressed after the catalog was
// regenerated, or a crafted callback_data) being trusted blindly.
// ---------------------------------------------------------------------

test("isValidGroupForTier accepts a real group only for its own tier", () => {
  const manifest = getCatalogManifest();
  const group = manifest.groups[0];
  assert.equal(isValidGroupForTier(group.id, group.tier), true);

  const otherTier = (["basic", "standard", "branded"] as const).find((t) => t !== group.tier)!;
  assert.equal(isValidGroupForTier(group.id, otherTier), false);
});

test("isValidGroupForTier rejects an unknown groupId", () => {
  assert.equal(isValidGroupForTier("forged-group-id", "basic"), false);
});

test("isValidItemForGroup accepts a real item only under its own group", () => {
  const manifest = getCatalogManifest();
  const item = manifest.items[0];
  assert.equal(isValidItemForGroup(item.id, item.groupId), true);

  const otherGroup = manifest.groups.find((g) => g.id !== item.groupId)!;
  assert.equal(isValidItemForGroup(item.id, otherGroup.id), false);
});

test("isValidItemForGroup rejects an unknown itemId", () => {
  assert.equal(isValidItemForGroup("forged-item-id", "basic-cotton-polo"), false);
});

test("isValidVariantForItem accepts a real variant only under its own item", () => {
  const manifest = getCatalogManifest();
  const itemWithVariant = manifest.items.find((i) => i.variants.length > 0)!;
  const variant = itemWithVariant.variants[0];
  assert.equal(isValidVariantForItem(variant.id, itemWithVariant.id), true);

  const otherItem = manifest.items.find((i) => i.id !== itemWithVariant.id)!;
  assert.equal(isValidVariantForItem(variant.id, otherItem.id), false);
});

test("isValidVariantForItem rejects an unknown variantId", () => {
  const manifest = getCatalogManifest();
  const item = manifest.items[0];
  assert.equal(isValidVariantForItem("forged-variant-id", item.id), false);
});

// ---------------------------------------------------------------------
// Image resolution — missing/unsupported images must degrade gracefully
// rather than crash the conversation flow.
// ---------------------------------------------------------------------

test("every rendered-page preview image referenced by the manifest exists on disk", () => {
  const manifest = getCatalogManifest();
  for (const item of manifest.items) {
    if (item.previewImage.kind === "rendered-page" && item.previewImage.localPath) {
      const resolved = resolveCatalogAssetPath(item.previewImage.localPath);
      assert.ok(fs.existsSync(resolved), `missing preview asset for item ${item.id}: ${resolved}`);
    }
  }
});

test("placeholder-kind variant images have no localPath (never falsely resolvable)", () => {
  const manifest = getCatalogManifest();
  const placeholders = manifest.items.flatMap((i) => i.variants).filter((v) => v.image.kind === "placeholder");
  for (const variant of placeholders) {
    assert.equal(variant.image.localPath, undefined);
  }
});

test("resolveCatalogAssetPath produces an absolute path under assets/catalog", () => {
  const resolved = resolveCatalogAssetPath("some-source/page-001.jpg");
  assert.ok(resolved.includes("assets"));
  assert.ok(resolved.includes("catalog"));
  assert.ok(resolved.endsWith("page-001.jpg"));
});

test("variantHasDistinctImage is false when a variant has no localPath (e.g. placeholder)", () => {
  const manifest = getCatalogManifest();
  const item = manifest.items.find((i) => i.variants.some((v) => v.image.kind === "placeholder"));
  if (!item) return; // no placeholder in this catalog run — nothing to assert
  const variant = item.variants.find((v) => v.image.kind === "placeholder")!;
  assert.equal(variantHasDistinctImage(item, variant), false);
});

test("variantHasDistinctImage is true only when the variant's image differs from the item's own preview", () => {
  const manifest = getCatalogManifest();
  // Basic-tier items share one photo across all colours on the page —
  // every variant's image equals the parent item's preview image.
  const basicItem = manifest.items.find((i) => i.tier === "basic" && i.variants.length > 0);
  assert.ok(basicItem, "expected at least one basic-tier item with variants");
  for (const variant of basicItem!.variants) {
    assert.equal(variantHasDistinctImage(basicItem!, variant), false);
  }

  // Adidas items have one distinct photo per colour/variant.
  const adidasItem = manifest.items.find((i) => i.sourceId.startsWith("premium-adidas") && i.variants.length > 1);
  if (adidasItem) {
    const distinctVariant = adidasItem.variants.find((v) => v.image.localPath !== adidasItem.previewImage.localPath);
    assert.ok(distinctVariant, "expected at least one Adidas variant with its own distinct photo");
    assert.equal(variantHasDistinctImage(adidasItem, distinctVariant!), true);
  }
});
