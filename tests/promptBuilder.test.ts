import test from "node:test";
import assert from "node:assert/strict";
import { buildMockupPrompt, type LogoAssignment } from "../src/mockup/promptBuilder.js";
import { getColorHex } from "../src/catalog/colorHex.js";

test("getColorHex resolves vision-extracted hex codes", () => {
  // Check critical colors extracted via computer vision
  assert.equal(getColorHex("Navy Blue"), "202335");
  assert.equal(getColorHex("Black"), "212126");
  assert.equal(getColorHex("Rama Blue"), "22456C");
  assert.equal(getColorHex("Royal Blue"), "324EB0");
  assert.equal(getColorHex("Bottle Green"), "213C3E");
  assert.equal(getColorHex("Maroon"), "8C1924");
  assert.equal(getColorHex("Mustard"), "DAA248");
  assert.equal(getColorHex("Grey Melange"), "B6BEC7");
  assert.equal(getColorHex("Siemens Green"), "4BDDCB");
  assert.equal(getColorHex("Apple Green"), "78AA9C");
});

test("buildMockupPrompt includes commercial studio lighting and photography specs", () => {
  const assignments: LogoAssignment[] = [{ logoIndex: 0, placement: "left_chest" }];
  const prompt = buildMockupPrompt(
    "front",
    assignments,
    1024,
    1024,
    2,
    { garmentType: "polo", styleLabel: "Cotton Polo", colorName: "Navy Blue" },
    "embroidery",
  );

  assert.ok(prompt.includes("COMMERCIAL APPAREL STUDIO PHOTOGRAPHY & LIGHTING:"));
  assert.ok(prompt.includes("3-point softbox lighting"));
  assert.ok(prompt.includes("45-degree key softbox"));
  assert.ok(prompt.includes("5500K studio strobe illumination"));
  assert.ok(prompt.includes("prime 85mm lens at f/8 aperture"));
  assert.ok(prompt.includes("cyclorama background"));
  assert.ok(prompt.includes("solid Navy Blue (hex #202335)"));
  assert.ok(prompt.includes("High-density 3D machine embroidery"));
});

test("buildMockupPrompt handles white garments without logical contradictions", () => {
  const assignments: LogoAssignment[] = [{ logoIndex: 0, placement: "center_front" }];
  const prompt = buildMockupPrompt(
    "front",
    assignments,
    1024,
    1024,
    2,
    { garmentType: "round_neck", styleLabel: "Bio Wash Round Neck", colorName: "White" },
    "screen_print",
  );

  // Must NOT contain the paradoxical "solid white, NOT white" phrase
  assert.ok(!prompt.includes("solid white, NOT white"));
  assert.ok(prompt.includes("Maintain crisp, clean, natural studio white fabric"));
  assert.ok(prompt.includes("The shirt fabric must remain crisp, clean natural studio white"));
});

test("buildMockupPrompt adapts fabric texture based on garment type", () => {
  const assignments: LogoAssignment[] = [{ logoIndex: 0, placement: "left_chest" }];

  // Polo shirt -> honeycomb pique knit
  const poloPrompt = buildMockupPrompt("front", assignments, 1024, 1024, 2, {
    garmentType: "polo",
    styleLabel: "UF 008",
  });
  assert.ok(poloPrompt.includes("honeycomb pique cotton weave"));

  // Dry Fit -> athletic micro-mesh
  const dryFitPrompt = buildMockupPrompt("front", assignments, 1024, 1024, 2, {
    garmentType: "round_neck",
    styleLabel: "Finch Active Mars Dry Fit",
  });
  assert.ok(dryFitPrompt.includes("athletic micro-mesh polyester knit"));

  // Cotton Round Neck -> ring-spun cotton jersey
  const cottonPrompt = buildMockupPrompt("front", assignments, 1024, 1024, 2, {
    garmentType: "round_neck",
    styleLabel: "Finch Bio Wash Cotton",
  });
  assert.ok(cottonPrompt.includes("combed ring-spun cotton jersey"));
});

test("buildMockupPrompt isolates sleeve instructions to relevant view", () => {
  const assignments: LogoAssignment[] = [
    { logoIndex: 0, placement: "left_sleeve" },
    { logoIndex: 1, placement: "upper_back" },
  ];

  // Front view has left_sleeve -> includes sleeve requirement
  const frontPrompt = buildMockupPrompt("front", assignments, 1024, 1024, 2);
  assert.ok(frontPrompt.includes("SLEEVE PLACEMENT REQUIREMENT"));

  // Back view has only upper_back -> MUST NOT include sleeve requirement
  const backPrompt = buildMockupPrompt("back", assignments, 1024, 1024, 2);
  assert.ok(!backPrompt.includes("SLEEVE PLACEMENT REQUIREMENT"));
});
