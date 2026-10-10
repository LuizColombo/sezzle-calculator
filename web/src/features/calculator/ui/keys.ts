import type { ExprOp, ExpressionEvent } from "../model/expression";

export type KeyVariant = "digit" | "function" | "operator" | "equals";

/** One keypad key. The keypad is data so layout, labels and events live in one place. */
export interface KeyDef {
  id: string;
  label: string;
  /** Spoken name, e.g. "multiply" rather than "×". */
  ariaLabel: string;
  event: ExpressionEvent;
  variant: KeyVariant;
  rows?: 2;
}

const digit = (d: string): KeyDef => ({
  id: d,
  label: d,
  ariaLabel: d,
  event: { type: "digit", digit: d },
  variant: "digit",
});

const op = (
  o: ExprOp,
  label: string,
  ariaLabel: string,
  variant: KeyVariant = "operator",
): KeyDef => ({
  id: ariaLabel,
  label,
  ariaLabel,
  event: { type: "operator", op: o },
  variant,
});

const fn = (id: string, label: string, ariaLabel: string, event: ExpressionEvent): KeyDef => ({
  id,
  label,
  ariaLabel,
  event,
  variant: "function",
});

/**
 * Four columns, six rows; "=" spans the last two rows. There is no ± key:
 * "−" typed where a number is expected is a sign ("2 × −3").
 */
export const KEYS: readonly KeyDef[] = [
  fn("clear", "AC", "all clear", { type: "allClear" }),
  fn("open", "(", "open parenthesis", { type: "open" }),
  fn("close", ")", "close parenthesis", { type: "close" }),
  op("÷", "÷", "divide"),

  fn("sqrt", "√", "square root", { type: "sqrt" }),
  op("^", "xʸ", "power", "function"),
  fn("percent", "%", "percent", { type: "percent" }),
  op("×", "×", "multiply"),

  digit("7"),
  digit("8"),
  digit("9"),
  op("−", "−", "subtract"),

  digit("4"),
  digit("5"),
  digit("6"),
  op("+", "+", "add"),

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

  fn("backspace", "⌫", "backspace", { type: "backspace" }),
  digit("0"),
  {
    id: "decimal",
    label: ".",
    ariaLabel: "decimal point",
    event: { type: "decimal" },
    variant: "digit",
  },
];
