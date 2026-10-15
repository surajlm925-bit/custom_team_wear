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
    // Standard and primary catalog colors (all 68 from catalog options)
    "Aluminium": "848789",
    "Apple Green": "8DB600",
    "Arrow Red": "C41E3A",
    "Banana Yellow": "FFE135",
    "Beige": "F5F5DC",
    "Black": "111111",
    "Blackcurrent": "3B1E48",
    "Bottle Green": "004830",
    "Brick Red": "9C3325",
    "Brown": "533529",
    "Carbon Grey": "33373B",
    "Charcoal": "36454F",
    "Charcoal Grey": "2F353B",
    "Coffee Brown": "4B3621",
    "Dark Blue": "00008B",
    "Dark Grey": "4A4A4A",
    "Dark Purple": "36013F",
    "Dark Wine": "4A1525",
    "Denim Blue": "2B4C7E",
    "Dresden Blue": "2B78A0",
    "Dusty Peach": "DCAE96",
    "Fawn": "C8A27C",
    "Firozi Blue": "00A8B5",
    "French Wine": "AC1E44",
    "Grey": "808080",
    "Grey Melange": "6B6B6B",
    "Harbour Blue": "2B5876",
    "Ice Blue": "AFDBF5",
    "Indian Blue": "1E488F",
    "Indian Green": "138808",
    "Jade Green": "00A86B",
    "Lavender": "967BB6",
    "Lemon Yellow": "FFF44F",
    "Light Peach": "FFDAB9",
    "Light Purple": "B19CD9",
    "Magenta": "CA1F7B",
    "Maroon": "800000",
    "Mauve": "915F6D",
    "Misty Green": "98BF9F",
    "Moose Grey": "5C5856",
    "Mustard": "E1AD01",
    "Navy Blue": "000080",
    "Olive Green": "556B2F",
    "Orange": "FF6F00",
    "Parrot Green": "43B02A",
    "Petrol Blue": "005F73",
    "Pine Green": "01796F",
    "Pink": "E85D75",
    "Powder Blue": "B0E0E6",
    "Purple": "800080",
    "Purple Blue": "4D4080",
    "Rama Blue": "007B88",
    "Rani Pink": "E3007B",
    "Red": "D32F2F",
    "Rosedust": "9E5E6F",
    "Royal Blue": "4169E1",
    "Russet": "80461B",
    "Siemens Green": "00643C",
    "Sky Blue": "87CEEB",
    "Steel Grey": "71797E",
    "Striking Purple": "673AB7",
    "Sunshine Yellow": "FFD700",
    "Teal Blue": "367588",
    "Teal Green": "00827F",
    "Turquoise Blue": "00C5CD",
    "White": "FFFFFF",
    "Wine": "722F37",
    "Woody Orange": "D96B27",

    // Common aliases & legacy variants
    "Navy": "000080",
    "Black Grey": "36454F",
    "Royal": "5D8AA8",
    "Ash Melange": "848482",
    "Black Melange": "2A2A2A",
    "Coffee": "4B3621",
    "Yellow": "FFED00",
    "Saffron": "F4C430",
    "Pakistani Green": "006600",
    "Turquoise": "40E0D0",
    "Red Grey": "5D5D5D",
    "Offwhite": "FAFAFA",
    "F. Green": "2E7D32",
    "Forest Green": "2E7D32",
    "Sea Green": "2E8B57",
    "White Grey": "F0F0F0",
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