/**
 * OpenRouter unified Image API client — used for AI-rendered logo mockups.
 *
 * ARCHITECTURE NOTE (deviation from tech.md "no AI/LLM anywhere"):
 * Mockup rendering is a visualization aid, not part of the deterministic
 * pricing/order/payment pipeline. Every rupee figure, every quote, the
 * admin verification loop, and the order lifecycle remain 100% deterministic
 * as before. This is the one scoped exception, used only to produce a
 * preview image of the customer's logo on the garment — see
 * docs/Mockup-Template-Generation.md for the full rationale and the
 * non-AI alternative that was evaluated and rejected as too complex/risky
 * relative to a well-supported hosted API.
 *
 * Testing phase: OpenRouter (model configurable via MOCKUP_IMAGE_MODEL).
 * Handover/production: intended to move to fal.ai or the cheapest
 * equivalent hosted provider once quality is validated — this client is
 * kept provider-agnostic in shape (buffer in, buffer out) so swapping the
 * backend later doesn't touch the conversation flow code.
 */

import { getEnv } from "../config/env.js";

const DEFAULT_MODEL = "google/gemini-3.1-flash-lite-image";
const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";

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

function toDataUrl(buffer: Buffer, mediaType = "image/png"): string {
  return `data:${mediaType};base64,${buffer.toString("base64")}`;
}

/**
 * Calls OpenRouter's Image API with the garment template + logo(s) as
 * reference images and a placement prompt. Returns the generated PNG.
 * Throws on any non-2xx response or missing image data — callers should
 * treat failures as "mockup unavailable" and degrade gracefully (never
 * block order confirmation on this).
 */
export async function generateAiMockup(
  input: MockupGenerationInput,
): Promise<MockupGenerationResult> {
  const env = getEnv();
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured; AI mockup generation is disabled.");
  }
  const model = env.MOCKUP_IMAGE_MODEL || DEFAULT_MODEL;

  const inputReferences = [input.templateImage, ...input.logoImages].map((buf) => ({
    type: "image_url" as const,
    image_url: { url: toDataUrl(buf) },
  }));

  const response = await fetch(OPENROUTER_IMAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: input.prompt,
      input_references: inputReferences,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "<no body>");
    throw new Error(`OpenRouter image request failed (${response.status}): ${bodyText}`);
  }

  const result = (await response.json()) as {
    data?: { b64_json?: string; media_type?: string }[];
    usage?: { cost?: number };
  };

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenRouter response did not contain image data.");
  }

  return {
    imageBuffer: Buffer.from(b64, "base64"),
    costUsd: result.usage?.cost,
    model,
  };
}
