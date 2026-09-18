/**
 * Gemini API client — used for AI-rendered logo mockups (free tier: ~500
 * requests/day on gemini-2.5-flash-image / "Nano Banana", no credit card
 * required as of testing). Same architecture note as openrouterClient.ts
 * applies: this is a scoped exception to tech.md's "no AI" principle,
 * used only for mockup visualization, not the deterministic order/pricing
 * pipeline. See docs/Mockup-Template-Generation.md.
 *
 * Free-tier caveat: Google can change or remove this tier without notice.
 * Kept behind the same MockupGenerationInput/Result shape as
 * openrouterClient.ts so switching provider later is a one-line config
 * change, not a rewrite (see src/mockup/imageProvider.ts).
 */

import { getEnv } from "../config/env.js";
import type { MockupGenerationInput, MockupGenerationResult } from "./imageProvider.js";

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

function guessMimeType(buffer: Buffer): string {
  // PNG signature
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  // JPEG signature
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  return "image/png";
}

/**
 * Calls Gemini's generateContent endpoint with the garment template + logo
 * image(s) as inline image parts, plus a text placement prompt, requesting
 * an image response. Returns the generated PNG/JPEG bytes.
 */
export async function generateGeminiMockup(
  input: MockupGenerationInput,
): Promise<MockupGenerationResult> {
  const env = getEnv();
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured; Gemini mockup generation is disabled.");
  }
  const model = env.MOCKUP_IMAGE_MODEL || DEFAULT_MODEL;

  const imageParts = [input.templateImage, ...input.logoImages].map((buf) => ({
    inlineData: {
      mimeType: guessMimeType(buf),
      data: buf.toString("base64"),
    },
  }));

  const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: input.prompt }, ...imageParts],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE"],
      },
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "<no body>");
    throw new Error(`Gemini image request failed (${response.status}): ${bodyText}`);
  }

  const result = (await response.json()) as {
    candidates?: {
      content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
      finishReason?: string;
    }[];
    promptFeedback?: { blockReason?: string };
  };

  if (result.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the request: ${result.promptFeedback.blockReason}`);
  }

  const parts = result.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    const finishReason = result.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`Gemini response did not contain image data (finishReason: ${finishReason}).`);
  }

  return {
    imageBuffer: Buffer.from(imagePart.inlineData.data, "base64"),
    costUsd: 0, // free tier; no per-request cost reported by the API
    model,
  };
}
