/**
 * Catalog ingestion script — regenerates src/catalog/data/catalog.generated.json
 * (and the preview images under assets/catalog/) from every PDF under quality/.
 *
 * Run with: npm run generate-catalog
 *
 * This is the ONLY place the catalog JSON is produced — never hand-edit
 * catalog.generated.json directly (it's overwritten on every run). To fix
 * a mis-parsed label/colour/productId, edit src/catalog/data/overrides.json
 * instead; it's shallow-merged over the auto-extracted data every run.
 *
 * Design notes (see the pre-implementation report in chat for the full
 * per-PDF extraction-quality breakdown):
 *  - Basic tier (4 PDFs): one page = one "Quality No." fabric/GSM variant;
 *    each page becomes its own CatalogItem, colours living on that same
 *    page become CatalogVariants (all sharing the page's single photo).
 *  - Standard tier (2 PDFs): one PDF = one design ("Design No:"), pages
 *    are per-colour photos; the whole PDF becomes one CatalogItem with
 *    one CatalogVariant per page.
 *  - Adidas (Premium): reliable structured fields per page (Article No,
 *    Color, Material, Sizes...). Grouped by the trailing product-name
 *    line into CatalogItems, one CatalogVariant per matching page.
 *    Non-apparel product lines (shoes/socks/bags/caps/etc) are dropped.
 *  - Stellars (Premium, 3 PDFs): no per-colour photos in the PDF itself;
 *    colour swatches are hyperlinks to hosted JPEGs. Each PDF -> one
 *    CatalogItem; each linked swatch -> one CatalogVariant whose image is
 *    downloaded and mirrored locally (sourceUrl kept for traceability).
 *  - Reebok + Van Heusen (Premium): fully image-only PDFs, zero
 *    extractable text. Falls back to one CatalogItem per page with
 *    needsReview=true and a generic label — a human must patch these via
 *    overrides.json before they're trustworthy for a real order.
 */

import * as mupdf from "mupdf";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CatalogGroup,
  CatalogImageRef,
  CatalogItem,
  CatalogManifest,
  CatalogOverridesFile,
  CatalogSourceInfo,
  CatalogTier,
  CatalogVariant,
  ExtractionQuality,
} from "../src/catalog/types.js";
import type { ProductId, Silhouette } from "../src/pricing/priceBook.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const QUALITY_DIR = path.join(ROOT, "quality");
const ASSETS_DIR = path.join(ROOT, "assets", "catalog");
const DATA_DIR = path.join(ROOT, "src", "catalog", "data");
const MANIFEST_PATH = path.join(DATA_DIR, "catalog.generated.json");
const OVERRIDES_PATH = path.join(DATA_DIR, "overrides.json");

const SCHEMA_VERSION = 1;
/** Target output width in px — scale is derived per-page from this rather than a fixed zoom factor, since source PDFs vary wildly in native page size (e.g. some catalogs are authored at 3000x4500pt). A fixed zoom on those would render multi-thousand-px images and can exhaust the WASM heap. */
const TARGET_WIDTH_PX = 1600;
const JPEG_QUALITY = 82;

// ---------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function pageLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Fixes the dropped-glyph mangling MuPDF sometimes produces for ligatures like "fi". */
function fixMangledGlyphs(text: string): string {
  return text
    .replace(/Dry\ufffdit/gi, "Dryfit")
    .replace(/\ufffd/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/craed/gi, "crafted")
    .replace(/s\uFFFDt/gi, "stit");
}

// ---------------------------------------------------------------------
// Rendering + downloads
// ---------------------------------------------------------------------

interface RenderedPage {
  buffer: Buffer;
  width: number;
  height: number;
}

function renderPage(doc: mupdf.Document, pageIndex: number): RenderedPage {
  const page = doc.loadPage(pageIndex);
  try {
    const bounds = page.getBounds();
    const pageWidthPt = bounds[2] - bounds[0];
    const scale = pageWidthPt > 0 ? Math.min(TARGET_WIDTH_PX / pageWidthPt, 2) : 1.5;
    const matrix = mupdf.Matrix.scale(scale, scale);
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
    try {
      const jpeg = pixmap.asJPEG(JPEG_QUALITY, false);
      const width = pixmap.getWidth();
      const height = pixmap.getHeight();
      return { buffer: Buffer.from(jpeg), width, height };
    } finally {
      pixmap.destroy();
    }
  } finally {
    page.destroy();
  }
}

/** Extracts a page's plain text while promptly releasing the WASM page/structured-text objects — needed because these PDFs can have very large native page sizes and leaving pages alive across a whole-document loop exhausts the WASM heap. */
function extractPageText(doc: mupdf.Document, pageIndex: number): string {
  const page = doc.loadPage(pageIndex);
  try {
    const structured = page.toStructuredText();
    try {
      return structured.asText();
    } finally {
      structured.destroy();
    }
  } finally {
    page.destroy();
  }
}

/** Same as extractPageText but also returns each link's URI, then releases the page. */
function extractPageTextAndLinks(doc: mupdf.Document, pageIndex: number): { text: string; linkUris: string[] } {
  const page = doc.loadPage(pageIndex);
  try {
    const structured = page.toStructuredText();
    let text: string;
    try {
      text = structured.asText();
    } finally {
      structured.destroy();
    }
    const linkUris = page
      .getLinks()
      .map((l) => l.getURI())
      .filter((u): u is string => Boolean(u));
    return { text, linkUris };
  } finally {
    page.destroy();
  }
}

function savePreview(sourceSlug: string, pageNumber: number, rendered: RenderedPage): CatalogImageRef {
  const dir = path.join(ASSETS_DIR, sourceSlug);
  ensureDir(dir);
  const filename = `page-${String(pageNumber).padStart(3, "0")}.jpg`;
  fs.writeFileSync(path.join(dir, filename), rendered.buffer);
  return {
    kind: "rendered-page",
    localPath: `${sourceSlug}/${filename}`,
    width: rendered.width,
    height: rendered.height,
  };
}

const downloadCache = new Map<string, CatalogImageRef | undefined>();

const DOWNLOAD_TIMEOUT_MS = 15_000;

async function downloadExternalImage(sourceSlug: string, url: string): Promise<CatalogImageRef | undefined> {
  if (downloadCache.has(url)) return downloadCache.get(url);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const hash = sha256(buffer).slice(0, 12);
    const dir = path.join(ASSETS_DIR, sourceSlug);
    ensureDir(dir);
    const ext = url.toLowerCase().endsWith(".png") ? "png" : "jpg";
    const filename = `ext-${hash}.${ext}`;
    fs.writeFileSync(path.join(dir, filename), buffer);
    const ref: CatalogImageRef = {
      kind: "external-link",
      localPath: `${sourceSlug}/${filename}`,
      sourceUrl: url,
    };
    downloadCache.set(url, ref);
    return ref;
  } catch (err) {
    console.warn(`  ⚠ failed to download ${url}: ${String(err instanceof Error ? err.message : err)}`);
    downloadCache.set(url, undefined);
    return undefined;
  }
}

// ---------------------------------------------------------------------
// Colour-name extraction (Basic / Standard heuristic)
// ---------------------------------------------------------------------

const COLOR_LINE_STOPLIST: RegExp[] = [
  /^\d+$/, // bare page numbers
  /^\d+['\u2019]\d+$/, // heights, e.g. 5'8
  /^(XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL)$/i,
  /gsm/i,
  /quality no/i,
  /design no/i,
  /fabric type/i,
  /catalog/i,
  /tshirts?$/i,
  /available sizes/i,
  /^\d+\s*\d*$/, // stray "1 2" page markers
  /%\s*(polyester|cotton|poly|spandex)/i,
  /^(polyester|cotton|poly-cotton|pure cotton|spandex)$/i,
  /mercerised|airtex|biowash|honeycomb|body touching|micro polyester|spun blended|cotton feel|cotton like polyester/i,
  /regular fit/i,
  /^\(.*\)$/,
  /^(medium|large|small|x-?large)$/i,
  /^\d+%\s*(polyester|cotton)\s*$/i,
];

/**
 * Colour names in the Basic-tier PDFs are laid out as a grid of small
 * swatch chips, so MuPDF's asText() sometimes wraps a single two-word
 * colour ("BOTTLE GREEN") across two separate lines ("BOTTLE" / "GREEN").
 * A bare suffix line immediately following a plausible colour word is
 * merged into a single compound name rather than kept as two entries.
 */
const COLOR_SUFFIX_WORDS = /^(green|blue|melange|grey|gold)$/i;

function isLikelyColorLine(line: string): boolean {
  if (line.length < 2 || line.length > 24) return false;
  if (!/^[A-Za-z][A-Za-z .]*$/.test(line)) return false;
  return !COLOR_LINE_STOPLIST.some((re) => re.test(line));
}

function extractColorCandidates(text: string): string[] {
  const rawLines = pageLines(text);
  const merged: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!isLikelyColorLine(line)) continue;

    const next = rawLines[i + 1];
    if (next && COLOR_SUFFIX_WORDS.test(next) && !COLOR_SUFFIX_WORDS.test(line)) {
      merged.push(`${line} ${next}`);
      i += 1; // consume the suffix line
      continue;
    }
    if (COLOR_SUFFIX_WORDS.test(line)) {
      // An orphaned suffix word with no preceding colour on this pass —
      // attach it to the previously merged entry if there is one,
      // otherwise drop it (can't form a usable standalone colour name).
      continue;
    }
    merged.push(line);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of merged) {
    const canonical = titleCase(line);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

// ---------------------------------------------------------------------
// productId inference (garment type + fabric text -> pricing SKU)
// ---------------------------------------------------------------------

function inferProductId(garmentType: Silhouette, fabricText: string | undefined): ProductId {
  const text = (fabricText ?? "").toLowerCase();
  const cottonPct = Number(text.match(/(\d+)\s*%\s*cotton/)?.[1] ?? NaN);
  const polyPct = Number(text.match(/(\d+)\s*%\s*(?:polyester|poly)/)?.[1] ?? NaN);

  let isDryFit: boolean;
  if (!Number.isNaN(cottonPct) && !Number.isNaN(polyPct)) {
    isDryFit = polyPct > cottonPct;
  } else if (/nano-?dry|dri-?fit|dry-?fit|drifit/.test(text)) {
    isDryFit = true;
  } else if (/cotton/.test(text)) {
    isDryFit = false;
  } else if (/polyester|poly\b/.test(text)) {
    isDryFit = true;
  } else {
    isDryFit = false;
  }

  if (garmentType === "polo") return isDryFit ? "dry_fit_polo" : "cotton_polo";
  return isDryFit ? "dry_fit_round_neck" : "cotton_round_neck";
}

// ---------------------------------------------------------------------
// Per-source parsers
// ---------------------------------------------------------------------

interface ParseContext {
  doc: mupdf.Document;
  sourceInfo: CatalogSourceInfo;
  tier: CatalogTier;
  groupId: string;
}

interface ParseResult {
  items: CatalogItem[];
}

let itemCounter = 0;
function nextItemId(groupId: string): string {
  itemCounter += 1;
  return `${groupId}-i${itemCounter}`;
}
let variantCounter = 0;
function nextVariantId(itemId: string): string {
  variantCounter += 1;
  return `${itemId}-v${variantCounter}`;
}

/** Basic tier: one page = one Quality No. item; colours are same-page swatches sharing that page's photo. */
function parseBasicPdf(
  ctx: ParseContext,
  garmentType: Silhouette,
  productId: ProductId,
  labelPrefix: string,
): ParseResult {
  const { doc, sourceInfo, tier, groupId } = ctx;
  const items: CatalogItem[] = [];
  const n = doc.countPages();

  for (let i = 0; i < n; i++) {
    const text = fixMangledGlyphs(extractPageText(doc, i));
    const qualityMatch = /quality no\.?\s*([a-z0-9]+)/i.exec(text);
    const fitMatch = /regular fit(?:\s*\(w\/tipping\))?\s*\|\s*(\d+)\s*gsm/i.exec(text);
    const fabricMatch = /(\d+%\s*(?:polyester|cotton)(?:\s*\d+%\s*(?:polyester|cotton))?)/i.exec(text);

    const styleCode = qualityMatch?.[1];
    const gsm = fitMatch ? Number(fitMatch[1]) : undefined;
    const fabric = fabricMatch?.[1]?.replace(/\s+/g, " ").trim();

    const rendered = renderPage(doc, i);
    const previewImage = savePreview(sourceInfo.id, i + 1, rendered);

    const itemId = nextItemId(groupId);
    const label = styleCode ? `${labelPrefix} — Quality No. ${styleCode}` : `${labelPrefix} — Page ${i + 1}`;

    const colorNames = extractColorCandidates(text);
    const variants: CatalogVariant[] = colorNames.map((colorName) => ({
      id: nextVariantId(itemId),
      colorName,
      sourcePage: i + 1,
      image: previewImage,
    }));

    items.push({
      id: itemId,
      groupId,
      tier,
      label,
      productId,
      garmentType,
      styleCode,
      fabric,
      gsm,
      sourceId: sourceInfo.id,
      sourcePage: i + 1,
      previewImage,
      variants,
      needsReview: !styleCode,
    });
  }

  return { items };
}

/** Standard tier: whole PDF is one design ("Design No:"); each page is a colour photo. */
function parseStandardPdf(
  ctx: ParseContext,
  garmentType: Silhouette,
  productId: ProductId,
  labelPrefix: string,
): ParseResult {
  const { doc, sourceInfo, tier, groupId } = ctx;
  const n = doc.countPages();

  let designName = labelPrefix;
  let fabric: string | undefined;
  let gsm: number | undefined;

  const variants: CatalogVariant[] = [];
  const itemId = nextItemId(groupId);

  let heroImage: CatalogImageRef | undefined;
  let heroPage = 1;

  for (let i = 0; i < n; i++) {
    const text = fixMangledGlyphs(extractPageText(doc, i));
    const designMatch = /design no:\s*(.+)/i.exec(text);
    const fabricMatch = /fabric type\s*:\s*(.+?)(?:\n|$)/i.exec(text);
    const gsmMatch = /gsm\s*:\s*(\d+)/i.exec(text);

    if (designMatch) designName = `${labelPrefix} — ${designMatch[1].trim()}`;
    if (fabricMatch) fabric = fabricMatch[1].replace(/\s+/g, " ").trim();
    if (gsmMatch) gsm = Number(gsmMatch[1]);

    const lines = pageLines(text);
    const isSizeChartPage = /size chart|size guide/i.test(text);
    if (isSizeChartPage || lines.length === 0) continue;

    // Colour photo pages repeat the colour name as their first line
    // (sometimes twice — once as a heading, once inside the info block).
    const colorLine = lines[0];
    if (!colorLine || !designMatch && !fabricMatch && !/^[A-Za-z][A-Za-z ]*$/.test(colorLine)) {
      continue;
    }
    if (!/design no:/i.test(text) && !/fabric type/i.test(text)) continue; // skip cover/title pages

    const rendered = renderPage(doc, i);
    const image = savePreview(sourceInfo.id, i + 1, rendered);
    if (!heroImage) {
      heroImage = image;
      heroPage = i + 1;
    }

    variants.push({
      id: nextVariantId(itemId),
      colorName: titleCase(colorLine),
      sourcePage: i + 1,
      image,
    });
  }

  if (!heroImage) {
    const rendered = renderPage(doc, 0);
    heroImage = savePreview(sourceInfo.id, 1, rendered);
  }

  const item: CatalogItem = {
    id: itemId,
    groupId,
    tier,
    label: designName,
    productId,
    garmentType,
    fabric,
    gsm,
    sourceId: sourceInfo.id,
    sourcePage: heroPage,
    previewImage: heroImage,
    variants,
    needsReview: variants.length === 0,
  };

  return { items: [item] };
}

const ADIDAS_APPAREL_KEYWORDS = /tshirt|polo|round\s*neck/i;
const ADIDAS_EXCLUDE_KEYWORDS = /shoe|sock|bag|cap|short|track|hoodie|jacket|pouch|band|bottle|pant/i;

function parseAdidasPdf(ctx: ParseContext): ParseResult {
  const { doc, sourceInfo, tier, groupId } = ctx;
  const n = doc.countPages();

  interface PageFields {
    pageNumber: number;
    articleNo?: string;
    color?: string;
    material?: string;
    sizes?: string;
    productName: string;
  }

  const pages: PageFields[] = [];
  for (let i = 0; i < n; i++) {
    const text = fixMangledGlyphs(extractPageText(doc, i));
    const lines = pageLines(text);
    if (lines.length === 0) continue;

    const articleNo = /article no\.?\s*([a-z0-9]+)/i.exec(text)?.[1];
    const color = /color\s*:\s*(.+?)(?:\n|$)/i.exec(text)?.[1]?.trim();
    const material = /material\s*:\s*(.+?)(?:\n|$)/i.exec(text)?.[1]?.trim();
    const sizes = /sizes? available\s*:\s*(.+?)(?:\n|$)/i.exec(text)?.[1]?.trim();
    const productName = lines[lines.length - 1];

    if (!articleNo || !productName) continue;
    if (!ADIDAS_APPAREL_KEYWORDS.test(productName) || ADIDAS_EXCLUDE_KEYWORDS.test(productName)) continue;

    pages.push({ pageNumber: i + 1, articleNo, color, material, sizes, productName });
  }

  const groups = new Map<string, PageFields[]>();
  for (const p of pages) {
    const key = p.productName.trim();
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  const items: CatalogItem[] = [];
  for (const [productName, groupPages] of groups) {
    const garmentType: Silhouette = /polo/i.test(productName) ? "polo" : "round_neck";
    const fabric = groupPages[0].material;
    const productId = inferProductId(garmentType, fabric);
    const itemId = nextItemId(groupId);

    const variants: CatalogVariant[] = [];
    let heroImage: CatalogImageRef | undefined;
    let heroPage = groupPages[0].pageNumber;

    for (const p of groupPages) {
      const rendered = renderPage(doc, p.pageNumber - 1);
      const image = savePreview(sourceInfo.id, p.pageNumber, rendered);
      if (!heroImage) heroImage = image;
      variants.push({
        id: nextVariantId(itemId),
        colorName: p.color ?? `Variant ${p.articleNo}`,
        colorCode: p.articleNo,
        sourcePage: p.pageNumber,
        image,
      });
    }

    items.push({
      id: itemId,
      groupId,
      tier,
      label: `Adidas ${productName.replace(/^adidas\s*/i, "")}`.trim(),
      productId,
      garmentType,
      fabric,
      sourceId: sourceInfo.id,
      sourcePage: heroPage,
      previewImage: heroImage!,
      variants,
      needsReview: false,
    });
  }

  return { items };
}

/** Extracts spaced-out-caps colour headings like "M A U V E" -> "Mauve". */
function extractSpacedCapsColorNames(text: string): string[] {
  const names: string[] = [];
  for (const line of pageLines(text)) {
    // A run of single letters separated by single spaces, e.g. "D A R K G R E Y".
    if (/^([A-Z]\s){2,}[A-Z]$/.test(line)) {
      const collapsed = line.replace(/\s+/g, "");
      names.push(collapsed);
    }
  }
  // The spaced-out heading is one long run per swatch, e.g. "DARKGREY" needs
  // re-splitting into words is not reliably possible without a dictionary;
  // instead we re-derive word breaks from the ORIGINAL double-spaced-word
  // pattern MuPDF actually emits (single space between letters, but a
  // slightly larger gap between words often collapses to the same single
  // space in asText()). As a pragmatic fallback, title-case the collapsed
  // token only when it's a known multi-word colour; otherwise leave as one
  // word. See COLOR_WORD_HINTS below.
  return names.map(collapseSpacedCapsToReadable);
}

const COLOR_WORD_HINTS = [
  "DARK",
  "GREY",
  "GREEN",
  "BLUE",
  "BLACK",
  "WHITE",
  "RED",
  "WINE",
  "ROYAL",
  "NAVY",
  "TEAL",
  "MOOSE",
  "MAROON",
  "MISTY",
  "ICE",
  "JADE",
  "FAWN",
  "MAUVE",
  "SIEMENS",
  "MUSTARD",
  "RUSSET",
  "APPLE",
  "PURPLE",
  "SHADOW",
  "OLIVE",
  "LIGHT",
  "DENIM",
  "MUSH",
  "NILE",
  "BOTTLE",
  "CURRENT",
  "BLACKCURRENT",
  "DRESDEN",
  "MAGENTA",
];

function collapseSpacedCapsToReadable(token: string): string {
  // Greedy longest-prefix match against known colour words.
  let remaining = token;
  const words: string[] = [];
  outer: while (remaining.length > 0) {
    const sorted = [...COLOR_WORD_HINTS].sort((a, b) => b.length - a.length);
    for (const word of sorted) {
      if (remaining.startsWith(word)) {
        words.push(word);
        remaining = remaining.slice(word.length);
        continue outer;
      }
    }
    // No known word matched — bail out and keep the rest as one chunk.
    words.push(remaining);
    remaining = "";
  }
  return titleCase(words.join(" "));
}

function parseStellarsPdf(ctx: ParseContext, label: string, garmentType: Silhouette): ParseResult {
  const { doc, sourceInfo, tier, groupId } = ctx;
  const n = doc.countPages();
  const itemId = nextItemId(groupId);

  let fabricText = "";
  const linkColorPairs: { url: string; colorName: string }[] = [];
  // Some Stellars PDFs repeat the entire colour-swatch section more than
  // once (e.g. the same 27 colours re-uploaded and re-linked further down
  // the document, under fresh postimg.cc URLs each time) — so dedupe by
  // COLOUR NAME, not by URL, keeping only the first occurrence of each
  // colour so one physical colour never produces more than one variant.
  const seenColorNames = new Set<string>();

  for (let i = 0; i < n; i++) {
    const { text: rawText, linkUris } = extractPageTextAndLinks(doc, i);
    const text = fixMangledGlyphs(rawText);
    fabricText += ` ${text}`;

    if (linkUris.length === 0) continue;

    const uniqueUrls: string[] = [];
    for (const uri of linkUris) {
      if (!uniqueUrls.includes(uri)) uniqueUrls.push(uri);
    }
    const colorNames = extractSpacedCapsColorNames(text);
    const count = Math.min(uniqueUrls.length, colorNames.length);
    for (let j = 0; j < count; j++) {
      const colorName = colorNames[j];
      if (seenColorNames.has(colorName)) continue;
      seenColorNames.add(colorName);
      linkColorPairs.push({ url: uniqueUrls[j], colorName });
    }
  }

  const productId = inferProductId(garmentType, fabricText);

  const rendered = renderPage(doc, 0);
  const heroImage = savePreview(sourceInfo.id, 1, rendered);

  const item: CatalogItem = {
    id: itemId,
    groupId,
    tier,
    label,
    productId,
    garmentType,
    fabric: /nano-?dry/i.test(fabricText) ? "Nano-Dry performance blend" : "Cotton/Polyester/Spandex blend",
    sourceId: sourceInfo.id,
    sourcePage: 1,
    previewImage: heroImage,
    variants: [],
    needsReview: linkColorPairs.length === 0,
  };

  return { items: [item], variantWork: linkColorPairs, itemId } as ParseResult & {
    variantWork: { url: string; colorName: string }[];
    itemId: string;
  };
}

/** Fallback for fully image-only PDFs (Reebok, Van Heusen): one item per page, flagged for manual review. */
function parseFallbackImageOnlyPdf(ctx: ParseContext, brandLabel: string): ParseResult {
  const { doc, sourceInfo, tier, groupId } = ctx;
  const n = doc.countPages();
  const items: CatalogItem[] = [];

  for (let i = 0; i < n; i++) {
    const rendered = renderPage(doc, i);
    const image = savePreview(sourceInfo.id, i + 1, rendered);
    const itemId = nextItemId(groupId);
    items.push({
      id: itemId,
      groupId,
      tier,
      label: `${brandLabel} — Style (page ${i + 1})`,
      productId: "dry_fit_round_neck",
      garmentType: "round_neck",
      sourceId: sourceInfo.id,
      sourcePage: i + 1,
      previewImage: image,
      variants: [],
      needsReview: true,
    });
  }

  return { items };
}

// ---------------------------------------------------------------------
// Source registration + orchestration
// ---------------------------------------------------------------------

interface SourceSpec {
  relativePath: string;
  tier: CatalogTier;
  groupId: string;
  groupLabel: string;
  groupKind: "category" | "brand";
  parse: (ctx: ParseContext) => ParseResult | Promise<ParseResult>;
}

function buildSourceInfo(relativePath: string, id: string): { info: CatalogSourceInfo; doc: mupdf.Document } {
  const fullPath = path.join(QUALITY_DIR, relativePath);
  const buffer = fs.readFileSync(fullPath);
  const doc = mupdf.Document.openDocument(buffer, "application/pdf");
  const pageCount = doc.countPages();

  let totalChars = 0;
  const sampleCount = Math.min(pageCount, 5);
  for (let i = 0; i < sampleCount; i++) {
    totalChars += extractPageText(doc, i).trim().length;
  }
  const extractionQuality: ExtractionQuality = totalChars === 0 ? "image-only" : totalChars < 200 * sampleCount ? "partial" : "text";

  return {
    info: {
      id,
      relativePath,
      sha256: sha256(buffer),
      pageCount,
      extractionQuality,
    },
    doc,
  };
}

async function main() {
  ensureDir(ASSETS_DIR);
  ensureDir(DATA_DIR);

  const groupsById = new Map<string, CatalogGroup>();
  const sources: CatalogSourceInfo[] = [];
  const allItems: CatalogItem[] = [];
  const stellarsVariantWork: { itemId: string; pairs: { url: string; colorName: string }[]; sourceSlug: string }[] = [];

  function registerGroup(id: string, tier: CatalogTier, kind: "category" | "brand", label: string) {
    if (!groupsById.has(id)) {
      groupsById.set(id, { id, tier, kind, label, itemIds: [] });
    }
    return groupsById.get(id)!;
  }

  const specs: SourceSpec[] = [
    // ---- Basic tier: category groups, matching existing 4 pricing SKUs ----
    {
      relativePath: "Basic/cotton polo.pdf",
      tier: "basic",
      groupId: "basic-cotton-polo",
      groupLabel: "Cotton Polo",
      groupKind: "category",
      parse: (ctx) => parseBasicPdf(ctx, "polo", "cotton_polo", "Cotton Polo"),
    },
    {
      relativePath: "Basic/cotton round neck.pdf",
      tier: "basic",
      groupId: "basic-cotton-round-neck",
      groupLabel: "Cotton Round Neck",
      groupKind: "category",
      parse: (ctx) => parseBasicPdf(ctx, "round_neck", "cotton_round_neck", "Cotton Round Neck"),
    },
    {
      relativePath: "Basic/drifit polo.pdf",
      tier: "basic",
      groupId: "basic-drifit-polo",
      groupLabel: "Polo Dry Fit",
      groupKind: "category",
      parse: (ctx) => parseBasicPdf(ctx, "polo", "dry_fit_polo", "Polo Dry Fit"),
    },
    {
      relativePath: "Basic/drifit round neck.pdf",
      tier: "basic",
      groupId: "basic-drifit-round-neck",
      groupLabel: "Round Neck Dry Fit",
      groupKind: "category",
      parse: (ctx) => parseBasicPdf(ctx, "round_neck", "dry_fit_round_neck", "Round Neck Dry Fit"),
    },
    // ---- Standard tier ----
    {
      relativePath: "Standard polo/drifit polo.pdf",
      tier: "standard",
      groupId: "standard-drifit-polo",
      groupLabel: "Polo Dry Fit",
      groupKind: "category",
      parse: (ctx) => parseStandardPdf(ctx, "polo", "dry_fit_polo", "Polo Dry Fit"),
    },
    {
      relativePath: "Standard polo/standard polo cotton.pdf",
      tier: "standard",
      groupId: "standard-cotton-polo",
      groupLabel: "Cotton Polo",
      groupKind: "category",
      parse: (ctx) => parseStandardPdf(ctx, "polo", "cotton_polo", "Cotton Polo"),
    },
    // ---- Premium tier: brand groups ----
    {
      relativePath: "Premium/adidas/ADIDAS CATALOGUE.pdf",
      tier: "branded",
      groupId: "branded-adidas",
      groupLabel: "Adidas",
      groupKind: "brand",
      parse: (ctx) => parseAdidasPdf(ctx),
    },
    {
      relativePath: "Premium/reebok/Reebok.pdf",
      tier: "branded",
      groupId: "branded-reebok",
      groupLabel: "Reebok",
      groupKind: "brand",
      parse: (ctx) => parseFallbackImageOnlyPdf(ctx, "Reebok"),
    },
    {
      relativePath: "Premium/Van heusen/VH Catalogue New.pdf",
      tier: "branded",
      groupId: "branded-van-heusen",
      groupLabel: "Van Heusen",
      groupKind: "brand",
      parse: (ctx) => parseFallbackImageOnlyPdf(ctx, "Van Heusen"),
    },
    {
      relativePath: "Premium/Stellars/Stellers Nano-Dry.pdf",
      tier: "branded",
      groupId: "branded-stellars",
      groupLabel: "Stellars",
      groupKind: "brand",
      parse: (ctx) => parseStellarsPdf(ctx, "Stellars Nano-Dry Golf Polo", "polo"),
    },
    {
      relativePath: "Premium/Stellars/Stellers Softberry Golf Polo Men Half Sleeve.pdf",
      tier: "branded",
      groupId: "branded-stellars",
      groupLabel: "Stellars",
      groupKind: "brand",
      parse: (ctx) => parseStellarsPdf(ctx, "Stellars Softberry Golf Polo — Men", "polo"),
    },
    {
      relativePath: "Premium/Stellars/Stellers Softberry Golf Polo Women_s Half Sleeve_compressed.pdf",
      tier: "branded",
      groupId: "branded-stellars",
      groupLabel: "Stellars",
      groupKind: "brand",
      parse: (ctx) => parseStellarsPdf(ctx, "Stellars Softberry Golf Polo — Women", "polo"),
    },
  ];

  for (const spec of specs) {
    const sourceId = slugify(spec.relativePath.replace(/\.pdf$/i, ""));
    console.log(`Parsing ${spec.relativePath} ...`);
    const { info, doc } = buildSourceInfo(spec.relativePath, sourceId);
    sources.push(info);
    registerGroup(spec.groupId, spec.tier, spec.groupKind, spec.groupLabel);

    const ctx: ParseContext = { doc, sourceInfo: info, tier: spec.tier, groupId: spec.groupId };
    const result = (await spec.parse(ctx)) as ParseResult & {
      variantWork?: { url: string; colorName: string }[];
      itemId?: string;
    };

    for (const item of result.items) {
      allItems.push(item);
      groupsById.get(spec.groupId)!.itemIds.push(item.id);
    }

    if (result.variantWork && result.itemId) {
      stellarsVariantWork.push({ itemId: result.itemId, pairs: result.variantWork, sourceSlug: sourceId });
    }

    console.log(`  -> ${result.items.length} item(s), extraction=${info.extractionQuality}`);
    doc.destroy();
  }

  // Resolve Stellars variant image downloads (network I/O) after all
  // parsing is done, so a slow/failed download never blocks page parsing.
  // Downloads run with bounded concurrency (rather than fully serial) —
  // there can be 50+ swatch images across the Stellars PDFs, and one at a
  // time would make this step take several minutes.
  const DOWNLOAD_CONCURRENCY = 6;
  for (const work of stellarsVariantWork) {
    const item = allItems.find((it) => it.id === work.itemId);
    if (!item) continue;

    const results = new Array<CatalogVariant>(work.pairs.length);
    let nextIndex = 0;
    async function worker() {
      while (true) {
        const i = nextIndex++;
        if (i >= work.pairs.length) return;
        const pair = work.pairs[i];
        const image = await downloadExternalImage(work.sourceSlug, pair.url);
        results[i] = {
          id: nextVariantId(item!.id),
          colorName: pair.colorName,
          image: image ?? { kind: "placeholder" },
        };
      }
    }
    await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, () => worker()));

    item.variants.push(...results);
    item.needsReview = item.variants.length === 0 || item.variants.some((v) => v.image.kind === "placeholder");
  }

  // ---- Apply hand-maintained overrides (never overwritten by this script) ----
  let overrides: CatalogOverridesFile = {};
  if (fs.existsSync(OVERRIDES_PATH)) {
    overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf-8")) as CatalogOverridesFile;
  } else {
    fs.writeFileSync(OVERRIDES_PATH, JSON.stringify({ items: {}, variants: {} }, null, 2) + "\n");
  }

  for (const item of allItems) {
    const patch = overrides.items?.[item.id];
    if (patch) Object.assign(item, patch);
    for (const variant of item.variants) {
      const vPatch = overrides.variants?.[variant.id];
      if (vPatch) Object.assign(variant, vPatch);
    }
  }

  const contentHash = sha256(Buffer.from(sources.map((s) => s.sha256).sort().join("|")));
  const catalogVersion = `${SCHEMA_VERSION}.${contentHash.slice(0, 12)}`;

  const manifest: CatalogManifest = {
    schemaVersion: SCHEMA_VERSION,
    catalogVersion,
    generatedAt: new Date().toISOString(),
    sources,
    groups: [...groupsById.values()],
    items: allItems,
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`\nWrote ${MANIFEST_PATH}`);
  console.log(`Catalog version: ${catalogVersion}`);
  console.log(`Sources: ${sources.length} · Groups: ${manifest.groups.length} · Items: ${allItems.length}`);
  const needsReviewCount = allItems.filter((i) => i.needsReview).length;
  if (needsReviewCount > 0) {
    console.log(`⚠ ${needsReviewCount} item(s) flagged needsReview=true — check src/catalog/data/overrides.json`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
