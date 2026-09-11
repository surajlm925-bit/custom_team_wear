/**
 * Price book — PRD §6.1, §6.2.
 * This is DATA ONLY. No computation lives here; see index.ts for the
 * pure functions that read this config. This is the single place a
 * rupee figure may be hardcoded, per tech.md's pricing invariant.
 */

export type Tier = "basic" | "standard" | "branded";

export type ProductId =
  | "dry_fit_round_neck"
  | "dry_fit_polo"
  | "cotton_round_neck"
  | "cotton_polo";

/**
 * Mockup silhouette — fabric material doesn't change how a logo mockup
 * looks, so every product maps to one of just two garment shapes for
 * mockup-rendering purposes (see docs/Mockup-Template-Generation.md §2, §6).
 */
export type Silhouette = "round_neck" | "polo";

export const PRODUCT_SILHOUETTE: Record<ProductId, Silhouette> = {
  dry_fit_round_neck: "round_neck",
  cotton_round_neck: "round_neck",
  dry_fit_polo: "polo",
  cotton_polo: "polo",
};

export interface ProductCatalogEntry {
  id: ProductId;
  /** Display label, tier-specific (e.g. Branded renames to "Branded Polo Tee"). */
  label: Record<Tier, string>;
  /** [50-99 rate, 100+ rate] ex-GST, per piece, per tier. */
  rates: Record<Tier, [number, number]>;
}

export const TIER_LABELS: Record<Tier, string> = {
  basic: "Basic",
  standard: "Standard",
  branded: "Premium Branded",
};

export const TIER_PITCH: Record<Tier, string> = {
  basic: "Great choice. Basic tier — best value for events & colleges.",
  standard: "Better quality, better finish.",
  branded: "Global brands. Corporate prestige.",
};

/** Cheapest 50+ rate per tier, used for the S00 tier menu button labels. */
export const TIER_FROM_RATE: Record<Tier, number> = {
  basic: 169,
  standard: 219,
  branded: 499,
};

export const PRODUCT_CATALOG: ProductCatalogEntry[] = [
  {
    id: "dry_fit_round_neck",
    label: {
      basic: "Round Neck Dry Fit",
      standard: "Round Neck Dry Fit",
      branded: "Branded Dry Fit Tee",
    },
    rates: {
      basic: [169, 159],
      standard: [219, 199],
      branded: [499, 449],
    },
  },
  {
    id: "dry_fit_polo",
    label: {
      basic: "Polo Dry Fit",
      standard: "Polo Dry Fit",
      branded: "Branded Polo Tee",
    },
    rates: {
      basic: [289, 249],
      standard: [359, 309],
      branded: [709, 629],
    },
  },
  {
    id: "cotton_round_neck",
    label: {
      basic: "Round Neck Cotton",
      standard: "Round Neck Cotton",
      branded: "Branded Cotton Tee",
    },
    rates: {
      basic: [259, 239],
      standard: [319, 289],
      branded: [599, 529],
    },
  },
  {
    id: "cotton_polo",
    label: {
      basic: "Cotton Polo",
      standard: "Cotton Polo",
      branded: "Branded Corporate Polo",
    },
    rates: {
      basic: [389, 359],
      standard: [469, 429],
      branded: [869, 789],
    },
  },
];

export type PrintMethod =
  | "screen_print"
  | "dtf"
  | "sublimation"
  | "embroidery"
  | "not_sure"
  | "none";

export interface PrintMethodEntry {
  id: PrintMethod;
  label: string;
  /** [low, high] ex-GST per piece. */
  range: [number, number];
  hint: string;
}

export const PRINT_METHODS: PrintMethodEntry[] = [
  {
    id: "screen_print",
    label: "Screen Print",
    range: [25, 45],
    hint: "Most economical; best for bold logos on cotton.",
  },
  {
    id: "dtf",
    label: "DTF Print",
    range: [35, 70],
    hint: "Vivid multi-colour, works on all fabrics.",
  },
  {
    id: "sublimation",
    label: "Sublimation",
    range: [30, 60],
    hint: "All-over prints; sportswear favourite.",
  },
  {
    id: "embroidery",
    label: "Embroidery",
    range: [50, 120],
    hint: "Premium; ideal for polos & corporate wear.",
  },
  {
    id: "not_sure",
    label: "Not sure — advise me",
    range: [25, 120],
    hint: "Agent recommends after artwork review.",
  },
  {
    id: "none",
    label: "Plain (No Print)",
    range: [0, 0],
    hint: "Plain blank sample garments.",
  },
];

export const MOQ = 50;
export const BRACKET_THRESHOLD = 100;
export const HIGH_VALUE_CALLOUT_QTY = 300;

export const SAMPLE_KIT_PRICES = {
  polyester: 1999,
  cotton: 2499,
} as const;

export const MOCKUP_PRICES = {
  singleView: 10,
  frontAndBack: 20,
} as const;

/**
 * Logo placement options — per client's Logo Placement Flow spec
 * (docs/Mockup-Template-Generation.md §7). Left/right sleeve are distinct
 * options (rather than a single "sleeve" choice) so a customer with two
 * logos can put one on each arm. "Front + Back" from the original client
 * spec is now expressed by uploading the same logo twice (once for
 * left_chest, once for upper_back) via the multi-logo loop, rather than
 * being a separate placement value — this keeps every placement mapped
 * to exactly one template view, which simplifies rendering.
 */
export type LogoPlacement = "left_chest" | "center_front" | "upper_back" | "left_sleeve" | "right_sleeve";

export interface LogoPlacementEntry {
  id: LogoPlacement;
  label: string;
  hint: string;
}

export const LOGO_PLACEMENTS: LogoPlacementEntry[] = [
  { id: "left_chest", label: "Left Chest", hint: "Professional company logo" },
  { id: "center_front", label: "Centre Front", hint: "Large logo / design" },
  { id: "upper_back", label: "Upper Back", hint: "Company / event name" },
  { id: "left_sleeve", label: "Left Sleeve", hint: "Secondary logo / partner logo" },
  { id: "right_sleeve", label: "Right Sleeve", hint: "Secondary logo / partner logo" },
];

export type ApplicationMethod = "print" | "embroidery" | "recommend";

export interface ApplicationMethodEntry {
  id: ApplicationMethod;
  label: string;
}

export const APPLICATION_METHODS: ApplicationMethodEntry[] = [
  { id: "print", label: "Print" },
  { id: "embroidery", label: "Embroidery" },
  { id: "recommend", label: "Not sure — recommend" },
];

export const SIZE_KEYS = ["S", "M", "L", "XL", "XXL", "3XL"] as const;
export type SizeKey = (typeof SIZE_KEYS)[number];

/** Standard mix proportions (out of 100), scaled to actual qty. PRD Appendix A. */
export const STANDARD_MIX_WEIGHTS: Record<SizeKey, number> = {
  S: 10,
  M: 25,
  L: 30,
  XL: 20,
  XXL: 10,
  "3XL": 5,
};
