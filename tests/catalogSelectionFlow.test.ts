/**
 * Catalog selection flow — behavioural tests driving the menu-driven
 * runCatalogSelection() state machine with a scripted fake conversation.
 *
 * Covers:
 *  1. Product (garment & fabric) selection.
 *  2. Quality option selection (when multiple exist).
 *  3. Color selection from inline menu buttons.
 *  4. Back and cancel navigation.
 *  5. Direct color finalization without sending catalog page photos.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCatalogSelection } from "../src/conversation/steps/catalogSelection.js";
import { CANCEL } from "../src/conversation/waitHelpers.js";
import type { OrderDraft } from "../src/conversation/draft.js";
import { getQualityOptions } from "../src/catalog/options.js";

// ---------------------------------------------------------------------
// Minimal fake conversation + context harness.
// ---------------------------------------------------------------------

interface SentMessage {
  kind: "text" | "photo";
  text?: string;
  replyMarkup?: unknown;
}

function makeHarness(script: string[]) {
  const sent: SentMessage[] = [];
  let cursor = 0;

  function makeUpdateCtx(data: string) {
    return {
      callbackQuery: { data },
      answerCallbackQuery: async () => {},
      reply: async (text: string, extra?: { reply_markup?: unknown }) => {
        sent.push({ kind: "text", text, replyMarkup: extra?.reply_markup });
      },
      replyWithPhoto: async (_photo: unknown, extra?: { reply_markup?: unknown; caption?: string }) => {
        sent.push({ kind: "photo", text: extra?.caption, replyMarkup: extra?.reply_markup });
      },
    };
  }

  const conversation = {
    async wait() {
      if (cursor >= script.length) {
        throw new Error(
          `Fake conversation ran out of scripted updates (script length ${script.length}). Sent so far:\n` +
            sent.map((s) => `${s.kind}: ${s.text}`).join("\n"),
        );
      }
      return makeUpdateCtx(script[cursor++]);
    },
  };

  const ctx = makeUpdateCtx("");
  return { conversation, ctx, sent, consumed: () => cursor };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function run(
  script: string[],
  draft: OrderDraft = { garmentSilhouette: "collar" },
  tier: "basic" | "standard" | "branded" = "basic",
) {
  const h = makeHarness(script);
  const persist = async () => {};
  const promise = runCatalogSelection(
    h.conversation as any,
    h.ctx as any,
    draft,
    tier,
    persist,
  );
  return { promise, sent: h.sent };
}

// ---------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------

test("full flow: fabric -> quality -> color finalizes catalog selection", async () => {
  const qualities = getQualityOptions("basic", "cotton_polo");
  assert.ok(qualities.length >= 2, "basic cotton_polo should have multiple qualities");
  const chosenQuality = qualities[0];
  const chosenColor = chosenQuality.colors[0];

  const { promise, sent } = run(
    [
      "fabric:cotton",
      `optquality:${chosenQuality.id}`,
      `optcolor:${encodeURIComponent(chosenColor)}`,
    ],
    { garmentSilhouette: "collar" },
    "basic",
  );
  const result = await promise;

  assert.notEqual(result, CANCEL);
  assert.notEqual(result, "back");
  assert.notEqual(result, "assisted");
  const selection = result as Exclude<typeof result, typeof CANCEL | "back" | "assisted">;
  assert.equal(selection.productId, "cotton_polo");
  assert.equal(selection.itemId, chosenQuality.id);
  assert.equal(selection.colorName, chosenColor);
  assert.equal(selection.mockupEligible, true);

  // Assert NO photos were sent (no heavy catalog page image downloads)
  const photoSent = sent.some((s) => s.kind === "photo");
  assert.equal(photoSent, false, "Menu-driven flow must not send catalog photo images");
});

test("auto-selects quality when only one exists and asks for color directly", async () => {
  const qualities = getQualityOptions("basic", "cotton_round_neck");
  assert.equal(qualities.length, 1, "basic cotton_round_neck has single quality");
  const chosenColor = qualities[0].colors[0];

  const { promise } = run(
    [
      "fabric:cotton",
      `optcolor:${encodeURIComponent(chosenColor)}`,
    ],
    { garmentSilhouette: "round_neck" },
    "basic",
  );
  const result = await promise;

  assert.notEqual(result, CANCEL);
  const selection = result as Exclude<typeof result, typeof CANCEL | "back" | "assisted">;
  assert.equal(selection.productId, "cotton_round_neck");
  assert.equal(selection.colorName, chosenColor);
});

test("back from fabric returns back to tier selection", async () => {
  const { promise } = run(["back"], { garmentSilhouette: "collar" }, "basic");
  const result = await promise;
  assert.equal(result, "back");
});

test("cancel at any stage aborts with CANCEL", async () => {
  const { promise: p1 } = run(["cancel"], { garmentSilhouette: "collar" }, "basic");
  assert.equal(await p1, CANCEL);

  const { promise: p2 } = run(["fabric:cotton", "cancel"], { garmentSilhouette: "collar" }, "basic");
  assert.equal(await p2, CANCEL);
});

test("back navigation from color returns to quality selection", async () => {
  const qualities = getQualityOptions("basic", "cotton_polo");
  const q1 = qualities[0];
  const q2 = qualities[1];
  const chosenColor = q2.colors[0];

  const { promise } = run(
    [
      "fabric:cotton",
      `optquality:${q1.id}`,
      "back", // back to quality menu
      `optquality:${q2.id}`,
      `optcolor:${encodeURIComponent(chosenColor)}`,
    ],
    { garmentSilhouette: "collar" },
    "basic",
  );
  const result = await promise;

  assert.notEqual(result, CANCEL);
  const selection = result as Exclude<typeof result, typeof CANCEL | "back" | "assisted">;
  assert.equal(selection.itemId, q2.id);
  assert.equal(selection.colorName, chosenColor);
});
