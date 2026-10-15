import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const envFile = path.join(__dirname, "..", ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[k] = v;
    }
  }
}

import { getEnv } from "../src/config/env.js";

async function main() {
  const env = getEnv();
  const mediaUrl = `${env.META_API_BASE_URL}/v20.0/${env.META_PHONE_NUMBER_ID}/media`;
  const logoPath = path.join(__dirname, "..", "public", "payment-qr.jpg");
  const fileBuffer = fs.readFileSync(logoPath);

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([fileBuffer], { type: "image/jpeg" }), "test-logo.jpg");
  form.append("type", "image/jpeg");

  console.log("Uploading media to:", mediaUrl);
  const res = await fetch(mediaUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.META_API_TOKEN}`,
      ...(env.EMOVUR_CONNECTOR_ID ? { "collector-id": env.EMOVUR_CONNECTOR_ID, "connector-id": env.EMOVUR_CONNECTOR_ID } : {}),
    },
    body: form,
  });

  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Result:", data);
}

main().catch(console.error);
