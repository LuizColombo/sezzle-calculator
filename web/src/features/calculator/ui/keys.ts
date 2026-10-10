import type { ExprOp, ScientificEvent } from "../model/expression";
import type { BinaryOperator, CalculatorEvent } from "../model/types";

export type KeyVariant = "digit" | "function" | "operator" | "equals";

/**
 * One keypad key. The keypad is data so layout, labels and events live in
 * one place; E is the event type of the mode the keypad drives.
 */
export interface KeyDef<E = CalculatorEvent> {
  id: string;
  label: string;
  /** Spoken name, e.g. "multiply" rather than "×". */
  ariaLabel: string;
  event: E;
  variant: KeyVariant;
  /** Basic mode only: the binary operator, so the active one can be shown (including xʸ). */
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

/** Basic: four columns, six rows; "=" spans two rows and "0" two columns. */
export const BASIC_KEYS: readonly KeyDef[] = [
  fn("clear", "AC", "all clear", { type: "allClear" }),
  fn("backspace", "⌫", "backspace", { type: "backspace" }),
  fn("percent", "%", "percent", { type: "unary", operator: "percent" }),
  operator("divide", "÷"),

  fn("sqrt", "√", "square root", { type: "unary", operator: "sqrt" }),
  { ...fn("power", "xʸ", "power", { type: "operator", operator: "power" }), operator: "power" },
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

// ── Scientific ────────────────────────────────────────────────────────────

type SciKey = KeyDef<ScientificEvent>;

const sDigit = (d: string): SciKey => ({
  id: d,
  label: d,
  ariaLabel: d,
  event: { type: "digit", digit: d },
  variant: "digit",
});

const sOp = (
  op: ExprOp,
  label: string,
  ariaLabel: string,
  variant: KeyVariant = "operator",
): SciKey => ({
  id: ariaLabel,
  label,
  ariaLabel,
  event: { type: "operator", op },
  variant,
});

const sFn = (id: string, label: string, ariaLabel: string, event: ScientificEvent): SciKey => ({
  id,
  label,
  ariaLabel,
  event,
  variant: "function",
});

/**
 * Scientific: parentheses replace ⌫ and ± on the top rows; ⌫ moves to the
 * bottom-left (editing an expression needs it) and ± is not needed, because
 * "−" typed where an operand is expected is a sign.
 */
export const SCIENTIFIC_KEYS: readonly SciKey[] = [
  sFn("clear", "AC", "all clear", { type: "allClear" }),
  sFn("open", "(", "open parenthesis", { type: "open" }),
  sFn("close", ")", "close parenthesis", { type: "close" }),
  sOp("÷", "÷", "divide"),

  sFn("sqrt", "√", "square root", { type: "sqrt" }),
  sOp("^", "xʸ", "power", "function"),
  sFn("percent", "%", "percent", { type: "percent" }),
  sOp("×", "×", "multiply"),

  sDigit("7"),
  sDigit("8"),
  sDigit("9"),
  sOp("−", "−", "subtract"),

  sDigit("4"),
  sDigit("5"),
  sDigit("6"),
  sOp("+", "+", "add"),

  sDigit("1"),
  sDigit("2"),
  sDigit("3"),
  {
    id: "equals",
    label: "=",
    ariaLabel: "equals",
    event: { type: "equals" },
    variant: "equals",
    rows: 2,
  },

  sFn("backspace", "⌫", "backspace", { type: "backspace" }),
  sDigit("0"),
  {
    id: "decimal",
    label: ".",
    ariaLabel: "decimal point",
    event: { type: "decimal" },
    variant: "digit",
  },
];
