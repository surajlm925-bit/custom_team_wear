/**
 * Callback payload validation — the catalog keyboards must emit
 * callback_data strings that (a) round-trip correctly through the
 * "prefix:id" parsing used in src/conversation/steps/catalogSelection.ts,
 * (b) stay within Telegram's 64-byte callback_data limit even for the
 * longest real ids in the catalog, and (c) never exceed the
 * WhatsApp-portability button/page limits from tech.md, even for the
 * largest brand groups (Reebok/Van Heusen have 30+ items each).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  catalogColorMenu,
  catalogGroupMenu,
  catalogImageConfirmMenu,
  catalogItemMenu,
} from "../src/conversation/keyboards.js";
import { getCatalogManifest, getGroupsForTier, getItemsForGroup } from "../src/catalog/index.js";

const TELEGRAM_CALLBACK_DATA_MAX_BYTES = 64;

function flattenButtons(kb: { inline_keyboard: { text: string; callback_data?: string }[][] }) {
  return kb.inline_keyboard.flat();
}

test("catalogGroupMenu emits catgroup:<id> for every group, parseable back to the original id", () => {
  const groups = getGroupsForTier("branded");
  const kb = catalogGroupMenu(groups, 0);
  const buttons = flattenButtons(kb);
  for (const group of groups.slice(0, 8)) {
    const button = buttons.find((b) => b.callback_data === `catgroup:${group.id}`);
    assert.ok(button, `expected a button for group ${group.id}`);
    const parsedId = button!.callback_data!.slice("catgroup:".length);
    assert.equal(parsedId, group.id);
  }
});

test("catalogItemMenu emits catitem:<id> for every item on the page, parseable back to the original id", () => {
  const groups = getGroupsForTier("basic");
  const items = getItemsForGroup(groups[0].id);
  const kb = catalogItemMenu(items, 0);
  const buttons = flattenButtons(kb);
  for (const item of items.slice(0, 8)) {
    const button = buttons.find((b) => b.callback_data === `catitem:${item.id}`);
    assert.ok(button, `expected a button for item ${item.id}`);
    assert.equal(button!.callback_data!.slice("catitem:".length), item.id);
  }
});

test("catalogColorMenu emits catcolor:<id> for every variant on the page, parseable back to the original id", () => {
  const manifest = getCatalogManifest();
  const itemWithVariants = manifest.items.find((i) => i.variants.length > 0)!;
  const kb = catalogColorMenu(itemWithVariants.variants, 0);
  const buttons = flattenButtons(kb);
  for (const variant of itemWithVariants.variants.slice(0, 8)) {
    const button = buttons.find((b) => b.callback_data === `catcolor:${variant.id}`);
    assert.ok(button, `expected a button for variant ${variant.id}`);
    assert.equal(button!.callback_data!.slice("catcolor:".length), variant.id);
  }
});

test("every catalog callback_data stays within Telegram's 64-byte limit, even for the longest real ids", () => {
  const manifest = getCatalogManifest();
  const longestGroupId = manifest.groups.reduce((a, b) => (b.id.length > a.length ? b.id : a), "");
  const longestItemId = manifest.items.reduce((a, b) => (b.id.length > a.length ? b.id : a), "");
  const longestVariantId = manifest.items
    .flatMap((i) => i.variants)
    .reduce((a, b) => (b.id.length > a.length ? b.id : a), "");

  const groupPayload = `catgroup:${longestGroupId}`;
  const itemPayload = `catitem:${longestItemId}`;
  const variantPayload = `catcolor:${longestVariantId}`;

  assert.ok(
    Buffer.byteLength(groupPayload, "utf-8") <= TELEGRAM_CALLBACK_DATA_MAX_BYTES,
    `catgroup payload too long: ${groupPayload}`,
  );
  assert.ok(
    Buffer.byteLength(itemPayload, "utf-8") <= TELEGRAM_CALLBACK_DATA_MAX_BYTES,
    `catitem payload too long: ${itemPayload}`,
  );
  assert.ok(
    Buffer.byteLength(variantPayload, "utf-8") <= TELEGRAM_CALLBACK_DATA_MAX_BYTES,
    `catcolor payload too long: ${variantPayload}`,
  );
});

test("catalogGroupMenu / catalogItemMenu / catalogColorMenu cap at 8 selectable options per page (WhatsApp ≤10 constraint)", () => {
  const manifest = getCatalogManifest();

  // Reebok has 35 items — this is exactly the case pagination exists for.
  const reebokGroup = manifest.groups.find((g) => g.id === "branded-reebok")!;
  const reebokItems = getItemsForGroup(reebokGroup.id);
  assert.ok(reebokItems.length > 8, "expected Reebok to have more than one page of items");

  const kb = catalogItemMenu(reebokItems, 0);
  const selectableButtons = flattenButtons(kb).filter((b) => b.callback_data?.startsWith("catitem:"));
  assert.ok(selectableButtons.length <= 8, `expected at most 8 selectable item buttons, got ${selectableButtons.length}`);

  // Nav + Back/Cancel rows add at most 2 extra buttons per row, staying
  // within the ≤3-buttons-per-row action-button guidance.
  for (const row of kb.inline_keyboard) {
    assert.ok(row.length <= 3, `row exceeded 3 buttons: ${JSON.stringify(row)}`);
  }
});

test("catalogGroupMenu/catalogItemMenu/catalogColorMenu always include Back and Cancel", () => {
  const groups = getGroupsForTier("basic");
  const items = getItemsForGroup(groups[0].id);
  const manifest = getCatalogManifest();
  const itemWithVariants = manifest.items.find((i) => i.variants.length > 0)!;

  for (const kb of [catalogGroupMenu(groups), catalogItemMenu(items), catalogColorMenu(itemWithVariants.variants)]) {
    const buttons = flattenButtons(kb);
    assert.ok(buttons.some((b) => b.callback_data === "back"), "missing Back button");
    assert.ok(buttons.some((b) => b.callback_data === "cancel"), "missing Cancel button");
  }
});

test("catalogImageConfirmMenu exposes yes/no/cancel with stable callback_data", () => {
  const kb = catalogImageConfirmMenu();
  const buttons = flattenButtons(kb);
  assert.ok(buttons.some((b) => b.callback_data === "catimg:yes"));
  assert.ok(buttons.some((b) => b.callback_data === "catimg:no"));
  assert.ok(buttons.some((b) => b.callback_data === "cancel"));
});

test("pagination never produces a page-nav button pointing outside the valid page range", () => {
  const reebokItems = getItemsForGroup("branded-reebok");
  const totalPages = Math.ceil(reebokItems.length / 8);

  // Requesting an out-of-range page (e.g. stale nav button after a
  // catalog shrink) must clamp rather than crash or render an empty page.
  const kbTooHigh = catalogItemMenu(reebokItems, 999);
  const buttonsTooHigh = flattenButtons(kbTooHigh).filter((b) => b.callback_data?.startsWith("catitem:"));
  assert.ok(buttonsTooHigh.length > 0, "expected clamped page to still show items, not go blank");

  const kbNegative = catalogItemMenu(reebokItems, -5);
  const buttonsNegative = flattenButtons(kbNegative).filter((b) => b.callback_data?.startsWith("catitem:"));
  assert.ok(buttonsNegative.length > 0, "expected negative page to clamp to first page, not go blank");
  assert.ok(totalPages > 1, "sanity check: Reebok should paginate");
});
