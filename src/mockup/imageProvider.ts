/**
 * Provider switch for AI mockup generation.
 * Uses Gemini standalone client.
 */

import { generateGeminiMockup } from "./geminiClient.js";

export interface MockupGenerationInput {
  /** Blank garment template (front or back view), PNG/JPEG bytes. */
  templateImage: Buffer;
  /** One or more logo images to place on the garment. */
  logoImages: Buffer[];
  /** Natural-language description of where each logo goes (see prompt builder). */
  prompt: string;
}

export interface MockupGenerationResult {
  imageBuffer: Buffer;
  costUsd: number | undefined;
  model: string;
}

export async function generateMockupImage(
  input: MockupGenerationInput,
): Promise<MockupGenerationResult> {
  // Enforce Gemini standalone
  return generateGeminiMockup(input);
}
