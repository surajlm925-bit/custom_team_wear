/**
 * AI mockup generation orchestrator — supports multiple logos at multiple
 * placements in a single order, rendered via the active image provider
 * (src/mockup/imageProvider.ts).
 *
 * EXACT-GARMENT REFERENCE: reference image #1 for each view is the exact
 * garment the customer confirmed in the catalog flow (their selected
 * brand/style + colour photo), resolved via src/mockup/garmentReference.ts
 * — NOT a generic silhouette template. Generic templates are used only
 * for legacy orders that have no catalog data at all. The garment's
 * brand/style/colour are also woven into the prompt so the model
 * preserves them.
 */

import sharp from "sharp";
import type { OrderData } from "../shared/types.js";
import type { TemplateView } from "./zones.js";
import { buildMockupPrompt, viewsForAssignments, type LogoAssignment } from "./promptBuilder.js";
import { generateMockupImage, type MockupGenerationInput, type MockupGenerationResult } from "./imageProvider.js";
import { resolveGarmentReference, type GarmentReferenceSource } from "./garmentReference.js";

/**
 * The AI image-generation call, injectable so tests can capture exactly
 * what reaches the provider (the garment reference image + prompt +
 * logos) without hitting a paid/live API. Defaults to the real provider.
 */
export type MockupImageProvider = (input: MockupGenerationInput) => Promise<MockupGenerationResult>;

export interface AiMockupResult {
  view: TemplateView;
  buffer: Buffer;
  costUsd: number | undefined;
  /** Whether this view used the customer's exact catalog garment or a legacy generic template. */
  referenceSource: GarmentReferenceSource;
}

/**
 * Generates one AI-rendered mockup image per distinct template view
 * touched by the given logo assignments (e.g. front-only placements
 * produce one image; a front+back combination produces two).
 *
 * Each view's garment reference is resolved from the order's catalog
 * selection (exact garment) or, for legacy orders only, a generic
 * silhouette template.
 */
export async function generateAiMockups(
  order: OrderData,
  assignments: LogoAssignment[],
  logoBuffers: Buffer[],
  provider: MockupImageProvider = generateMockupImage,
): Promise<AiMockupResult[]> {
  if (assignments.length === 0) {
    throw new Error("At least one logo assignment is required.");
  }
  const views = viewsForAssignments(assignments);

  // Views are generated in PARALLEL, not sequentially: a front+back order
  // makes two independent ~30-60s AI calls, and running them one after
  // another can exceed Vercel's maxDuration (see vercel.json / api/webhook.ts)
  // even after raising grammY's internal webhook timeout. Running them
  // concurrently keeps total wall-clock time close to a single call.
  const results = await Promise.all(
    views.map(async (view): Promise<AiMockupResult> => {
      const garmentRef = await resolveGarmentReference(order, view);
      const { width, height } = await sharp(garmentRef.buffer).metadata();
      if (!width || !height) {
        throw new Error(`Could not read dimensions of the garment reference image for order ${order.orderId}.`);
      }
      const prompt = buildMockupPrompt(view, assignments, width, height, 2, garmentRef.descriptor);
      const { imageBuffer, costUsd } = await provider({
        templateImage: garmentRef.buffer,
        logoImages: logoBuffers,
        prompt,
      });
      return { view, buffer: imageBuffer, costUsd, referenceSource: garmentRef.source };
    }),
  );
  return results;
}
