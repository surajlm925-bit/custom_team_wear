/**
 * Provider switch for AI mockup generation. Testing phase defaults to
 * Gemini (free tier); set MOCKUP_IMAGE_PROVIDER=openrouter to use
 * OpenRouter/Seedream instead. Kept as a single switch point so the rest
 * of the mockup pipeline (generateAi.ts, promptBuilder.ts, conversation
 * flow) never needs to know which backend is active.
 */

import { getEnv } from "../config/env.js";
import { generateAiMockup as generateOpenRouterMockup, type MockupGenerationInput, type MockupGenerationResult } from "./openrouterClient.js";
import { generateGeminiMockup } from "./geminiClient.js";

export type { MockupGenerationInput, MockupGenerationResult };

export async function generateMockupImage(
  input: MockupGenerationInput,
): Promise<MockupGenerationResult> {
  const env = getEnv();
  const provider = (env.MOCKUP_IMAGE_PROVIDER || "gemini").toLowerCase();

  if (provider === "openrouter") {
    return generateOpenRouterMockup(input);
  }
  if (provider === "gemini") {
    return generateGeminiMockup(input);
  }
  throw new Error(`Unknown MOCKUP_IMAGE_PROVIDER "${provider}". Use "gemini" or "openrouter".`);
}
