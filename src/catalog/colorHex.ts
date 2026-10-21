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
  const norm = normalizeColorName(colorName);
  const hexMap: Record<string, string> = {
    // Standard and primary catalog colors (computer-vision extracted from actual catalog imagery)
    "Aluminium": "C9CAC6",
    "Apple Green": "78AA9C",
    "Arrow Red": "C61927",
    "Banana Yellow": "F8D56C",
    "Beige": "E6CAAB",
    "Black": "212126",
    "Blackcurrent": "553B58",
    "Bottle Green": "213C3E",
    "Brick Red": "AD4438",
    "Brown": "532B22",
    "Carbon Grey": "515561",
    "Charcoal": "57555E",
    "Charcoal Grey": "4B4C51",
    "Coffee Brown": "713A2D",
    "Dark Blue": "1A2A4A",
    "Dark Grey": "404B60",
    "Dark Purple": "553B57",
    "Dark Wine": "56222F",
    "Denim Blue": "2550A4",
    "Dresden Blue": "2B78A0",
    "Dusty Peach": "F82C45",
    "Fawn": "DDCFC4",
    "Firozi Blue": "2673C4",
    "French Wine": "841F2B",
    "Grey": "404B60",
    "Grey Melange": "B6BEC7",
    "Harbour Blue": "37B5CC",
    "Ice Blue": "D8F2FB",
    "Indian Blue": "32A4DC",
    "Indian Green": "2EAC92",
    "Jade Green": "3DB1C7",
    "Lavender": "E8D3F7",
    "Lemon Yellow": "EBE66B",
    "Light Peach": "F0AB98",
    "Light Purple": "ADC0E9",
    "Magenta": "802F56",
    "Maroon": "8C1924",
    "Mauve": "C79693",
    "Misty Green": "B0C8BA",
    "Moose Grey": "C0C4B5",
    "Mustard": "DAA248",
    "Navy Blue": "202335",
    "Olive Green": "655E4C",
    "Orange": "FD7528",
    "Parrot Green": "C6DF71",
    "Petrol Blue": "274D76",
    "Pine Green": "2A4248",
    "Pink": "E57C8F",
    "Powder Blue": "B4E9F9",
    "Purple": "693388",
    "Purple Blue": "7480B0",
    "Rama Blue": "22456C",
    "Rani Pink": "FE4F7E",
    "Red": "E92C38",
    "Rosedust": "F6D5CC",
    "Royal Blue": "324EB0",
    "Russet": "EA6B35",
    "Siemens Green": "4BDDCB",
    "Sky Blue": "75BEF2",
    "Steel Grey": "778CAB",
    "Striking Purple": "A85094",
    "Sunshine Yellow": "F7F1B2",
    "Teal Blue": "355E85",
    "Teal Green": "28565B",
    "Turquoise Blue": "64CFED",
    "White": "FFFFFF",
    "Wine": "841F2B",
    "Woody Orange": "E1653B",

    // Common aliases & legacy variants
    "Navy": "202335",
    "Black Grey": "4B4C51",
    "Royal": "324EB0",
    "Ash Melange": "B6BEC7",
    "Black Melange": "35373B",
    "Coffee": "713A2D",
    "Yellow": "F8D56C",
    "Saffron": "FD7528",
    "Pakistani Green": "213C3E",
    "Turquoise": "64CFED",
    "Red Grey": "5D5D5D",
    "Offwhite": "F5F2EB",
    "F. Green": "213C3E",
    "Forest Green": "213C3E",
    "Sea Green": "2EAC92",
    "White Grey": "E3E7F4",
  };

  // Case-insensitive lookup fallback
  const directMatch = hexMap[norm] ?? hexMap[colorName];
  if (directMatch) return directMatch;

  const lower = colorName.trim().toLowerCase();
  for (const [key, value] of Object.entries(hexMap)) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }

  return null;
}

/**
 * Normalises a colour name for lookup: lowercases, trims whitespace,
 * and maps common variants so that "navy blue", "NAVY", etc. all resolve.
 *
 * @param name - The colour name from the catalog or user input
 * @returns The normalised colour name, or the trimmed original
 *          if no explicit variant map matches.
 */
export function normalizeColorName(name: string): string {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  const variantMap: Record<string, string> = {
    "navy blue": "Navy Blue",
    "navy": "Navy Blue",
    "black grey": "Black Grey",
    "black grey melange": "Black Melange",
    "royal blue": "Royal Blue",
    "royal": "Royal Blue",
    "ash melange": "Ash Melange",
    "black melange": "Black Melange",
    "coffee": "Coffee Brown",
    "coffee brown": "Coffee Brown",
    "bottle green": "Bottle Green",
    "sky blue": "Sky Blue",
    "pakistani green": "Pakistani Green",
    "turquoise": "Turquoise Blue",
    "turquoise blue": "Turquoise Blue",
    "red grey": "Red Grey",
    "offwhite": "Offwhite",
    "wine": "Wine",
    "dark wine": "Dark Wine",
    "french wine": "French Wine",
    "f. green": "F. Green",
    "forest green": "F. Green",
    "beige": "Beige",
    "sea green": "Sea Green",
    "grey melange": "Grey Melange",
    "white grey": "White Grey",
    "white": "White",
    "black": "Black",
    "petrol blue": "Petrol Blue",
    "petrol": "Petrol Blue",
    "rama blue": "Rama Blue",
    "rani pink": "Rani Pink",
    "banana yellow": "Banana Yellow",
    "lemon yellow": "Lemon Yellow",
    "sunshine yellow": "Sunshine Yellow",
    "charcoal": "Charcoal",
    "charcoal grey": "Charcoal Grey",
    "carbon grey": "Carbon Grey",
    "dark grey": "Dark Grey",
    "steel grey": "Steel Grey",
    "moose grey": "Moose Grey",
    "apple green": "Apple Green",
    "parrot green": "Parrot Green",
    "pine green": "Pine Green",
    "siemens green": "Siemens Green",
    "jade green": "Jade Green",
    "misty green": "Misty Green",
    "indian green": "Indian Green",
    "olive green": "Olive Green",
    "teal green": "Teal Green",
    "teal blue": "Teal Blue",
    "ice blue": "Ice Blue",
    "powder blue": "Powder Blue",
    "denim blue": "Denim Blue",
    "dresden blue": "Dresden Blue",
    "harbour blue": "Harbour Blue",
    "indian blue": "Indian Blue",
    "firozi blue": "Firozi Blue",
    "dark blue": "Dark Blue",
    "purple blue": "Purple Blue",
    "striking purple": "Striking Purple",
    "dark purple": "Dark Purple",
    "light purple": "Light Purple",
    "brick red": "Brick Red",
    "arrow red": "Arrow Red",
    "woody orange": "Woody Orange",
  };

  return variantMap[lower] ?? trimmed;
}