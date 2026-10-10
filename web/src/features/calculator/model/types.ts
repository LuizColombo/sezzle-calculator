import type { components } from "../api/schema.gen";

export type Problem = components["schemas"]["Problem"];

export type BinaryOperator = "add" | "subtract" | "multiply" | "divide" | "power";
export type UnaryOperator = "sqrt" | "percent";

export const OPERATOR_SYMBOL: Record<BinaryOperator, string> = {
  add: "+",
  subtract: "−",
  multiply: "×",
  divide: "÷",
  power: "^",
};

/** Maximum significant digits the user can type into one operand. */
export const MAX_INPUT_DIGITS = 16;

export type Phase =
  | "idle"
  | "enteringFirst"
  | "operatorChosen"
  | "enteringSecond"
  | "awaitingResult"
  | "result"
  | "error";

/** Where a unary result goes once it arrives. */
export type ResumePhase = "enteringSecond" | "result";

/** A calculation the reducer wants performed. The hook turns it into an API call. */
export type PendingCall =
  | {
      kind: "binary";
      operator: BinaryOperator;
      a: string;
      b: string;
      /** Show the result, or use it as the first operand of the next operator (chaining). */
      then: { type: "show" } | { type: "chain"; nextOperator: BinaryOperator };
    }
  | { kind: "sqrt"; value: string; resume: ResumePhase }
  /** "x %" on its own: x ÷ 100. */
  | { kind: "percent"; mode: "plain"; value: string; resume: ResumePhase }
  /** "a + x %": x percent of the first operand a. */
  | { kind: "percent"; mode: "ofFirst"; value: string; percent: string; resume: ResumePhase };

export type CalculatorError =
  { kind: "api"; problem: Problem } | { kind: "network"; message: string };

export interface CalculatorState {
  phase: Phase;
  /** The raw operand on the display, e.g. "12.5", or "Error". */
  display: string;
  /** The small line above the display, e.g. "2 +" or "√16". */
  expression: string | null;
  firstOperand: string | null;
  operator: BinaryOperator | null;
  /** When true, the next digit replaces the display instead of appending to it. */
  fresh: boolean;
  pending: PendingCall | null;
  error: CalculatorError | null;
  /**
   * Counts the times the display value was replaced rather than edited (a
   * result or error arrived, a value was recalled, AC). The UI keys its
   * display transition on it.
   */
  replaced: number;
}

export type CalculatorEvent =
  | { type: "digit"; digit: string }
  | { type: "decimal" }
  | { type: "operator"; operator: BinaryOperator }
  | { type: "equals" }
  | { type: "allClear" }
  | { type: "backspace" }
  | { type: "toggleSign" }
  | { type: "unary"; operator: UnaryOperator }
  | { type: "recall"; value: string }
  | { type: "resultReceived"; result: string }
  | { type: "apiFailed"; error: CalculatorError };
