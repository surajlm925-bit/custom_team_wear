/**
 * Vercel serverless webhook entry point for Meta WhatsApp Cloud API (or its
 * Tech-Provider wrapper, e.g. Emovur at metagraph.backendprod.com).
 *
 * Security posture (post-2026-10-06 audit, see
 * docs/superpowers/specs/2026-10-06-emovur-integration-design.md):
 *
 *  - GET handshake: standard Meta hub.verify_token echo.
 *  - POST verification: when META_APP_SECRET is set, HMAC-SHA256 of the raw
 *    body is computed and compared against the X-Hub-Signature-256 header
 *    using timingSafeEqual. Missing / mismatched signature -> 401, never 200.
 *    When META_APP_SECRET is unset (cold-start setup window, common when a
 *    Tech Provider doesn't share it), a single WARN per cold start is logged
 *    and POSTs are accepted without verification. Set META_APP_SECRET as
 *    soon as the Meta App Secret is available.
 *  - Logging: never the raw body or headers. We log a structured summary
 *    with message-id / sender-id (masked) / type / timestamp / phone-id only.
 *
 * NOTE: bodyParser is disabled at the route level (see `config` below). We
 * need access to the *exact* bytes Meta sent for the HMAC; allowing Vercel
 * to JSON-parse then re-stringifying would lose key ordering / whitespace
 * and break the signature.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { getEnv } from "../src/config/env.js";
import { claimUpdate } from "../src/session/dedupe.js";
import { BUILD_STAMP } from "../src/config/version.js";
import { handleMessage } from "../src/bot/index.js";
import { waitUntil } from "@vercel/functions";

let buildStampLogged = false;
let signatureWarningLogged = false;

/** Disable Vercel's automatic JSON body parsing; we parse after HMAC check. */
export const config = { api: { bodyParser: false } };

/**
 * Mask a phone number for log output. 1311223999 -> "131***999"
 * Avoids leaking a full PII number while keeping enough digits to debug
 * session / dedupe issues.
 */
function maskPhone(phone: string): string {
  if (!phone) return "";
  if (phone.length <= 6) return phone[0] + "***" + phone[phone.length - 1];
  return phone.slice(0, 3) + "***" + phone.slice(-3);
}

/**
 * Produce a redacted, structured summary of an inbound Meta Cloud API payload.
 * We deliberately exclude: customer message text, customer name, customer
 * wa_id beyond a prefix, profile/image URLs, raw headers.
 */
function summarizePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return { shape: "non-object" };
  const p = payload as Record<string, unknown>;
  const entries = Array.isArray(p["entry"]) ? (p["entry"] as Array<Record<string, unknown>>) : [];
  return {
    object: p["object"],
    entry: entries.map((e) => {
      const changes = Array.isArray(e["changes"]) ? (e["changes"] as Array<Record<string, unknown>>) : [];
      return {
        id: e["id"],
        changes: changes.map((c) => {
          const value = (c["value"] ?? {}) as Record<string, unknown>;
          const metadata = (value["metadata"] ?? {}) as Record<string, unknown>;
          const messages = Array.isArray(value["messages"]) ? (value["messages"] as Array<Record<string, unknown>>) : [];
          return {
            field: c["field"],
            phone_number_id: metadata["phone_number_id"],
            display_phone_number: metadata["display_phone_number"],
            contacts: Array.isArray(value["contacts"]) ? value["contacts"].length : 0,
            messages: messages.map((m) => ({
              id: m["id"],
              from: maskPhone(String(m["from"] ?? "")),
              type: m["type"],
              ts: m["timestamp"],
            })),
            statuses: Array.isArray(value["statuses"]) ? value["statuses"].length : 0,
          };
        }),
      };
    }),
  };
}

/**
 * Constant-time verification of Meta's X-Hub-Signature-256.
 *
 * Meta's spec: signature = "sha256=" + lowercase-hex HMAC-SHA256(appSecret, rawBody).
 * Returns false on any deviation: missing header, wrong algorithm prefix, wrong
 * length, or wrong bytes.
 */
function verifyMetaSignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader) return false;
  const expectedPrefix = "sha256=";
  if (!signatureHeader.startsWith(expectedPrefix)) return false;
  const providedHex = signatureHeader.slice(expectedPrefix.length).trim();
  if (!/^[0-9a-f]+$/i.test(providedHex)) return false;

  const computed = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  if (computed.length !== providedHex.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(providedHex, "hex"));
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!buildStampLogged) {
    console.log(
      `[webhook] build=${BUILD_STAMP} commit=${process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown"} ref=${process.env.VERCEL_GIT_COMMIT_REF ?? "unknown"}`,
    );
    buildStampLogged = true;
  }

  // Meta Webhook Verification (GET request) — standard handshake.
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const env = getEnv();

    if (mode === "subscribe" && token === env.META_WEBHOOK_SECRET) {
      console.log("[webhook] handshake verified");
      res.status(200).send(challenge);
      return;
    }
    res.status(403).send("Forbidden");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  // POST: read exact raw bytes (HMAC needs byte-exact body).
  const rawBody = await readRawBody(req);
  if (rawBody === null) {
    res.status(400).send("Bad Request");
    return;
  }

  const env = getEnv();
  if (env.META_APP_SECRET) {
    const sig = headerString(req.headers || {}, "x-hub-signature-256");
    if (!verifyMetaSignature(rawBody, sig, env.META_APP_SECRET)) {
      console.warn("[webhook] rejected POST: invalid or missing X-Hub-Signature-256");
      res.status(401).send("Invalid signature");
      return;
    }
  } else if (!signatureWarningLogged) {
    signatureWarningLogged = true;
    console.warn(
      "[webhook] META_APP_SECRET is not set; webhook accepting unverified POSTs. Set META_APP_SECRET to enforce HMAC-SHA256 verification.",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    console.warn("[webhook] rejected POST: invalid JSON");
    res.status(400).send("Bad Request");
    return;
  }

  // Redacted summary only — no raw headers / body / message contents.
  console.log("[webhook] received", JSON.stringify(summarizePayload(payload)));

  try {
    let processed = false;
    // --- Meta Cloud API format (also matches Emovur's forwarded payload) ---
    if (
      !processed &&
      (payload as any)?.object === "whatsapp_business_account" &&
      (payload as any)?.entry
    ) {
      // Immediately acknowledge so Emovur/Meta doesn't delay or retry
      res.status(200).send("EVENT_RECEIVED");
      processed = true;

      waitUntil((async () => {
        try {
          for (const entry of (payload as any).entry) {
            for (const change of (entry.changes ?? [])) {
              for (const message of (change.value?.messages ?? [])) {
                console.log(`[webhook] processing message ${message.id}`);
                const isNew = await claimUpdate(message.id);
                console.log(`[webhook] claimUpdate returned ${isNew} for ${message.id}`);
                if (!isNew) continue;

                const from = String(message.from || "");
                if (!from) continue;

                const chatId = `wa:${from}`;
                console.log(`[webhook] calling handleMessage for ${chatId}`);
                await handleMessage(chatId, message);
                console.log(`[webhook] handleMessage completed for ${chatId}`);
              }
            }
          }
        } catch (err) {
          console.error("[webhook] error in background processing:", err);
        }
      })());
    }

    if (!processed) {
      console.warn("[webhook] unrecognised payload shape", {
        type: typeof payload,
        keys: payload && typeof payload === "object" ? Object.keys(payload as object) : null,
      });
      res.status(200).send("EVENT_RECEIVED");
    }
  } catch (err) {
    console.error("[webhook] error processing message:", err);
    // Still return 200 to Meta / Emovur so they don't endlessly retry failing messages.
    if (!res.headersSent) {
      res.status(200).send("EVENT_RECEIVED");
    }
  }
}

/**
 * Read the raw HTTP request body as a Buffer (HMAC needs exact bytes).
 * Tries Vercel's `req.rawBody` first (newer @vercel/node versions), then
 * falls back to streaming the request — works either way regardless of
 * whether bodyParser has consumed the stream.
 */
async function readRawBody(req: VercelRequest): Promise<Buffer | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyReq = req as any;
  if (anyReq.rawBody instanceof Buffer) return anyReq.rawBody;
  if (typeof anyReq.rawBody === "string") return Buffer.from(anyReq.rawBody);

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(null));
  });
}

/** Read a header value in a type-safe way across Vercel's mixed casing. */
function headerString(headers: Record<string, unknown>, name: string): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}