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

export const WHITE_TEMPLATE_DESC = "Reference image #1 is a white-base garment template; the garment colour will be set to the hex code specified in the prompt, and all other garment attributes are preserved from this white base.";

const SLEEVE_INSTRUCTION = "SLEEVE PLACEMENT REQUIREMENT: The sleeve logo must be cleanly printed on the upper arm / bicep sleeve fabric as specified, conforming naturally to the sleeve curve and clearly visible in this studio view.";

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

function getFabricTextureDescription(garment?: GarmentDescriptor): string {
  const isPolo = garment?.garmentType === "polo";
  const label = (garment?.styleLabel ?? "").toLowerCase();
  const isDryFit = label.includes("dry") || label.includes("poly") || label.includes("active") || label.includes("mars");

  if (isDryFit) {
    return "High-performance athletic micro-mesh polyester knit with subtle moisture-wicking weave micro-texture, gentle performance sheen, and crisp aerodynamic drape.";
  }
  if (isPolo) {
    return "Premium honeycomb pique cotton weave with distinct waffle-knit micro-texture, structured ribbed knit collar, and authentic tactile cloth hand-feel.";
  }
  return "High-grade 100% combed ring-spun cotton jersey with fine textile weave, smooth natural matte finish, and realistic soft fabric drape folds.";
}

const STUDIO_LIGHTING_SPEC = [
  "COMMERCIAL APPAREL STUDIO PHOTOGRAPHY & LIGHTING:",
  "- Lighting: Professional high-end commercial apparel studio setup with 3-point softbox lighting. A large 45-degree key softbox provides soft, natural wrap-around illumination; a diffused fill light preserves rich tonal gradations in fabric folds without harsh shadows; a subtle rim kicker light provides crisp edge separation against the background.",
  "- Color & White Balance: Daylight-balanced 5500K studio strobe illumination with neutral color fidelity, high CRI 98+, and zero color cast.",
  "- Optics: Shot on a prime 85mm lens at f/8 aperture, ensuring tack-sharp clarity across the entire garment from collar to hem, with deep depth of field and zero optical distortion.",
  "- Background & Environment: Clean, pristine commercial studio cyclorama background (neutral soft light grey / off-white infinity studio cove) with subtle, realistic contact shadow beneath the garment hem for grounded three-dimensionality.",
].join("\n");

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
  const garmentTypeWord = garment?.garmentType === "polo" ? "polo shirt" : "round-neck t-shirt";
  const styleClause = garment?.styleLabel ? ` (the "${garment.styleLabel}" style)` : "";
  const colorHex = garment?.colorName ? getColorHex(garment.colorName) : null;
  const colorNameDisplay = garment?.colorName ?? "";
  const isWhiteColor = !colorNameDisplay || colorNameDisplay.toLowerCase() === "white";

  const fabricDescription = getFabricTextureDescription(garment);

  const colorInstruction = !isWhiteColor
    ? `GARMENT COLOR: The base garment in Reference Image #1 is a white template. You MUST recolor the entire garment fabric to solid ${colorNameDisplay}${colorHex ? ` (hex #${colorHex})` : ""}. Retain all garment folds, creases, highlights, shadows, buttons, collar, seams, and the neutral studio background, but the shirt fabric itself must be fully dyed in solid ${colorNameDisplay}${colorHex ? ` (hex #${colorHex})` : ""}, NOT white.`
    : `GARMENT COLOR: The base garment in Reference Image #1 is a clean white template. Maintain crisp, clean, natural studio white fabric (#FFFFFF) with authentic subtle shadow gradations in the folds and drape.`;

  // Print/embroidery texture language for the prompt
  const printMethodKey = printMethod ?? "none";
  const textureLanguage =
    printMethodKey === "embroidery"
      ? "High-density 3D machine embroidery: raised glossy rayon/polyester thread stitches with distinct stitch direction, authentic physical relief, and realistic cast micro-shadows along the thread edges."
      : printMethodKey === "screen_print"
        ? "Authentic screen-printed plastisol/water-based ink: matte finish with the garment's fabric weave pattern subtly embossing through the ink, natural ink layer thickness, conforming perfectly to cloth ripples."
        : printMethodKey === "dtf"
          ? "Direct-to-film (DTF) heat-transfer print: sharp, vibrant ink layer seamlessly bonded to the cotton/polyester fibres, bending naturally with every fold and crease of the garment."
          : printMethodKey === "sublimation"
            ? "Dye-sublimation: ink fully infused into the garment fibers with zero edge thickness, flawlessly taking on all highlights, shadows, and cloth texture of the garment."
            : "Professional garment print: physically printed onto the textile, adopting the fabric's natural weave, folds, lighting, and ambient shadows.";

  // Sleeve-side instruction: only add if a sleeve placement is on the current view
  const hasSleeve = relevant.some(
    (a) => a.placement === "left_sleeve" || a.placement === "right_sleeve",
  );
  const sleeveInstruction = hasSleeve ? SLEEVE_INSTRUCTION : "";

  const placementLines = relevant
    .map((a) => {
      const desc = PLACEMENT_DESCRIPTIONS[a.placement];
      const refNumber = logoRefOffset + a.logoIndex;
      const box = zoneToPixelBox(a.placement, templateWidth, templateHeight);
      const centerX = Math.round(box.left + box.width / 2);
      const centerY = Math.round(box.top + box.height / 2);
      return (
        `- Logo reference image #${refNumber}: print it on ${desc}. ` +
        `In the ${templateWidth}x${templateHeight}px output image, position the logo centered at pixel coordinate ` +
        `(${centerX}, ${centerY}) measured from the top-left corner, scaled to fit within approximately ` +
        `${box.width}px wide by ${box.height}px tall while strictly preserving its original aspect ratio. ` +
        `Only the graphic elements of the logo should be printed onto the garment — never print a bounding box, background rectangle, card, outline, or guide marks.`
      );
    })
    .join("\n");

  const colorPreservationLine = isWhiteColor
    ? "- The shirt fabric must remain crisp, clean natural studio white as shown in Reference Image #1."
    : `- The shirt fabric must be colored solid ${colorNameDisplay}${colorHex ? ` (hex #${colorHex})` : ""}, NOT white.`;

  const lines = [
    `GARMENT SPECIFICATION: Reference image #1 shows the exact ${garmentTypeWord}${styleClause} (${viewLabel}), exactly ${templateWidth}x${templateHeight} pixels.`,
    `FABRIC TEXTILE: ${fabricDescription}`,
    colorInstruction,
    `PRINTING SPECIFICATION: ${textureLanguage}`,
    STUDIO_LIGHTING_SPEC,
    sleeveInstruction,
    `TASK: Photorealistic commercial apparel product mockup. Color the garment fabric to ${isWhiteColor ? "crisp natural white" : `${colorNameDisplay}${colorHex ? ` (hex #${colorHex})` : ""}`} as specified, and seamlessly print the logo(s) onto the fabric at the exact specified position(s).`,
    "PHYSICAL PRINT REALISM REQUIREMENTS:",
    "- Fabric Deformation: The printed logo must warp and deform naturally with the folds, creases, wrinkles, and curvature of the garment fabric beneath it.",
    "- Lighting & Shadows: The printed logo must receive the exact same 3-point studio lighting, directional highlights, and shadow gradients present across that region of the shirt. It must not look like a flat sticker pasted on top; it must look physically printed on the garment.",
    "- Surface Finish: Apply the specified print texture so the ink/stitching feels tactile and authentic to real apparel manufacturing.",
    placementLines,
    "PRESERVATION RULES:",
    "- Preserve the exact garment cut, style, collar, seams, buttons, framing, and neutral background from Reference Image #1.",
    colorPreservationLine,
    "- Reproduce the logo's exact colors, typography, and iconography without altering or simplifying the artwork.",
    "- Do not add any white square, background border, or canvas box behind the logo. If the logo reference has a rectangular background canvas, isolate and print only the logo insignia onto the garment.",
    `Output a single, high-definition, commercial e-commerce product photograph, exactly ${templateWidth}x${templateHeight} pixels.`,
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
