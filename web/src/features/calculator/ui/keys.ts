import type { BinaryOperator, CalculatorEvent } from "../model/types";

export type KeyVariant = "digit" | "function" | "operator" | "equals";

/** One keypad key. The keypad is data so layout, labels and events live in one place. */
export interface KeyDef {
  id: string;
  label: string;
  /** Spoken name, e.g. "multiply" rather than "×". */
  ariaLabel: string;
  event: CalculatorEvent;
  variant: KeyVariant;
  /** Set for binary operators so the keypad can show which one is active. */
  operator?: BinaryOperator;
  columns?: 2;
  rows?: 2;
}

const digit = (d: string): KeyDef => ({
  id: d,
  label: d,
  ariaLabel: d,
  event: { type: "digit", digit: d },
  variant: "digit",
});

const operator = (op: BinaryOperator, label: string): KeyDef => ({
  id: op,
  label,
  ariaLabel: op,
  event: { type: "operator", operator: op },
  variant: "operator",
  operator: op,
});

const fn = (id: string, label: string, ariaLabel: string, event: CalculatorEvent): KeyDef => ({
  id,
  label,
  ariaLabel,
  event,
  variant: "function",
});

/** Four columns, six rows; "=" spans two rows and "0" two columns. */
export const KEYS: readonly KeyDef[] = [
  fn("clear", "AC", "all clear", { type: "allClear" }),
  fn("backspace", "⌫", "backspace", { type: "backspace" }),
  fn("percent", "%", "percent", { type: "unary", operator: "percent" }),
  operator("divide", "÷"),

  fn("sqrt", "√", "square root", { type: "unary", operator: "sqrt" }),
  fn("power", "xʸ", "power", { type: "operator", operator: "power" }),
  fn("sign", "±", "toggle sign", { type: "toggleSign" }),
  operator("multiply", "×"),

  digit("7"),
  digit("8"),
  digit("9"),
  operator("subtract", "−"),

  digit("4"),
  digit("5"),
  digit("6"),
  operator("add", "+"),

  digit("1"),
  digit("2"),
  digit("3"),
  {
    id: "equals",
    label: "=",
    ariaLabel: "equals",
    event: { type: "equals" },
    variant: "equals",
    rows: 2,
  },

  { ...digit("0"), columns: 2 },
  {
    id: "decimal",
    label: ".",
    ariaLabel: "decimal point",
    event: { type: "decimal" },
    variant: "digit",
  },
];
