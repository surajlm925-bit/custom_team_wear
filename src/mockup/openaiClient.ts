/**
 * OpenAI Image API client — used for AI-rendered logo mockups.
 * Targets models like gpt-image-2.5-flare-2026-09-08 via /v1/images/edits.
 */

import { getEnv } from "../config/env.js";
import type { MockupGenerationInput, MockupGenerationResult } from "./imageProvider.js";

const DEFAULT_MODEL = "gpt-image-2.5-flare-2026-09-08";
const OPENAI_IMAGES_EDITS_URL = "https://api.openai.com/v1/images/edits";

function guessMimeType(buffer: Buffer): string {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer.length > 12 && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "image/png";
}

/**
 * Calls OpenAI's Image Edits API with the garment template + logo(s) as
 * reference images using multipart/form-data with image[] array syntax.
 */
export async function generateOpenAiMockup(
  input: MockupGenerationInput,
): Promise<MockupGenerationResult> {
  const env = getEnv();
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    throw new Error("OPENAI_API_KEY (or OPENAI_API) is not configured in environment.");
  }

  const model = env.MOCKUP_IMAGE_MODEL || DEFAULT_MODEL;

  const form = new FormData();
  form.append("model", model);
  form.append("prompt", input.prompt);

  // Template image is reference 1
  const templateMime = guessMimeType(input.templateImage);
  const templateExt = templateMime === "image/jpeg" ? "jpg" : "png";
  form.append(
    "image[]",
    new Blob([new Uint8Array(input.templateImage)], { type: templateMime }),
    `template.${templateExt}`,
  );

  // Logo images are subsequent references
  for (let i = 0; i < input.logoImages.length; i++) {
    const logoBuf = input.logoImages[i];
    const logoMime = guessMimeType(logoBuf);
    const logoExt = logoMime === "image/jpeg" ? "jpg" : "png";
    form.append(
      "image[]",
      new Blob([new Uint8Array(logoBuf)], { type: logoMime }),
      `logo_${i + 1}.${logoExt}`,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout for image synthesis

  try {
    const response = await fetch(OPENAI_IMAGES_EDITS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => "<no body>");
      throw new Error(`OpenAI image edit request failed (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
      usage?: { total_tokens?: number };
    };

    const first = data.data?.[0];
    if (!first) {
      throw new Error("OpenAI response did not contain image data.");
    }

    if (first.b64_json) {
      return {
        imageBuffer: Buffer.from(first.b64_json, "base64"),
        costUsd: undefined,
        model,
      };
    }

    if (first.url) {
      const imgRes = await fetch(first.url);
      if (!imgRes.ok) {
        throw new Error(`Failed to download generated image from OpenAI URL: ${first.url}`);
      }
      const arrayBuf = await imgRes.arrayBuffer();
      return {
        imageBuffer: Buffer.from(arrayBuf),
        costUsd: undefined,
        model,
      };
    }

    throw new Error("OpenAI image response lacked both b64_json and url.");
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}
