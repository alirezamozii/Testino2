/**
 * Testino Number & Digit Utility
 * Provides seamless conversion and handling for Persian, Arabic, and English numerals.
 * Solves typing issues where Persian keyboard layouts or type="number" inputs break,
 * drop characters, or reject Persian/Arabic digits.
 */

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/**
 * Normalizes all Persian (۰-۹) and Arabic (٠-٩) digits to standard ASCII English digits (0-9).
 * Preserves all other characters intact.
 */
export function toEnDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0));
}

/**
 * Normalizes standard ASCII English digits (0-9) to Persian digits (۰-۹).
 */
export function toFaDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input).replace(/[0-9]/g, (w) => PERSIAN_DIGITS[+w]);
}

/**
 * Extracts and parses a safe integer from any string containing Persian, Arabic, or English numerals.
 * Returns `fallback` if empty, invalid, or NaN.
 */
export function parseSafeInt(input: string | number | null | undefined, fallback = 0): number {
  if (input === null || input === undefined) return fallback;
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.floor(input) : fallback;
  }
  const en = toEnDigits(input).trim();
  const cleaned = en.replace(/[^\d-]/g, "");
  if (!cleaned || cleaned === "-") return fallback;
  const parsed = parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Sanitizes live user typing for integer inputs:
 * 1. Converts Persian/Arabic digits to English digits immediately.
 * 2. Removes any non-numeric characters.
 * 3. Keeps empty string untouched so backspace works naturally without instant snap-back.
 */
export function sanitizeIntegerInput(input: string, options?: { allowNegative?: boolean; max?: number; min?: number }): string {
  if (!input) return "";
  let en = toEnDigits(input);
  if (options?.allowNegative) {
    // Preserve leading minus if present
    const isNeg = en.startsWith("-");
    en = en.replace(/[^\d]/g, "");
    if (isNeg) en = `-${en}`;
  } else {
    en = en.replace(/[^\d]/g, "");
  }
  if (!en) return "";

  // Leading zeros normalization: keep "0" if single zero, but "05" -> "5" unless "0"
  if (en.length > 1 && en.startsWith("0")) {
    en = en.replace(/^0+/, "") || "0";
  }

  if (options?.max !== undefined) {
    const n = parseInt(en, 10);
    if (!Number.isNaN(n) && n > options.max) {
      en = String(options.max);
    }
  }

  return en;
}
