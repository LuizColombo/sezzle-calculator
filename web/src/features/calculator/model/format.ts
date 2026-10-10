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

/**
 * Keeps the first `keep` digits of a digit string, rounding half to even as
 * the API does. The result can be one digit longer when rounding carries.
 */
function roundDigits(digits: string, keep: number): string {
  const kept = digits.slice(0, keep);
  const next = digits[keep] ?? "0";
  const rest = digits.slice(keep + 1);
  const lastIsOdd = Number(kept.at(-1) ?? "0") % 2 === 1;
  const up = next > "5" || (next === "5" && (/[1-9]/.test(rest) || lastIsOdd));
  const value = BigInt(kept || "0") + (up ? 1n : 0n);
  return value.toString().padStart(kept.length, "0");
}

/** Rounds the unsigned decimal int.frac to `places` fractional digits. */
function roundFraction(int: string, frac: string, places: number): [string, string] {
  const digits = roundDigits(int + frac, int.length + places).padStart(places + 1, "0");
  const newInt = digits.slice(0, digits.length - places);
  const newFrac = digits.slice(digits.length - places).replace(/0+$/, "");
  return [newInt, newFrac];
}

/**
 * Scientific notation for a digit string whose first digit has the given
 * power of ten: ("12345678901234567890", 19) → "1.23456789e+19".
 */
function scientific(digits: string, exponent: number): string {
  let m = roundDigits(digits, Math.min(MANTISSA_DIGITS, digits.length) || 1);
  if (m.length > Math.min(MANTISSA_DIGITS, digits.length)) {
    m = m.slice(0, -1);
    exponent += 1;
  }
  const fraction = m.slice(1).replace(/0+$/, "");
  const sign = exponent < 0 ? "-" : "+";
  return `${m[0] ?? "0"}${fraction ? `.${fraction}` : ""}e${sign}${String(Math.abs(exponent))}`;
}

/** "8.6736E-19" (the API's form for tiny results) → "8.6736e-19". */
function fromExponentForm(unsigned: string): string {
  const [mantissa = "", exp = "0"] = unsigned.split(/[eE]/);
  const [int = "", frac = ""] = mantissa.split(".");
  const all = int + frac;
  const leadingZeros = all.length - all.replace(/^0+/, "").length;
  const digits = all.slice(leadingZeros) || "0";
  return scientific(digits, Number(exp) + int.length - 1 - leadingZeros);
}

/** Formats a raw decimal string for the display. */
export function formatDisplay(raw: string): string {
  if (raw === "Error") return raw;

  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const sign = negative ? "-" : "";
  if (/[eE]/.test(unsigned)) return sign + fromExponentForm(unsigned);

  const dot = unsigned.indexOf(".");
  const int = dot === -1 ? unsigned : unsigned.slice(0, dot);
  const frac = dot === -1 ? "" : unsigned.slice(dot + 1);

  // Anything the user can type fits; show it verbatim (keeps "1." and "1.50").
  if (digitCount(int, frac) <= MAX_DISPLAY_DIGITS) {
    return `${sign}${groupThousands(int)}${dot === -1 ? "" : "."}${frac}`;
  }
  if (int.length > MAX_DISPLAY_DIGITS) {
    return sign + scientific(int, int.length - 1);
  }
  const places = MAX_DISPLAY_DIGITS - (int === "0" ? 0 : int.length);
  const [roundedInt, roundedFrac] = roundFraction(int, frac, places);
  return `${sign}${groupThousands(roundedInt)}${roundedFrac ? `.${roundedFrac}` : ""}`;
}

export type DisplaySize = "lg" | "md" | "sm" | "xs";

/** Picks a font-size step so long values still fit the display, down to 320 px wide. */
export function displaySize(formatted: string): DisplaySize {
  if (formatted.length <= 9) return "lg";
  if (formatted.length <= 13) return "md";
  if (formatted.length <= 18) return "sm";
  return "xs";
}
