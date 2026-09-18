/**
 * Color name → hex code mapping for catalog colors.
 * Used by the AI mockup engine to apply the exact garment colour
 * via prompt colour preservation rather than relying on the catalog
 * photo's actual lighting/background.
 *
 * Unknown colour names fall through to `null` — callers should handle
 * gracefully (e.g. by omitting the colour clause from the prompt).
 */

export function getColorHex(colorName: string): string | null {
  const hexMap: Record<string, string> = {
    "Navy Blue": "000080",
    "Navy": "000080",
    "Black Grey": "36454F",
    "White": "FFFFFF",
    "Royal Blue": "4169E1",
    "Royal": "5D8AA8",
    "Ash Melange": "848482",
    "Red": "FF0000",
    "Black Melange": "2A2A2A",
    "Coffee": "6B4423",
    "Yellow": "FFED00",
    "Bottle Green": "00695C",
    "Maroon": "800000",
    "Saffron": "F4C430",
    "Sky Blue": "87CEEB",
    "Pakistani Green": "006600",
    "Turquoise": "40E0D0",
    "Red Grey": "5D5D5D",
    "Offwhite": "FAFAFA",
    "Wine": "722F37",
    "F. Green": "2E7D32",
    "Beige": "F5F5DC",
    "Sea Green": "2E8B57",
    "Grey Melange": "6B6B6B",
    "White Grey": "F0F0F0",
  };

  return hexMap[colorName] ?? null;
}

/**
 * Normalises a colour name for lookup: lowercases, trims whitespace,
 * and maps common variants so that "navy blue", "NAVY", etc. all resolve.
 *
 * @param name - The colour name from the catalog or user input
 * @returns The normalised colour name, or the lowercased, trimmed original
 *          if no explicit variant map matches.
 */
export function normalizeColorName(name: string): string {
  const lower = name.trim().toLowerCase();

  const variantMap: Record<string, string> = {
    "navy blue": "Navy Blue",
    "navy": "Navy",
    "black grey": "Black Grey",
    "black grey melange": "Black Melange",
    "royal blue": "Royal Blue",
    "royal": "Royal",
    "ash melange": "Ash Melange",
    "black melange": "Black Melange",
    "coffee": "Coffee",
    "bottle green": "Bottle Green",
    "sky blue": "Sky Blue",
    "pakistani green": "Pakistani Green",
    "turquoise": "Turquoise",
    "red grey": "Red Grey",
    "offwhite": "Offwhite",
    "wine": "Wine",
    "f. green": "F. Green",
    "forest green": "F. Green",
    "beige": "Beige",
    "sea green": "Sea Green",
    "grey melange": "Grey Melange",
    "white grey": "White Grey",
    "white": "White",
    "black": "Black",
  };

  return variantMap[lower] ?? lower;
}