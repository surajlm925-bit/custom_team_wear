/**
 * Logo placement zones — percentages of template image width/height.
 * See docs/Mockup-Template-Generation.md §7 for the full rationale;
 * these numbers are the single source of truth referenced there.
 *
 * Left/right sleeve are distinct zones (not a single mirrored "sleeve"
 * option) so two different logos can be placed on each arm in the same
 * order.
 */

import type { LogoPlacement } from "../pricing/priceBook.js";

export interface ZoneRect {
  /** All values are fractions 0..1 of the template's width/height. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TemplateView = "front" | "back";

/** Which template view a given placement renders onto. */
export const PLACEMENT_VIEWS: Record<LogoPlacement, TemplateView> = {
  left_chest: "front",
  center_front: "front",
  upper_back: "back",
  left_sleeve: "front",
  right_sleeve: "front",
};

export function getZoneForPlacement(placement: LogoPlacement): ZoneRect {
  return ZONES[placement];
}

const ZONES: Record<LogoPlacement, ZoneRect> = {
  left_chest: { x: 0.58, y: 0.22, width: 0.2, height: 0.13 },
  center_front: { x: 0.3, y: 0.25, width: 0.4, height: 0.3 },
  upper_back: { x: 0.25, y: 0.15, width: 0.5, height: 0.2 },
  // Left sleeve = wearer's left arm = image-right in a front-facing photo.
  left_sleeve: { x: 0.78, y: 0.3, width: 0.14, height: 0.15 },
  // Right sleeve = wearer's right arm = image-left in a front-facing photo.
  right_sleeve: { x: 0.08, y: 0.3, width: 0.14, height: 0.15 },
};
