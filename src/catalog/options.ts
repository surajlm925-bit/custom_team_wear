/**
 * Quality & Color options hierarchy compiled from the quality/ folder.
 *
 * Provides the direct list of qualities and all available colors
 * per Tier and ProductId (Collar / Round Neck x Cotton / Dry Fit).
 */

import type { ProductId, Tier } from "../pricing/priceBook.js";

export interface QualityOption {
  id: string;
  name: string;
  colors: string[];
}

export type GarmentType = "round_neck" | "collar";
export type FabricType = "cotton" | "polyester";

export function resolveProductId(garment: GarmentType, fabric: FabricType): ProductId {
  if (garment === "round_neck") {
    return fabric === "cotton" ? "cotton_round_neck" : "dry_fit_round_neck";
  }
  return fabric === "cotton" ? "cotton_polo" : "dry_fit_polo";
}

export const CATALOG_OPTIONS: Record<Tier, Record<ProductId, QualityOption[]>> = {
  basic: {
    cotton_polo: [
      {
        id: "val-cp-1-uf-008",
        name: "UF 008",
        colors: ["Black", "Dark Grey", "Maroon", "Navy Blue", "Orange", "Red", "Royal Blue", "Sky Blue", "White"]
      },
      {
        id: "val-cp-2-uf-010",
        name: "UF 010",
        colors: ["Beige", "Black", "Bottle Green", "Brown", "Charcoal Grey", "Grey Melange", "Lemon Yellow", "Maroon", "Navy Blue", "Orange", "Parrot Green", "Purple", "Red", "Royal Blue", "Sky Blue", "White"]
      },
      {
        id: "val-cp-3-uf-011",
        name: "UF 011",
        colors: ["Black", "Bottle Green", "Charcoal Grey", "Grey Melange", "Lemon Yellow", "Maroon", "Navy Blue", "Red", "Royal Blue", "Sky Blue", "White"]
      },
      {
        id: "val-cp-4-uf-007-plain",
        name: "UF 007 - Plain",
        colors: ["Black", "Navy Blue", "Red", "Royal Blue", "White"]
      },
      {
        id: "val-cp-5-uf-007-tipping",
        name: "UF 007 - Tipping",
        colors: ["Black", "Dark Grey", "Navy Blue", "Royal Blue", "Sky Blue", "White"]
      },
      {
        id: "val-cp-6-uf-premium",
        name: "UF Premium",
        colors: ["Black", "Charcoal Grey", "Grey Melange", "Navy Blue", "Red", "Royal Blue", "Sky Blue", "White"]
      },
      {
        id: "val-cp-7-uf-009",
        name: "UF 009",
        colors: ["Arrow Red", "Black", "Charcoal Grey", "Coffee Brown", "Dark Purple", "Dark Wine", "Denim Blue", "Firozi Blue", "French Wine", "Indian Blue", "Lavender", "Light Peach", "Mustard", "Navy Blue", "Orange", "Pink", "Powder Blue", "Rani Pink", "Steel Grey", "Striking Purple", "Sunshine Yellow", "Turquoise Blue", "White"]
      }
    ],
    dry_fit_polo: [
      {
        id: "val-dfp-1-uf-008",
        name: "UF 008",
        colors: ["Black", "Dark Grey", "Maroon", "Navy Blue", "Orange", "Red", "Royal Blue", "Sky Blue", "White"]
      },
      {
        id: "val-dfp-2-uf-010",
        name: "UF 010",
        colors: ["Beige", "Black", "Bottle Green", "Brown", "Charcoal Grey", "Grey Melange", "Lemon Yellow", "Maroon", "Navy Blue", "Orange", "Parrot Green", "Purple", "Red", "Royal Blue", "Sky Blue", "White"]
      },
      {
        id: "val-dfp-3-uf-011",
        name: "UF 011",
        colors: ["Black", "Bottle Green", "Charcoal Grey", "Grey Melange", "Lemon Yellow", "Maroon", "Navy Blue", "Red", "Royal Blue", "Sky Blue", "White"]
      },
      {
        id: "val-dfp-4-uf-007-plain",
        name: "UF 007 - Plain",
        colors: ["Black", "Navy Blue", "Red", "Royal Blue", "White"]
      },
      {
        id: "val-dfp-5-uf-007-tipping",
        name: "UF 007 - Tipping",
        colors: ["Black", "Dark Grey", "Navy Blue", "Royal Blue", "Sky Blue", "White"]
      },
      {
        id: "val-dfp-6-uf-premium",
        name: "UF Premium",
        colors: ["Black", "Charcoal Grey", "Grey Melange", "Navy Blue", "Red", "Royal Blue", "Sky Blue", "White"]
      },
      {
        id: "val-dfp-7-uf-009",
        name: "UF 009",
        colors: ["Arrow Red", "Black", "Charcoal Grey", "Coffee Brown", "Dark Purple", "Dark Wine", "Denim Blue", "Firozi Blue", "French Wine", "Indian Blue", "Lavender", "Light Peach", "Mustard", "Navy Blue", "Orange", "Pink", "Powder Blue", "Rani Pink", "Steel Grey", "Striking Purple", "Sunshine Yellow", "Turquoise Blue", "White"]
      }
    ],
    cotton_round_neck: [
      {
        id: "val-crn-finch-bio-wash",
        name: "Finch Bio Wash",
        colors: ["Black", "Charcoal Grey", "Navy Blue", "Royal Blue", "White"]
      }
    ],
    dry_fit_round_neck: [
      {
        id: "val-dfrn-finch-active-mars",
        name: "Finch Active Mars (Dri-Fit)",
        colors: ["Black", "Charcoal Grey", "Navy Blue", "Petrol Blue", "White"]
      }
    ]
  },
  standard: {
    cotton_polo: [
      {
        id: "rec-cp-finch-classic",
        name: "Finch Classic Collection",
        colors: ["Black", "Bottle Green", "Charcoal Grey", "Grey Melange", "Maroon", "Navy Blue", "Red", "Royal Blue", "Turquoise Blue", "White"]
      }
    ],
    dry_fit_polo: [
      {
        id: "rec-dfp-finch-superia",
        name: "Finch Superia Mars (200 GSM)",
        colors: ["Aluminium", "Arrow Red", "Banana Yellow", "Black", "Brick Red", "Carbon Grey", "Charcoal", "Coffee Brown", "French Wine", "Grey Melange", "Harbour Blue", "Indian Green", "Mustard", "Navy Blue", "Olive Green", "Pine Green", "Rama Blue", "Royal Blue", "Sky Blue", "White", "Woody Orange"]
      },
      {
        id: "rec-dfp-finch-classic-polo",
        name: "Finch Classic Polo (260 GSM)",
        colors: ["Black", "Charcoal Grey", "Dusty Peach", "Grey Melange", "Navy Blue", "Sky Blue", "White"]
      },
      {
        id: "rec-dfp-finch-piper",
        name: "Finch Piper Mars",
        colors: ["Banana Yellow", "Black", "Charcoal", "Grey Melange", "Navy Blue", "Rama Blue", "White"]
      },
      {
        id: "rec-dfp-finch-jacquard",
        name: "Finch Jacquard Mars",
        colors: ["Black", "Charcoal Grey", "Navy Blue", "Rama Blue", "White"]
      }
    ],
    cotton_round_neck: [
      {
        id: "rec-crn-finch-bio-wash",
        name: "Finch Bio Wash (Standard)",
        colors: ["Black", "Charcoal Grey", "Navy Blue", "Royal Blue", "White"]
      }
    ],
    dry_fit_round_neck: [
      {
        id: "rec-dfrn-finch-active-mars",
        name: "Finch Active Mars",
        colors: ["Black", "Charcoal Grey", "Navy Blue", "Petrol Blue", "White"]
      }
    ]
  },
  branded: {
    cotton_polo: [
      {
        id: "prem-vh-polo",
        name: "Van Heusen Polo",
        colors: ["White", "Black", "Navy Blue", "Royal Blue", "Maroon", "Charcoal Grey"]
      },
      {
        id: "prem-stellars-softberry",
        name: "Stellars Softberry Golf Polo",
        colors: ["White", "Black", "Navy Blue", "Royal Blue", "Mauve", "Sky Blue"]
      }
    ],
    dry_fit_polo: [
      {
        id: "prem-adidas-polo",
        name: "Adidas Polo",
        colors: ["Black", "White", "Navy Blue", "Royal Blue", "Red", "Grey", "Dark Blue"]
      },
      {
        id: "prem-reebok-polo",
        name: "Reebok Polo",
        colors: ["Black", "White", "Navy Blue", "Royal Blue", "Dark Grey"]
      },
      {
        id: "prem-stellars-nano-dry",
        name: "Stellars Nano-Dry Polo",
        colors: [
          "Apple Green", "Black", "Blackcurrent", "Dark Grey", "Dresden Blue",
          "Fawn", "Ice Blue", "Jade Green", "Light Purple", "Magenta",
          "Maroon", "Mauve", "Misty Green", "Moose Grey", "Mustard",
          "Navy Blue", "Olive Green", "Purple Blue", "Red", "Rosedust",
          "Royal Blue", "Russet", "Siemens Green", "Teal Blue", "Teal Green",
          "White", "Wine"
        ]
      }
    ],
    cotton_round_neck: [
      {
        id: "prem-vh-rn",
        name: "Van Heusen Round Neck",
        colors: ["White", "Black", "Navy Blue", "Royal Blue", "Dark Grey"]
      }
    ],
    dry_fit_round_neck: [
      {
        id: "prem-adidas-rn",
        name: "Adidas Round Neck",
        colors: ["Black", "White", "Navy Blue", "Royal Blue", "Red", "Grey"]
      },
      {
        id: "prem-reebok-rn",
        name: "Reebok Round Neck",
        colors: ["Black", "White", "Navy Blue", "Royal Blue", "Grey"]
      }
    ]
  }
};

export function getQualityOptions(tier: Tier, productId: ProductId): QualityOption[] {
  return CATALOG_OPTIONS[tier]?.[productId] ?? [];
}

export function getQualityOptionById(tier: Tier, productId: ProductId, qualityId: string): QualityOption | undefined {
  return getQualityOptions(tier, productId).find((q) => q.id === qualityId);
}
