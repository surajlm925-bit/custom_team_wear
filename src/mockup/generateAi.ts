/**
 * AI mockup generation orchestrator — supports multiple logos at multiple
 * placements in a single order, rendered via OpenRouter's Image API.
 * Replaces the flat-compositing approach in generate.ts (kept for
 * reference/tests; not used in the live flow once this is wired in).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { ProductId, Silhouette } from "../pricing/priceBook.js";
import { PRODUCT_SILHOUETTE } from "../pricing/priceBook.js";
import type { TemplateView } from "./zones.js";
import { buildMockupPrompt, viewsForAssignments, type LogoAssignment } from "./promptBuilder.js";
import { generateMockupImage } from "./imageProvider.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, "../../assets/mockup-templates");

function templatePath(silhouette: Silhouette, view: TemplateView): string {
  return path.join(TEMPLATES_DIR, `${silhouette}_${view}.png`);
}

export interface AiMockupResult {
  view: TemplateView;
  buffer: Buffer;
  costUsd: number | undefined;
}

/**
 * Generates one AI-rendered mockup image per distinct template view
 * touched by the given logo assignments (e.g. front-only placements
 * produce one image; a front+back combination produces two).
 */
export async function generateAiMockups(
  productId: ProductId,
  assignments: LogoAssignment[],
  logoBuffers: Buffer[],
): Promise<AiMockupResult[]> {
  if (assignments.length === 0) {
    throw new Error("At least one logo assignment is required.");
  }
  const silhouette = PRODUCT_SILHOUETTE[productId];
  const views = viewsForAssignments(assignments);

  const results: AiMockupResult[] = [];
  for (const view of views) {
    const templateImage = await fs.readFile(templatePath(silhouette, view));
    const { width, height } = await sharp(templateImage).metadata();
    if (!width || !height) {
      throw new Error(`Could not read dimensions for template ${silhouette}_${view}.png`);
    }
    const prompt = buildMockupPrompt(view, assignments, width, height);
    const { imageBuffer, costUsd } = await generateMockupImage({
      templateImage,
      logoImages: logoBuffers,
      prompt,
    });
    results.push({ view, buffer: imageBuffer, costUsd });
  }
  return results;
}
