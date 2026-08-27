import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeAdvanceDue,
  computeGarmentTotal,
  computeGrandEstimate,
  computePrintEstimate,
  getBracket,
  isSizeSplitComplete,
  meetsMoq,
  resolveEvenSplit,
  resolveStandardMix,
  showsCallMe,
} from "../src/pricing/index.js";
import { SIZE_KEYS } from "../src/pricing/priceBook.js";

test("MOQ gate — AC2", () => {
  assert.equal(meetsMoq(49), false);
  assert.equal(meetsMoq(50), true);
});

test("bracket boundaries — AC12", () => {
  assert.equal(getBracket(99), "50-99");
  assert.equal(getBracket(100), "100+");
});

test("garment total matches price book — AC1 (60 pcs Basic Round Neck Dry Fit)", () => {
  const result = computeGarmentTotal("basic", "dry_fit_round_neck", 60);
  assert.equal(result.ratePerPiece, 169);
  assert.equal(result.total, 60 * 169);
});

test("garment total at 100+ bracket uses discounted rate", () => {
  const result = computeGarmentTotal("standard", "dry_fit_polo", 100);
  assert.equal(result.ratePerPiece, 309);
  assert.equal(result.total, 100 * 309);
});

test("advance due equals garment total only — Option C", () => {
  const garment = computeGarmentTotal("standard", "dry_fit_polo", 80);
  assert.equal(computeAdvanceDue(garment.total), garment.total);
});

test("print estimate range scales with qty", () => {
  const estimate = computePrintEstimate("dtf", 80);
  assert.deepEqual(estimate, { low: 80 * 35, high: 80 * 70 });
});

test("grand estimate = garment (exact) + print (range)", () => {
  const garment = computeGarmentTotal("standard", "dry_fit_polo", 80).total;
  const print = computePrintEstimate("dtf", 80);
  const grand = computeGrandEstimate(garment, print);
  assert.equal(grand.low, garment + print.low);
  assert.equal(grand.high, garment + print.high);
});

test("Call Me visibility — AC3 (qty 300 hidden, 301 shown)", () => {
  assert.equal(showsCallMe(300), false);
  assert.equal(showsCallMe(301), true);
});

test("even split always sums exactly to qty — AC11", () => {
  for (const qty of [50, 51, 55, 80, 100, 137, 1000]) {
    const split = resolveEvenSplit(qty);
    assert.equal(isSizeSplitComplete(split, qty), true, `qty=${qty}`);
    for (const key of SIZE_KEYS) {
      assert.ok(split[key] >= 0);
    }
  }
});

test("standard mix always sums exactly to qty — AC11", () => {
  for (const qty of [50, 51, 55, 80, 100, 137, 1000]) {
    const split = resolveStandardMix(qty);
    assert.equal(isSizeSplitComplete(split, qty), true, `qty=${qty}`);
    for (const key of SIZE_KEYS) {
      assert.ok(split[key] >= 0);
    }
  }
});
