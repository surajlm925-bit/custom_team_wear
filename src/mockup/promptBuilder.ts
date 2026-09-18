/**
 * Builds the natural-language instruction sent to the AI image model,
 * describing where each logo (reference image) should be placed on the
 * garment template (also a reference image). Supports multiple logos at
 * multiple positions in a single generation call — each logo assignment
 * is an independent (logo, placement) pair. A customer wanting the same
 * logo on both front and back simply gets two assignments in the
 * multi-logo loop (once for left_chest, once for upper_back), each
 * pointing at the same uploaded image.
 *
 * CONSISTENCY NOTE: earlier iterations of this prompt used the phrase
 * "ghost mannequin" (standard photography jargon for "garment shape shown
 * without a visible body"), which caused the model to literally render a
 * translucent ghost-shaped figure wearing the shirt. That phrase has been
 * removed entirely. The prompt now frames generation as a minimal edit of
 * the existing template photo (only the logo changes) rather than as a
 * new photo to compose from a style description — this reduces, but per
 * OpenAI/community reports on masked image editing in general, cannot
 * fully eliminate, unwanted changes elsewhere in the image (generative
 * image models regenerate the full frame on every call; no provider
 * guarantees pixel-exact preservation outside an edited region). See
 * docs/Mockup-Template-Generation.md for the deterministic-compositing
 * fallback if AI generation continues to introduce unwanted changes.
 */

import type { LogoPlacement, PrintMethod } from "../pricing/priceBook.js";
import type { TemplateView } from "./zones.js";
import { getZoneForPlacement, PLACEMENT_VIEWS } from "./zones.js";
import type { GarmentDescriptor } from "./garmentReference.js";
import { getColorHex } from "../catalog/colorHex.js";

const PLACEMENT_DESCRIPTIONS: Record<LogoPlacement, string> = {
  left_chest: "the wearer's left chest area (small logo, like a polo emblem)",
  center_front: "the centre of the front torso, large and prominent",
  upper_back: "the upper back, between the shoulder blades",
  left_sleeve: "the left sleeve, over the bicep area (the wearer's left arm, which appears on the RIGHT side of a front-facing photo)",
  right_sleeve: "the right sleeve, over the bicep area (the wearer's right arm, which appears on the LEFT side of a front-facing photo)",
};

const WHITE_TEMPLATE_DESC = "Reference image #1 is a white-base garment template; the garment colour will be set to the hex code specified in the prompt, and all other garment attributes are preserved from this white base.";

const SLEEVE_SIDE_ANGLE_PROMPT = "Also generate a side-angle view showing the sleeve on the garment's side, with the front of the shirt visible alongside the sleeve, so both the sleeve placement and the garment's front are clearly visible.";

export interface LogoAssignment {
  /** Index into the caller's logo image array (0-based). */
  logoIndex: number;
  placement: LogoPlacement;
}

interface PixelBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function zoneToPixelBox(placement: LogoPlacement, templateWidth: number, templateHeight: number): PixelBox {
  const zone = getZoneForPlacement(placement);
  const left = Math.round(zone.x * templateWidth);
  const top = Math.round(zone.y * templateHeight);
  const width = Math.round(zone.width * templateWidth);
  const height = Math.round(zone.height * templateHeight);
  return { left, top, right: left + width, bottom: top + height, width, height };
}

/**
 * Builds the prompt for a single template view (front or back), given
 * only the assignments that apply to that view. `logoRefOffset` is the
 * 1-based reference-image position of logoIndex 0 (i.e. 2 if the template
 * is reference image #1 and logos start at #2), so the prompt text lines
 * up with the actual input_references order sent to the API.
 *
 * templateWidth/templateHeight must be the ACTUAL pixel dimensions of the
 * template image being sent as reference image #1 (see generateAi.ts),
 * so the pixel boxes below are always accurate.
 */
export function buildMockupPrompt(
  view: TemplateView,
  assignments: LogoAssignment[],
  templateWidth: number,
  templateHeight: number,
  logoRefOffset = 2,
  garment?: GarmentDescriptor,
  printMethod?: PrintMethod,
): string {
  const viewLabel = view === "front" ? "front view" : "back view";
  const relevant = assignments.filter((a) => PLACEMENT_VIEWS[a.placement] === view);

  // Describe the exact garment the customer selected so the model
  // preserves brand/style/colour rather than drifting to a generic tee.
  // Deliberately phrased as "keep it exactly as shown" — this is a
  // preservation instruction, not a restyle instruction.
  const garmentTypeWord = garment?.garmentType === "polo" ? "polo shirt" : "round-neck t-shirt";
  const styleClause = garment?.styleLabel ? ` (the "${garment.styleLabel}" style)` : "";
  const colorHex = garment?.colorName ? getColorHex(garment.colorName) : null;
  const colorNameDisplay = garment?.colorName ?? "";
  const colorClause = garment?.colorName
    ? `Its colour is expected to be ${colorNameDisplay} (hex ${colorHex ?? "000000"}); keep this exact colour and shade unchanged.`
    : "";
  const garmentIdentityLine = garment
    ? `Reference image #1 shows the exact ${garmentTypeWord}${styleClause} the customer has chosen. Keep its garment type, brand, style, cut, fabric, and colour exactly as shown — do not substitute a different or generic garment.${colorClause}`
    : "";

  // Print/embroidery texture language for the prompt
  const printMethodKey = printMethod ?? "none";
  const textureLanguage =
    printMethodKey === "embroidery"
      ? "stitch in thread direction matching the original logo"
      : printMethodKey === "dtf" || printMethodKey === "screen_print" || printMethodKey === "sublimation"
        ? "flat ink application, no visible brush strokes"
        : "";

  // Sleeve-side-angle prompt: if any assignment is a sleeve placement, add side-angle view
  const sleeveAssignments = assignments.filter(
    (a) => a.placement === "left_sleeve" || a.placement === "right_sleeve",
  );
  const sleeveSideAnglePrompt =
    sleeveAssignments.length > 0 ? SLEEVE_SIDE_ANGLE_PROMPT : "";

  const placementLines = relevant
    .map((a) => {
      const desc = PLACEMENT_DESCRIPTIONS[a.placement];
      const refNumber = logoRefOffset + a.logoIndex;
      const box = zoneToPixelBox(a.placement, templateWidth, templateHeight);
      const centerX = Math.round(box.left + box.width / 2);
      const centerY = Math.round(box.top + box.height / 2);
      return (
        `- Logo reference image #${refNumber}: place it on ${desc}. ` +
        `In the ${templateWidth}x${templateHeight}px output image, center the logo at pixel position ` +
        `(${centerX}, ${centerY}) measured from the top-left corner, sized to fit within approximately ` +
        `${box.width}px wide by ${box.height}px tall while preserving the logo's original aspect ratio. ` +
        `Do not draw any visible border, outline, frame, or box around the logo or its placement area — ` +
        `only the logo artwork itself should appear on the fabric, blended naturally into the garment with no ` +
        `background box, no guide marks, and no rectangle of any kind.`
      );
    })
    .join("\n");

  // Reference image #1 is now the white-base garment template the customer confirmed
  // in the catalog flow (their selected brand/style + colour), rendered as a white
  // silhouette with the exact colour preserved via the hex code in the prompt.
  const lines = [
    garmentIdentityLine,
    WHITE_TEMPLATE_DESC,
    textureLanguage
      ? `Apply the following texture: ${textureLanguage}.`
      : "",
    sleeveSideAnglePrompt,
    `Reference image #1 is the product photo of the exact garment (${viewLabel}), exactly ${templateWidth}x${templateHeight} pixels. Treat whatever it shows — the garment, its colour and fabric, the background, and any model or scene — as fixed.`,
    "TASK: This is a minimal edit, not a new photo. Start from reference image #1 exactly as given, and make the smallest possible change: add the logo(s) described below onto the garment fabric at the specified position(s). Every other pixel — the garment's type, brand, style, shape, colour, and fabric texture, the background, the camera framing and crop, the lighting, and any model shown — must remain exactly as it is in reference image #1. Do not regenerate or reimagine the scene; treat this as pasting the logo onto the existing photo, not recreating the photo.",
    placementLines,
    "ABSOLUTE RULES — reference image #1 must be reproduced unchanged except for the logo(s):",
    "- Do not change the garment shown. Keep the exact same garment type, brand, style, cut, colour, and fabric as reference image #1 — never swap it for a different or generic garment.",
    "- Do not add or remove a person/model. If reference image #1 shows a model wearing the garment, keep that model exactly as-is; if it shows the garment alone, keep it alone. Do not introduce a mannequin, ghost silhouette, or translucent body.",
    "- Do not change the background, camera angle, crop, framing, garment shape, garment colour, or fabric texture. These must match reference image #1 exactly, pixel-for-pixel, everywhere except inside the logo placement area(s) described above.",
    "- Do not invent, stylize, recolor, redraw, simplify, or omit any part of the logo — including its text or fine detail. Reproduce the logo's exact shape, text, and colours as given in its reference image.",
    "- Preserve the logo's own outer silhouette exactly as drawn in its reference image (for example, a circular badge must stay circular on the garment — never square it off or add a rectangular patch behind it). The rectangular image file containing the logo is just a container; only the actual logo artwork inside it should appear on the garment.",
    "- Do not add any visible frame, border, outline, card, or background box around the logo beyond its own natural edge.",
    "- The result should look like the logo was simply added to reference image #1 with everything else identical — not like a new photo was created.",
    `Output a single image, exactly ${templateWidth}x${templateHeight} pixels, identical in aspect ratio and framing to reference image #1.`,
  ];
  return lines
    .filter((line) => line.trim() !== "")
    .join("\n\n");
}

/** Distinct template views touched by a set of logo assignments. */
export function viewsForAssignments(assignments: LogoAssignment[]): TemplateView[] {
  const views = new Set(assignments.map((a) => PLACEMENT_VIEWS[a.placement]));
  return [...views];
}
