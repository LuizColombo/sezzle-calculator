import type { CalculatorEvent } from "./types";

const KEYS: Partial<Record<string, CalculatorEvent>> = {
  ".": { type: "decimal" },
  ",": { type: "decimal" },
  "+": { type: "operator", operator: "add" },
  "-": { type: "operator", operator: "subtract" },
  "*": { type: "operator", operator: "multiply" },
  x: { type: "operator", operator: "multiply" },
  "/": { type: "operator", operator: "divide" },
  "^": { type: "operator", operator: "power" },
  "%": { type: "unary", operator: "percent" },
  Enter: { type: "equals" },
  "=": { type: "equals" },
  Escape: { type: "allClear" },
  Backspace: { type: "backspace" },
};

/** Maps a KeyboardEvent.key to a calculator event, or null when the key is not bound. */
export function eventForKey(key: string): CalculatorEvent | null {
  if (/^[0-9]$/.test(key)) return { type: "digit", digit: key };
  return KEYS[key] ?? null;
}
