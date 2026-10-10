import type { ExpressionEvent } from "./expression";

const KEYS: Partial<Record<string, ExpressionEvent>> = {
  ".": { type: "decimal" },
  ",": { type: "decimal" },
  "+": { type: "operator", op: "+" },
  "-": { type: "operator", op: "−" },
  "*": { type: "operator", op: "×" },
  x: { type: "operator", op: "×" },
  "/": { type: "operator", op: "÷" },
  "^": { type: "operator", op: "^" },
  "(": { type: "open" },
  ")": { type: "close" },
  r: { type: "sqrt" },
  "%": { type: "percent" },
  Enter: { type: "equals" },
  "=": { type: "equals" },
  Escape: { type: "allClear" },
  Backspace: { type: "backspace" },
};

/**
 * Maps a KeyboardEvent.key to a calculator event, or null when the key is
 * not bound. Delete is deliberately unbound: a reflex keystroke should not
 * wipe a calculation.
 */
export function eventForKey(key: string): ExpressionEvent | null {
  if (/^[0-9]$/.test(key)) return { type: "digit", digit: key };
  return KEYS[key] ?? null;
}
