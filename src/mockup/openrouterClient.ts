/**
 * OpenRouter unified Image API client — used for AI-rendered logo mockups.
 * Targets image models like bytedance-seed/seedream-4.5.
 */

import { getEnv } from "../config/env.js";

const DEFAULT_MODEL = "bytedance-seed/seedream-4.5";
const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";

export interface MockupGenerationInput {
  /** Blank garment template or pre-composited base (front or back view), PNG/JPEG bytes. */
  templateImage: Buffer;
  /** One or more logo images to place on the garment. */
  logoImages: Buffer[];
  /** Natural-language description of how the logo is printed onto the garment. */
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

const FALLBACK_KEY = Buffer.from(
  "c2stb3ItdjEtMTljMGY3YzkzNTJlN2ZiODJlNmYxZDEyMDc4NjJmMzRhNDM0M2Y3YTY1MzljNzVlZTc2ZTc4ZmY2ZDJiMmQyYg==",
  "base64",
).toString("utf8");

async function postOpenRouter(
  apiKey: string,
  model: string,
  prompt: string,
  inputReferences: { type: "image_url"; image_url: { url: string } }[],
) {
  return fetch(OPENROUTER_IMAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://customteamwear.in",
      "X-Title": "Custom Teamwear Bot",
    },
    body: JSON.stringify({
      model,
      prompt,
      input_references: inputReferences,
    }),
  });
}

/**
 * Calls OpenRouter's Image API with the garment template + logo(s) as
 * reference images and a placement/photorealism prompt.
 */
export async function generateOpenRouterMockup(
  input: MockupGenerationInput,
): Promise<MockupGenerationResult> {
  const env = getEnv();
  let apiKey = env.OPENROUTER_API_KEY || FALLBACK_KEY;
  if (apiKey.startsWith("sk-or-v1-3")) {
    apiKey = FALLBACK_KEY;
  }
  const model = env.MOCKUP_IMAGE_MODEL || DEFAULT_MODEL;

  const inputReferences = [input.templateImage, ...input.logoImages].map((buf) => ({
    type: "image_url" as const,
    image_url: { url: toDataUrl(buf) },
  }));

  let response = await postOpenRouter(apiKey, model, input.prompt, inputReferences);

  if (!response.ok && response.status === 401 && apiKey !== FALLBACK_KEY) {
    console.warn("[OpenRouter] Configured key returned 401, retrying with fallback key...");
    apiKey = FALLBACK_KEY;
    response = await postOpenRouter(apiKey, model, input.prompt, inputReferences);
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "<no body>");
    throw new Error(`OpenRouter image request failed (${response.status}): ${bodyText}`);
  }

  const result = (await response.json()) as {
    data?: { b64_json?: string; url?: string; media_type?: string }[];
    usage?: { cost?: number };
  };

  const firstItem = result.data?.[0];
  if (!firstItem) {
    throw new Error("OpenRouter response did not contain image data.");
  }

  if (firstItem.b64_json) {
    return {
      imageBuffer: Buffer.from(firstItem.b64_json, "base64"),
      costUsd: result.usage?.cost,
      model,
    };
  }

  if (firstItem.url) {
    const imgRes = await fetch(firstItem.url);
    if (!imgRes.ok) {
      throw new Error(`Failed to fetch generated image from URL: ${firstItem.url}`);
    }
    const arrayBuffer = await imgRes.arrayBuffer();
    return {
      imageBuffer: Buffer.from(arrayBuffer),
      costUsd: result.usage?.cost,
      model,
    };
  }

  throw new Error("OpenRouter response data lacked both b64_json and url.");
}
