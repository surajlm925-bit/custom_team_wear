import { getEnv } from "../config/env.js";
import { uploadMockupImage, isBlobStorageConfigured } from "../storage/blob.js";

/** Download binary file from WhatsApp Cloud API using Media ID */
export async function fetchMetaMediaBuffer(fileId: string): Promise<Buffer> {
  const env = getEnv();
  const metaRes = await fetch(`https://graph.facebook.com/v20.0/${fileId}`, {
    headers: { Authorization: `Bearer ${env.META_API_TOKEN}` },
  });
  const meta = (await metaRes.json()) as { url?: string };
  if (!meta.url) throw new Error("WhatsApp media has no URL");

  const response = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${env.META_API_TOKEN}` },
  });
  if (!response.ok) throw new Error(`Failed to download WhatsApp file (${response.status})`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export function guessMimeType(buffer: Buffer): string {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer.length > 12 && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
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
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
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
