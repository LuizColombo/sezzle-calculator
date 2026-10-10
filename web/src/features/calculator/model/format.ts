/**
 * Display formatting. Values arrive as decimal strings (typed by the user or
 * returned by the API) and are formatted without ever converting to a
 * JavaScript number, so nothing is lost to floating point. API results can
 * have up to 1001 integer digits; Number() would turn those into Infinity.
 */

/** Significant digits shown before rounding or switching to scientific notation. */
const MAX_DISPLAY_DIGITS = 16;
/** Significant digits in a scientific-notation mantissa. */
const MANTISSA_DIGITS = 10;

const groupThousands = (int: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Digits in the value, not counting the leading zero of "0.xxx". */
const digitCount = (int: string, frac: string) => (int === "0" ? 0 : int.length) + frac.length;

/** Rounds the unsigned decimal int.frac half-up to `places` fractional digits. */
function roundFraction(int: string, frac: string, places: number): [string, string] {
  const kept = BigInt(int + frac.slice(0, places));
  const roundUp = (frac[places] ?? "0") >= "5";
  const digits = (roundUp ? kept + 1n : kept).toString().padStart(places + 1, "0");
  const newInt = digits.slice(0, digits.length - places);
  const newFrac = digits.slice(digits.length - places).replace(/0+$/, "");
  return [newInt, newFrac];
}

/** "12345678901234567890" → "1.23456789e+19" for an unsigned integer string. */
function scientific(int: string): string {
  let exponent = int.length - 1;
  let mantissa = BigInt(int.slice(0, MANTISSA_DIGITS));
  if ((int[MANTISSA_DIGITS] ?? "0") >= "5") mantissa += 1n;
  let m = mantissa.toString();
  if (m.length > MANTISSA_DIGITS) {
    m = m.slice(0, MANTISSA_DIGITS);
    exponent += 1;
  }
  const fraction = m.slice(1).replace(/0+$/, "");
  return `${m[0] ?? ""}${fraction ? `.${fraction}` : ""}e+${String(exponent)}`;
}

/** Formats a raw decimal string for the display. */
export function formatDisplay(raw: string): string {
  if (raw === "Error") return raw;

  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const dot = unsigned.indexOf(".");
  const int = dot === -1 ? unsigned : unsigned.slice(0, dot);
  const frac = dot === -1 ? "" : unsigned.slice(dot + 1);
  const sign = negative ? "-" : "";

  // Anything the user can type fits; show it verbatim (keeps "1." and "1.50").
  if (digitCount(int, frac) <= MAX_DISPLAY_DIGITS) {
    return `${sign}${groupThousands(int)}${dot === -1 ? "" : "."}${frac}`;
  }
  if (int.length > MAX_DISPLAY_DIGITS) {
    return sign + scientific(int);
  }
  const places = MAX_DISPLAY_DIGITS - (int === "0" ? 0 : int.length);
  const [roundedInt, roundedFrac] = roundFraction(int, frac, places);
  return `${sign}${groupThousands(roundedInt)}${roundedFrac ? `.${roundedFrac}` : ""}`;
}

export type DisplaySize = "lg" | "md" | "sm";

/** Picks a font-size step so long values still fit the display. */
export function displaySize(formatted: string): DisplaySize {
  if (formatted.length <= 9) return "lg";
  if (formatted.length <= 13) return "md";
  return "sm";
}
