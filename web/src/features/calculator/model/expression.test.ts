import { describe, expect, it } from "vitest";
import {
  initialExpression,
  isComplete,
  reduceExpression,
  toApiString,
  type ExpressionEvent,
  type ExpressionState,
} from "./expression";

const KEYS: Record<string, ExpressionEvent> = {
  "+": { type: "operator", op: "+" },
  "-": { type: "operator", op: "−" },
  "*": { type: "operator", op: "×" },
  "/": { type: "operator", op: "÷" },
  "^": { type: "operator", op: "^" },
  "(": { type: "open" },
  ")": { type: "close" },
  r: { type: "sqrt" },
  "%": { type: "percent" },
  ".": { type: "decimal" },
  "<": { type: "backspace" },
  C: { type: "allClear" },
  "=": { type: "equals" },
};

/** Applies a key script: digits, ". + - * / ^ ( ) % r(√) <(backspace) C =". */
function run(script: string, from: ExpressionState = initialExpression): ExpressionState {
  return (script.match(/./g) ?? []).reduce<ExpressionState>(
    (state, ch) => reduceExpression(state, KEYS[ch] ?? { type: "digit", digit: ch }),
    from,
  );
}

/** The expression text the API would receive. */
const api = (state: ExpressionState) => toApiString(state.tokens).text;

const evaluated = (state: ExpressionState, expression: string, value: string) =>
  reduceExpression(state, { type: "resultReceived", expression, value });

describe("building an expression", () => {
  it("starts empty", () => {
    expect(initialExpression.tokens).toEqual([]);
    expect(initialExpression.phase).toBe("editing");
  });

  it("types numbers and operators with spaced binary operators", () => {
    expect(api(run("2+3*4"))).toBe("2 + 3 × 4");
    expect(api(run("12.5/0.5"))).toBe("12.5 ÷ 0.5");
    expect(api(run("2^10"))).toBe("2 ^ 10");
  });

  it("collapses leading zeros and allows one decimal point per number", () => {
    expect(api(run("007"))).toBe("7");
    expect(api(run("1.5.2"))).toBe("1.52");
    expect(api(run(".5"))).toBe("0.5");
    expect(api(run("1+.5"))).toBe("1 + 0.5");
  });

  it("caps each number at 16 digits", () => {
    expect(api(run("12345678901234567890"))).toBe("1234567890123456");
    expect(api(run("1+12345678901234567890"))).toBe("1 + 1234567890123456");
  });

  it("replaces an operator typed after another", () => {
    expect(api(run("2+*3"))).toBe("2 × 3");
    expect(api(run("2*/3"))).toBe("2 ÷ 3");
  });

  it("turns − into a sign where an operand is expected", () => {
    expect(api(run("-2"))).toBe("−2");
    expect(api(run("2*-3"))).toBe("2 × −3");
    expect(api(run("2^-1"))).toBe("2 ^ −1");
    expect(api(run("(-2)"))).toBe("(−2)");
    expect(api(run("r-4"))).toBe("√−4");
    expect(api(run("2+-3"))).toBe("2 − 3"); // after + or −, it replaces the operator
  });

  it("ignores other operators where an operand is expected", () => {
    expect(api(run("*2"))).toBe("2");
    expect(api(run("(*2)"))).toBe("(2)");
    expect(api(run("--2"))).toBe("−2");
  });

  it("opens parentheses and inserts × after an operand", () => {
    expect(api(run("2(3)"))).toBe("2 × (3)");
    expect(api(run("(2)(3)"))).toBe("(2) × (3)");
    expect(api(run("2r9"))).toBe("2 × √9");
    expect(api(run("(2+3)4"))).toBe("(2 + 3) × 4");
  });

  it("closes only an open parenthesis after an operand", () => {
    expect(api(run("2)"))).toBe("2");
    expect(api(run("(2+)"))).toBe("(2 +");
    expect(api(run("((2)"))).toBe("((2)");
  });

  it("adds percent only after an operand", () => {
    expect(api(run("200+15%"))).toBe("200 + 15%");
    expect(api(run("%5"))).toBe("5");
    expect(api(run("2+%"))).toBe("2 +");
  });

  it("square root binds to what follows", () => {
    expect(api(run("r16+9"))).toBe("√16 + 9");
    expect(api(run("r(16+9)"))).toBe("√(16 + 9)");
  });
});

describe("backspace", () => {
  it("removes the last digit, then whole tokens", () => {
    expect(api(run("123<"))).toBe("12");
    expect(api(run("12+<"))).toBe("12");
    expect(api(run("2*(<"))).toBe("2 ×");
    expect(api(run("1<"))).toBe("");
    expect(api(run("<"))).toBe("");
  });
});

describe("completeness and evaluation", () => {
  it("knows when an expression can be evaluated", () => {
    expect(isComplete(run("2+3").tokens)).toBe(true);
    expect(isComplete(run("(2+3").tokens)).toBe(true); // open parentheses close on =
    expect(isComplete(run("2+").tokens)).toBe(false);
    expect(isComplete(run("").tokens)).toBe(false);
    expect(isComplete(run("r").tokens)).toBe(false);
  });

  it("= requests the expression, closing open parentheses", () => {
    const s = run("(2+3*(4");
    const pending = run("=", s);
    expect(pending.phase).toBe("evaluating");
    expect(pending.pending).toEqual({ expression: "(2 + 3 × (4))" });
    expect(api(pending)).toBe("(2 + 3 × (4))");
  });

  it("= on an unfinished expression does nothing", () => {
    const s = run("2+");
    expect(run("=", s)).toBe(s);
    expect(run("=")).toBe(initialExpression);
  });

  it("ignores input while evaluating, except all clear", () => {
    const s = run("2+3=");
    for (const key of ["4", "+", "(", "<", "="]) expect(run(key, s)).toBe(s);
    expect(run("C", s).tokens).toEqual([]);
  });

  it("shows the result and counts the replacement", () => {
    const s = evaluated(run("2+3*4="), "2 + 3 × 4", "14");
    expect(s).toMatchObject({
      phase: "result",
      result: { expression: "2 + 3 × 4", value: "14" },
      pending: null,
      replaced: 1,
    });
  });

  it("after a result, a digit starts over and an operator continues from it", () => {
    const s = evaluated(run("2+3*4="), "2 + 3 × 4", "14");
    expect(api(run("7", s))).toBe("7");
    expect(api(run("(", s))).toBe("(");
    expect(api(run("+1", s))).toBe("14 + 1");
    expect(api(run("%", s))).toBe("14%");
  });

  it("a result reused as an operand is replaced, not edited", () => {
    const s = run("+", evaluated(run("1/3="), "1 ÷ 3", "1E-17"));
    expect(api(s)).toBe("1E-17 +");
    expect(api(run("<<", s))).toBe(""); // the operator, then the whole value
  });

  it("accepts a preview and drops the result of an older expression", () => {
    const s = reduceExpression(run("2+3"), {
      type: "previewReceived",
      expression: "2 + 3",
      value: "5",
    });
    expect(s.preview).toEqual({ expression: "2 + 3", value: "5" });
  });
});

describe("errors", () => {
  const syntaxError: ExpressionEvent = {
    type: "apiFailed",
    error: {
      kind: "api",
      problem: {
        type: "x#invalid-expression",
        title: "Invalid expression",
        status: 400,
        detail: "unexpected ')' at column 6",
      },
    },
    position: 6,
  };

  it("keeps the expression and the error position", () => {
    const s = reduceExpression(run("2+3="), syntaxError);
    expect(s).toMatchObject({ phase: "error", errorPosition: 6 });
    expect(api(s)).toBe("2 + 3");
  });

  it("backspace and operators go back to editing; a digit starts over", () => {
    const failed = reduceExpression(run("2+3="), syntaxError);
    expect(run("<", failed)).toMatchObject({ phase: "editing", error: null, errorPosition: null });
    expect(api(run("<", failed))).toBe("2 +");
    expect(api(run("*2", failed))).toBe("2 + 3 × 2");
    expect(api(run("9", failed))).toBe("9");
  });

  it("a network failure keeps editing so = retries", () => {
    const s = reduceExpression(run("2+3="), {
      type: "apiFailed",
      error: { kind: "network", message: "offline" },
    });
    expect(s).toMatchObject({ phase: "editing", pending: null });
    expect(s.error?.kind).toBe("network");
    expect(run("=", s).pending).toEqual({ expression: "2 + 3" });
  });
});

describe("recall", () => {
  it("inserts a history value as a sealed operand", () => {
    const recall = (value: string): ExpressionEvent => ({ type: "recall", value });
    expect(api(reduceExpression(run("2+"), recall("40")))).toBe("2 + 40");
    expect(api(reduceExpression(run("2"), recall("40")))).toBe("2 × 40");
    expect(api(reduceExpression(initialExpression, recall("-5")))).toBe("-5");
    const sealed = reduceExpression(run("2+"), recall("40"));
    expect(api(run("7", sealed))).toBe("2 + 7"); // a digit replaces a sealed value
  });
});

describe("toApiString", () => {
  it("reports the column range of each token", () => {
    const { text, ranges } = toApiString(run("12+(3)").tokens);
    expect(text).toBe("12 + (3)");
    expect(ranges).toEqual([
      [1, 3],
      [4, 5],
      [6, 7],
      [7, 8],
      [8, 9],
    ]);
  });
});
