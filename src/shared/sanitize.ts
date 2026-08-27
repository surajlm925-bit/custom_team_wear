/**
 * Formula-injection sanitizer + input validators.
 * tech.md security requirement: strip leading = + - @ and control
 * characters from every sheet-bound string; cap name 60 / city 40 / phone 15.
 */

const LEADING_FORMULA_CHARS = /^[=+\-@]+/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

/** Strips leading formula-trigger characters and control chars, then trims + caps length. */
export function sanitizeForSheet(input: string, maxLen: number): string {
  const withoutControl = input.replace(CONTROL_CHARS, "");
  const withoutLeadingFormula = withoutControl.replace(LEADING_FORMULA_CHARS, "");
  return withoutLeadingFormula.trim().slice(0, maxLen);
}

export function sanitizeName(input: string): string {
  return sanitizeForSheet(input, 60);
}

export function sanitizeCity(input: string): string {
  return sanitizeForSheet(input, 40);
}

export function sanitizePhoneDigitsForSheet(input: string): string {
  return sanitizeForSheet(input, 15);
}

/**
 * Validates + normalizes an Indian mobile number.
 * Accepts +91 / 91 / 0 prefixes, strips separators, requires 10 digits
 * starting with 6-9. Returns the bare 10-digit number, or null if invalid.
 */
export function normalizeIndianPhone(input: string): string | null {
  const stripped = input.replace(/[\s\-()]/g, "");
  let digits = stripped.replace(/^\+?91/, "").replace(/^0/, "");
  digits = digits.replace(/\D/g, "");
  if (digits.length !== 10) return null;
  if (!/^[6-9]/.test(digits)) return null;
  return digits;
}

export function isValidQty(input: string): number | null {
  if (!/^\d+$/.test(input.trim())) return null;
  const n = Number(input.trim());
  if (!Number.isInteger(n) || n < 1 || n > 100_000) return null;
  return n;
}
