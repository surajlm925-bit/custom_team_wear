import dotenv from "dotenv";
dotenv.config();

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { generateAiMockups } from "../src/mockup/generateAi.js";
import { generateDeterministicMockups } from "../src/mockup/composite.js";
import { buildMockupPrompt, type LogoAssignment } from "../src/mockup/promptBuilder.js";
import { resolveGarmentReference } from "../src/mockup/garmentReference.js";
import { getColorHex, normalizeColorName } from "../src/catalog/colorHex.js";
import { CATALOG_OPTIONS, resolveProductId, type GarmentType, type FabricType } from "../src/catalog/options.js";
import { getZoneForPlacement, type TemplateView } from "../src/mockup/zones.js";
import type { OrderData } from "../src/shared/types.js";
import type { LogoPlacement, PrintMethod, Tier, ProductId } from "../src/pricing/priceBook.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = process.env.MOCKUP_UI_PORT ? parseInt(process.env.MOCKUP_UI_PORT, 10) : 3456;

// Preset SVG badges for instant 1-click testing
export async function makePresetBadge(preset: "titans" | "shield" | "minimal", text?: string): Promise<Buffer> {
  let svg = "";
  if (preset === "titans") {
    const label = text || "TITANS FC";
    svg = `
      <svg width="600" height="600" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#E65100" />
            <stop offset="100%" stop-color="#BF360C" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="8" flood-opacity="0.35"/>
          </filter>
        </defs>
        <circle cx="300" cy="300" r="270" fill="url(#grad)" stroke="#FFFFFF" stroke-width="14" filter="url(#glow)" />
        <polygon points="300,80 360,210 500,230 400,330 425,470 300,400 175,470 200,330 100,230 240,210" fill="#FFFFFF" />
        <rect x="100" y="490" width="400" height="60" rx="30" fill="#1A1A24" stroke="#FFFFFF" stroke-width="6" />
        <text x="300" y="534" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="4">${label}</text>
      </svg>
    `;
  } else if (preset === "shield") {
    const label = text || "ATHLETICS";
    svg = `
      <svg width="600" height="600" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="crest" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0052CC" />
            <stop offset="100%" stop-color="#0747A6" />
          </linearGradient>
        </defs>
        <path d="M300,40 L480,100 L480,320 C480,440 300,560 300,560 C300,560 120,440 120,320 L120,100 Z" fill="url(#crest)" stroke="#FFAB00" stroke-width="16" />
        <path d="M300,80 L440,130 L440,310 C440,410 300,510 300,510 C300,510 160,410 160,310 L160,130 Z" fill="none" stroke="#FFFFFF" stroke-width="6" />
        <text x="300" y="320" font-family="Arial, sans-serif" font-size="72" font-weight="900" fill="#FFFFFF" text-anchor="middle">CTW</text>
        <text x="300" y="380" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#FFAB00" text-anchor="middle" letter-spacing="5">${label}</text>
      </svg>
    `;
  } else {
    const label = text || "STUDIO";
    svg = `
      <svg width="600" height="600" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">
        <circle cx="300" cy="300" r="260" fill="#18181B" stroke="#F4F4F5" stroke-width="12" />
        <circle cx="300" cy="300" r="220" fill="none" stroke="#27272A" stroke-width="4" />
        <text x="300" y="290" font-family="Arial, sans-serif" font-size="64" font-weight="900" fill="#F4F4F5" text-anchor="middle" letter-spacing="6">CUSTOM</text>
        <text x="300" y="360" font-family="Arial, sans-serif" font-size="32" font-weight="600" fill="#A1A1AA" text-anchor="middle" letter-spacing="8">${label}</text>
      </svg>
    `;
  }
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Builds an OrderData object for the mockup pipeline using exact production conventions.
 */
function buildMockOrder(params: {
  tier: Tier;
  garmentType: GarmentType;
  fabricType: FabricType;
  qualityId: string;
  qualityName: string;
  colorName: string;
  printMethod: PrintMethod;
  placements: LogoPlacement[];
}): OrderData {
  const productId: ProductId = resolveProductId(params.garmentType, params.fabricType);
  const silhouette = params.garmentType === "collar" ? "polo" : "round_neck";

  return {
    orderId: `TEST-${Date.now().toString().slice(-6)}`,
    status: "Pending Payment",
    tier: params.tier,
    productId,
    qty: 100,
    sizeSplit: { S: 25, M: 25, L: 25, XL: 25, XXL: 0, "3XL": 0 },
    printMethod: params.printMethod,
    city: "Mumbai",
    name: "Local Test User",
    phone: "9876543210",
    timeline: "standard",
    timelineUrgent: false,
    logoReceived: true,
    catalogSelection: {
      catalogVersion: "v1",
      tier: params.tier,
      groupId: params.fabricType,
      groupLabel: params.fabricType === "cotton" ? "Cotton" : "Polyester",
      itemId: params.qualityId,
      itemLabel: params.qualityName,
      productId,
      garmentType: silhouette,
      sourceId: "catalog",
      sourcePage: 1,
      colorName: params.colorName,
      referenceImageKind: "placeholder",
      mockupEligible: true,
    },
    logos: params.placements.map((p, idx) => ({
      fileId: `logo-${idx}`,
      placement: p,
    })),
  } as unknown as OrderData;
}

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(json);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) {
        // 50MB protection
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  try {
    // 1. GET /api/options — Returns all configuration directly from codebase modules
    if (req.method === "GET" && url.pathname === "/api/options") {
      const placements: { id: LogoPlacement; label: string; view: TemplateView }[] = [
        { id: "left_chest", label: "Left Chest (Emblem)", view: "front" },
        { id: "center_front", label: "Center Front (Torso)", view: "front" },
        { id: "upper_back", label: "Upper Back", view: "back" },
        { id: "left_sleeve", label: "Left Sleeve (Wearer's Left)", view: "front" },
        { id: "right_sleeve", label: "Right Sleeve (Wearer's Right)", view: "front" },
      ];

      const printMethods: { id: PrintMethod; label: string; desc: string }[] = [
        { id: "embroidery", label: "3D Embroidery", desc: "Raised glossy rayon/polyester thread stitches with distinct relief" },
        { id: "screen_print", label: "Screen Print", desc: "Plastisol/water-based ink with fabric weave pattern embossing" },
        { id: "dtf", label: "DTF (Direct-to-Film)", desc: "Vibrant high-res heat-transfer bonded to cotton/polyester fibres" },
        { id: "sublimation", label: "Sublimation", desc: "Dye-infused directly into polyester fibers with zero hand-feel" },
        { id: "none", label: "Standard Apparel Print", desc: "General realistic textile printing" },
      ];

      // Collect distinct colors from CATALOG_OPTIONS
      const colorNamesSet = new Set<string>();
      for (const tierKey of Object.keys(CATALOG_OPTIONS) as Tier[]) {
        const tierProducts = CATALOG_OPTIONS[tierKey];
        for (const prodKey of Object.keys(tierProducts) as ProductId[]) {
          const qualities = tierProducts[prodKey];
          for (const q of qualities) {
            for (const c of q.colors) {
              colorNamesSet.add(c);
            }
          }
        }
      }

      // Format colors with their authentic vision-extracted hex codes
      const colors = Array.from(colorNamesSet)
        .sort()
        .map((name) => {
          const hex = getColorHex(name) || "E0E0E0";
          return {
            name,
            hex: `#${hex}`,
            normalized: normalizeColorName(name),
          };
        });

      // Zones definitions
      const zoneGeometry = placements.map((p) => ({
        placement: p.id,
        view: p.view,
        geometry: getZoneForPlacement(p.id),
      }));

      return sendJson(res, 200, {
        catalogOptions: CATALOG_OPTIONS,
        colors,
        placements,
        printMethods,
        zoneGeometry,
        openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      });
    }

    // 2. POST /api/preview-prompt — Constructs the exact prompt without running AI
    if (req.method === "POST" && url.pathname === "/api/preview-prompt") {
      const rawBody = await readBody(req);
      const data = JSON.parse(rawBody);

      const order = buildMockOrder({
        tier: data.tier || "basic",
        garmentType: data.garmentType || "collar",
        fabricType: data.fabricType || "cotton",
        qualityId: data.qualityId || "val-cp-1-uf-008",
        qualityName: data.qualityName || "UF 008 Cotton Polo",
        colorName: data.colorName || "Navy Blue",
        printMethod: data.printMethod || "embroidery",
        placements: data.placements || ["left_chest"],
      });

      const assignments: LogoAssignment[] = (data.placements || ["left_chest"]).map((p: LogoPlacement, idx: number) => ({
        logoIndex: idx,
        placement: p,
      }));

      // Resolve front prompt
      const frontRef = await resolveGarmentReference(order, "front");
      const { width: fw, height: fh } = await sharp(frontRef.buffer).metadata();
      const frontPrompt = buildMockupPrompt("front", assignments, fw || 1024, fh || 1024, 2, frontRef.descriptor, order.printMethod);

      // Resolve back prompt
      const backRef = await resolveGarmentReference(order, "back");
      const { width: bw, height: bh } = await sharp(backRef.buffer).metadata();
      const backPrompt = buildMockupPrompt("back", assignments, bw || 1024, bh || 1024, 2, backRef.descriptor, order.printMethod);

      return sendJson(res, 200, {
        frontPrompt,
        backPrompt,
        colorHex: getColorHex(data.colorName || "Navy Blue"),
        descriptor: frontRef.descriptor,
      });
    }

    // 3. POST /api/generate — Executes the exact generation pipeline
    if (req.method === "POST" && url.pathname === "/api/generate") {
      const rawBody = await readBody(req);
      const data = JSON.parse(rawBody);

      const placements: LogoPlacement[] = data.placements && data.placements.length > 0 ? data.placements : ["left_chest"];
      const mode: "ai" | "deterministic" | "both" = data.mode || "ai";

      const order = buildMockOrder({
        tier: data.tier || "basic",
        garmentType: data.garmentType || "collar",
        fabricType: data.fabricType || "cotton",
        qualityId: data.qualityId || "val-cp-1-uf-008",
        qualityName: data.qualityName || "UF 008 Cotton Polo",
        colorName: data.colorName || "Navy Blue",
        printMethod: data.printMethod || "embroidery",
        placements,
      });

      const assignments: LogoAssignment[] = placements.map((p, idx) => ({
        logoIndex: idx,
        placement: p,
      }));

      // Prepare logo buffers
      const logoBuffers: Buffer[] = [];
      if (Array.isArray(data.logos) && data.logos.length > 0) {
        for (let i = 0; i < placements.length; i++) {
          const item = data.logos[i] || data.logos[0];
          if (item?.dataUrl) {
            const b64 = item.dataUrl.replace(/^data:image\/\w+;base64,/, "");
            logoBuffers.push(Buffer.from(b64, "base64"));
          } else {
            // Preset fallback
            const badge = await makePresetBadge(data.preset || "titans", data.customText);
            logoBuffers.push(badge);
          }
        }
      } else {
        const badge = await makePresetBadge(data.preset || "titans", data.customText);
        for (let i = 0; i < placements.length; i++) {
          logoBuffers.push(badge);
        }
      }

      const startTime = Date.now();
      const results: {
        engine: "ai" | "deterministic";
        view: TemplateView;
        dataUrl: string;
        costUsd?: number;
        referenceSource: string;
      }[] = [];

      // Generate AI mockups
      if (mode === "ai" || mode === "both") {
        console.log(`[UI Server] Generating AI mockup for order ${order.orderId} (${order.catalogSelection?.colorName})...`);
        const aiResults = await generateAiMockups(order, assignments, logoBuffers);
        for (const r of aiResults) {
          results.push({
            engine: "ai",
            view: r.view,
            dataUrl: `data:image/png;base64,${r.buffer.toString("base64")}`,
            costUsd: r.costUsd,
            referenceSource: r.referenceSource,
          });
        }
      }

      // Generate Deterministic Sharp proofs
      if (mode === "deterministic" || mode === "both") {
        console.log(`[UI Server] Generating Deterministic proof for order ${order.orderId}...`);
        const detResults = await generateDeterministicMockups(order, assignments, logoBuffers);
        for (const r of detResults) {
          results.push({
            engine: "deterministic",
            view: r.view as TemplateView,
            dataUrl: `data:image/png;base64,${r.buffer.toString("base64")}`,
            referenceSource: r.referenceSource,
          });
        }
      }

      const durationMs = Date.now() - startTime;
      console.log(`[UI Server] Generation completed in ${durationMs}ms`);

      return sendJson(res, 200, {
        success: true,
        durationMs,
        orderId: order.orderId,
        colorHex: getColorHex(data.colorName || "Navy Blue"),
        results,
      });
    }

    // 4. Serve static files from scripts/public/
    let reqPath = url.pathname;
    if (reqPath === "/") reqPath = "/index.html";
    const filePath = path.join(PUBLIC_DIR, reqPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".svg": "image/svg+xml",
      };
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // 404
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  } catch (err: any) {
    console.error("[UI Server Error]", err);
    sendJson(res, 500, {
      success: false,
      error: err?.message || String(err),
    });
  }
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`✨ Custom Teamwear Mockup Studio UI Server running!`);
  console.log(`🔗 Local URL: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
