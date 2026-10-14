import { getEnv } from "../config/env.js";
import { uploadMockupImage, isBlobStorageConfigured } from "../storage/blob.js";

const MEDIA_FETCH_TIMEOUT_MS = 5000;

/** Download binary file from WhatsApp Cloud API (or Tech Provider) using Media ID with timeout */
export async function fetchMetaMediaBuffer(fileId: string): Promise<Buffer> {
  const env = getEnv();
  const baseUrl = env.META_API_BASE_URL || "https://graph.facebook.com";
  const url = `${baseUrl}/v20.0/${fileId}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.META_API_TOKEN}`,
  };
  if (env.EMOVUR_CONNECTOR_ID) {
    headers["connector-id"] = env.EMOVUR_CONNECTOR_ID;
    headers["collector-id"] = env.EMOVUR_CONNECTOR_ID;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MEDIA_FETCH_TIMEOUT_MS);

  try {
    const metaRes = await fetch(url, { headers, signal: controller.signal });
    if (!metaRes.ok) {
      const errText = await metaRes.text().catch(() => "");
      throw new Error(`Failed to query media metadata (${metaRes.status}): ${errText}`);
    }

    const meta = (await metaRes.json()) as { url?: string };
    if (!meta.url) throw new Error("WhatsApp media has no download URL");

    const response = await fetch(meta.url, { headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`Failed to download WhatsApp media file (${response.status})`);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export function guessMimeType(buffer: Buffer): string {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer.length > 12 && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.length > 4 && buffer.toString("ascii", 0, 4) === "%PDF") return "application/pdf";
  return "application/octet-stream";
}

/**
 * Ensures an inbound WhatsApp media ID or image URL is transformed into
 * a durable, publicly accessible HTTP URL for admin notifications or storage.
 */
export async function getPublicMediaUrl(mediaIdOrUrl: string, pathnamePrefix = "proofs"): Promise<string | undefined> {
  if (!mediaIdOrUrl) return undefined;
  if (/^https?:\/\//i.test(mediaIdOrUrl)) {
    return mediaIdOrUrl;
  }

  // It's a WhatsApp Media ID
  try {
    if (!isBlobStorageConfigured()) {
      return undefined;
    }
    const buffer = await fetchMetaMediaBuffer(mediaIdOrUrl);
    const mime = guessMimeType(buffer);
    const ext =
      mime === "image/png"
        ? "png"
        : mime === "image/webp"
        ? "webp"
        : mime === "application/pdf"
        ? "pdf"
        : "jpg";

    const uploaded = await uploadMockupImage(
      `${pathnamePrefix}/${Date.now()}-${mediaIdOrUrl}.${ext}`,
      buffer,
      mime,
    );
    return uploaded.url;
  } catch (err) {
    console.warn(`[whatsappMedia] Could not persist media ${mediaIdOrUrl} to public URL:`, err);
    return undefined;
  }
}
