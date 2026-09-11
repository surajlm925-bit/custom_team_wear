/**
 * Durable storage for generated mockup images — Vercel Blob.
 *
 * Every generated front/back mockup is uploaded here BEFORE it is sent to
 * Telegram, so the customer's preview survives beyond Telegram's ephemeral
 * file lifetime and is linkable from the MockupGeneration record + CRM
 * sheet. Telegram file_ids are not a durable archive (they can expire and
 * are only reachable via the bot token); a Blob URL is a stable, public,
 * long-lived reference.
 *
 * The actual `put` call is injectable (BlobUploader) so tests can capture
 * exactly what would be uploaded without touching the network or needing a
 * real BLOB_READ_WRITE_TOKEN. Production uses @vercel/blob's `put`.
 */

import { put } from "@vercel/blob";
import { getEnv } from "../config/env.js";

export interface UploadedMockup {
  /** Durable, publicly reachable URL of the stored image. */
  url: string;
  /** The object pathname within the blob store (stable identifier). */
  pathname: string;
}

export interface BlobUploadInput {
  /** Object path within the store, e.g. "mockups/CTW-.../front.png". */
  pathname: string;
  data: Buffer;
  contentType: string;
  token: string;
}

/** The low-level upload primitive, injectable for tests. */
export type BlobUploader = (input: BlobUploadInput) => Promise<UploadedMockup>;

const defaultUploader: BlobUploader = async ({ pathname, data, contentType, token }) => {
  const result = await put(pathname, data, {
    access: "public",
    contentType,
    token,
    // Generated filenames are already unique per generation+view; keep the
    // pathname stable (no random suffix) so a re-upload of the same view
    // (e.g. a retried generation) replaces rather than duplicating.
    addRandomSuffix: false,
  });
  return { url: result.url, pathname: result.pathname };
};

/** Thrown when durable storage is requested but not configured. */
export class BlobNotConfiguredError extends Error {
  constructor() {
    super("BLOB_READ_WRITE_TOKEN is not configured; durable mockup storage is disabled.");
    this.name = "BlobNotConfiguredError";
  }
}

/** True when durable Blob storage is available (token configured). */
export function isBlobStorageConfigured(): boolean {
  return Boolean(getEnv().BLOB_READ_WRITE_TOKEN);
}

/**
 * Uploads a single generated mockup image to durable storage and returns
 * its stable URL. Throws BlobNotConfiguredError if no token is set — the
 * caller decides whether that is fatal or a soft-degrade (it should never
 * block sending the image to the customer).
 */
export async function uploadMockupImage(
  pathname: string,
  data: Buffer,
  contentType = "image/png",
  uploader?: BlobUploader,
): Promise<UploadedMockup> {
  // An explicitly-injected uploader (tests, or an alternative backend)
  // supplies its own storage and doesn't need the Vercel Blob token.
  if (uploader) {
    return uploader({ pathname, data, contentType, token: "" });
  }
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  if (!token) throw new BlobNotConfiguredError();
  return defaultUploader({ pathname, data, contentType, token });
}
