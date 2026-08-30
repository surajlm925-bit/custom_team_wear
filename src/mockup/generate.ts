/**
 * Logo mockup compositor — plain image manipulation (no AI, no per-order
 * cost), per docs/Mockup-Template-Generation.md §1, §8. Loads the correct
 * blank template(s) for the order's garment silhouette + placement, resizes
 * the customer's logo to fit inside the placement zone (preserving aspect
 * ratio, centered), and flattens it onto the template.
 */

import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LogoPlacement, ProductId, Silhouette } from "../pricing/priceBook.js";
import { PRODUCT_SILHOUETTE } from "../pricing/priceBook.js";
import { PLACEMENT_VIEWS, getZoneForPlacement, type TemplateView } from "./zones.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, "../../assets/mockup-templates");

function templatePath(silhouette: Silhouette, view: TemplateView): string {
  return path.join(TEMPLATES_DIR, `${silhouette}_${view}.png`);
}

/**
 * Composites the customer's logo onto the correct template view for the
 * given product + placement. Returns a single PNG buffer.
 */
export async function generateMockups(
  productId: ProductId,
  placement: LogoPlacement,
  logoBuffer: Buffer,
): Promise<{ view: TemplateView; buffer: Buffer }[]> {
  const silhouette = PRODUCT_SILHOUETTE[productId];
  const view = PLACEMENT_VIEWS[placement];
  const buffer = await compositeOnView(silhouette, view, placement, logoBuffer);
  return [{ view, buffer }];
}

async function compositeOnView(
  silhouette: Silhouette,
  view: TemplateView,
  placement: LogoPlacement,
  logoBuffer: Buffer,
): Promise<Buffer> {
  const template = sharp(templatePath(silhouette, view));
  const templateMeta = await template.metadata();
  const templateWidth = templateMeta.width!;
  const templateHeight = templateMeta.height!;

  const zone = getZoneForPlacement(placement);
  const zonePixelWidth = Math.round(zone.width * templateWidth);
  const zonePixelHeight = Math.round(zone.height * templateHeight);
  const zoneLeft = Math.round(zone.x * templateWidth);
  const zoneTop = Math.round(zone.y * templateHeight);

  // Resize the logo to fit inside the zone box, preserving aspect ratio
  // ("contain" fit), transparent-padded so it centers within the box
  // without stretching or cropping the artwork.
  const resizedLogo = await sharp(logoBuffer)
    .resize(zonePixelWidth, zonePixelHeight, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return template
    .composite([{ input: resizedLogo, left: zoneLeft, top: zoneTop }])
    .png()
    .toBuffer();
}
