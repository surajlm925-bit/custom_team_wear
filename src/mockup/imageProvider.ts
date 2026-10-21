import { generateGeminiMockup } from "./geminiClient.js";
import { generateOpenAiMockup } from "./openaiClient.js";
import { getEnv } from "../config/env.js";

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
  const env = getEnv();
  const provider = (env.MOCKUP_IMAGE_PROVIDER || "openai").toLowerCase();

  if (provider === "gemini") {
    return generateGeminiMockup(input);
  }
  // Default and direct provider is OpenAI (OpenRouter is explicitly not used)
  return generateOpenAiMockup(input);
}
