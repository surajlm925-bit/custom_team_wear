/**
 * DETERMINISTIC customer-facing proof compositor (no generative AI).
 *
 * This is the AUTHORITATIVE print proof shown to the customer. It must
 * represent EXACTLY what will be printed, so it is produced by pixel-exact
 * Sharp compositing — never by a generative model that could redraw the
 * garment, recolour it, swap the model, or alter the logo:
 *
 *   base   = the customer's CONFIRMED selected-colour reference image,
 *            used verbatim (every pixel outside the logo zone is identical
 *            to the reference),
 *   logo   = the customer's ORIGINAL uploaded logo bytes, only scaled to
 *            fit inside the chosen placement zone (aspect ratio preserved,
 *            "contain" — never cropped, never recoloured, never redrawn),
 *   output = base with the logo composited at the zone. One output image
 *            per requested view (front/back).
 *
 * A generative "styled visual" may be offered LATER as an explicitly
 * optional extra (see workflow.ts) — it is never the print proof.
 */

import sharp, { type OverlayOptions } from "sharp";
import type { OrderData, MockupView } from "../shared/types.js";
import { getZoneForPlacement, PLACEMENT_VIEWS, type TemplateView } from "./zones.js";
import { resolveGarmentReference, type GarmentReferenceSource } from "./garmentReference.js";
import type { LogoAssignment } from "./promptBuilder.js";
import { viewsForAssignments } from "./promptBuilder.js";

export interface DeterministicMockupResult {
  view: MockupView;
  buffer: Buffer;
  /** Whether the base was the customer's exact catalog garment or a legacy generic template. */
  referenceSource: GarmentReferenceSource;
}

/**
 * Low-level, testable primitive: composite the given logo buffer(s) onto
 * the given base image buffer for a single view. Exposed so tests can
 * assert pixel-exact behaviour (reference preserved outside the zone,
 * logo preserved inside it) with fully controlled inputs. The production
 * pipeline calls this via generateDeterministicMockups.
 */
export async function compositeLogosOntoBase(
  baseBuffer: Buffer,
  view: TemplateView,
  assignments: LogoAssignment[],
  logoBuffers: Buffer[],
): Promise<Buffer> {
  return compositeView(baseBuffer, view, assignments, logoBuffers);
}

/**
 * Composites one or more logos onto a single garment-reference view using
 * pixel-exact Sharp compositing. The reference image is the immutable
 * base; only the logo pixels change, and only inside their zones.
 */
async function compositeView(
  baseBuffer: Buffer,
  view: TemplateView,
  assignments: LogoAssignment[],
  logoBuffers: Buffer[],
): Promise<Buffer> {
  const base = sharp(baseBuffer);
  const meta = await base.metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) {
    throw new Error("Could not read garment reference image dimensions for deterministic compositing.");
  }

  const relevant = assignments.filter((a) => PLACEMENT_VIEWS[a.placement] === view);

  const overlays: OverlayOptions[] = [];
  for (const a of relevant) {
    const zone = getZoneForPlacement(a.placement);
    const zoneW = Math.max(1, Math.round(zone.width * width));
    const zoneH = Math.max(1, Math.round(zone.height * height));
    const zoneLeft = Math.round(zone.x * width);
    const zoneTop = Math.round(zone.y * height);

    // Scale the ORIGINAL logo to fit the zone box, aspect ratio preserved,
    // transparent-padded so it centers without stretch or crop. We do NOT
    // recolour, redraw, or trim the artwork — the logo's own silhouette
    // (including any circle/background it ships with) is preserved exactly.
    const resizedLogo = await sharp(logoBuffers[a.logoIndex])
      .resize(zoneW, zoneH, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    overlays.push({ input: resizedLogo, left: zoneLeft, top: zoneTop });
  }

  // Compositing over the untouched base guarantees every pixel outside the
  // overlaid logo box is byte-for-byte the reference image.
  return base.composite(overlays).png().toBuffer();
}

/**
 * Produces the deterministic proof image(s) for an order — one per
 * distinct view its logos touch (front-only → 1; front+back → 2). The
 * base for each view is the order's confirmed garment reference (exact
 * catalog image for catalog orders; generic template only for legacy
 * orders with no catalog data). Never uses generative AI.
 */
export async function generateDeterministicMockups(
  order: OrderData,
  assignments: LogoAssignment[],
  logoBuffers: Buffer[],
): Promise<DeterministicMockupResult[]> {
  if (assignments.length === 0) {
    throw new Error("At least one logo assignment is required.");
  }
  const views = viewsForAssignments(assignments);
  const results: DeterministicMockupResult[] = [];
  for (const view of views) {
    const ref = await resolveGarmentReference(order, view);
    const buffer = await compositeView(ref.buffer, view, assignments, logoBuffers);
    results.push({ view: view as MockupView, buffer, referenceSource: ref.source });
  }
  return results;
}
