import { describe, expect, it } from "vitest";
import { initialState, reduce } from "./reducer";
import type { CalculatorEvent, CalculatorState } from "./types";

const KEY_SCRIPT: Record<string, CalculatorEvent> = {
  "+": { type: "operator", operator: "add" },
  "-": { type: "operator", operator: "subtract" },
  "*": { type: "operator", operator: "multiply" },
  "/": { type: "operator", operator: "divide" },
  "^": { type: "operator", operator: "power" },
  "=": { type: "equals" },
  C: { type: "allClear" },
  "<": { type: "backspace" },
  "~": { type: "toggleSign" },
  r: { type: "unary", operator: "sqrt" },
  "%": { type: "unary", operator: "percent" },
  ".": { type: "decimal" },
};

/**
 * Applies a compact key script: digits, "." , operators "+-* /^", "=",
 * "C" (all clear), "<" (backspace), "~" (toggle sign), "r" (√), "%".
 */
function run(script: string, from: CalculatorState = initialState): CalculatorState {
  return (script.match(/./g) ?? []).reduce<CalculatorState>(
    (state, ch) => reduce(state, KEY_SCRIPT[ch] ?? { type: "digit", digit: ch }),
    from,
  );
}

const received = (state: CalculatorState, result: string) =>
  reduce(state, { type: "resultReceived", result });

const divisionByZero: CalculatorEvent = {
  type: "apiFailed",
  error: {
    kind: "api",
    problem: {
      type: "x#division-by-zero",
      title: "Division by zero",
      status: 422,
      detail: "division by zero",
    },
  },
};

describe("entering numbers", () => {
  it("starts at 0", () => {
    expect(initialState.display).toBe("0");
    expect(initialState.phase).toBe("idle");
  });

  it("appends digits and collapses leading zeros", () => {
    expect(run("007").display).toBe("7");
    expect(run("120").display).toBe("120");
    expect(run("000").display).toBe("0");
  });

  it("accepts a single decimal point", () => {
    expect(run("1.5").display).toBe("1.5");
    expect(run("1.5.2").display).toBe("1.52");
    expect(run(".5").display).toBe("0.5");
  });

  it("caps input at 16 significant digits", () => {
    expect(run("12345678901234567890").display).toBe("1234567890123456");
    expect(run("0.12345678901234567890").display).toBe("0.1234567890123456");
  });

  it("backspace removes the last character and bottoms out at 0", () => {
    expect(run("123<").display).toBe("12");
    expect(run("1.<").display).toBe("1");
    expect(run("1<").display).toBe("0");
    expect(run("1<<").display).toBe("0");
    expect(run("5~<").display).toBe("0");
  });

  it("toggles the sign of the display", () => {
    expect(run("5~").display).toBe("-5");
    expect(run("5~~").display).toBe("5");
    expect(run("0~").display).toBe("0");
  });

  it("± right after an operator starts a negative second operand", () => {
    expect(run("5+~3")).toMatchObject({
      phase: "enteringSecond",
      display: "-3",
      firstOperand: "5",
    });
    expect(run("5+~<").display).toBe("0");
  });
});

describe("binary operations", () => {
  it("chooses an operator and keeps the display until the next digit", () => {
    const s = run("12+");
    expect(s).toMatchObject({
      phase: "operatorChosen",
      firstOperand: "12",
      operator: "add",
      display: "12",
      expression: "12 +",
    });
  });

  it("replaces the operator when another is pressed", () => {
    const s = run("12+*");
    expect(s.operator).toBe("multiply");
    expect(s.expression).toBe("12 ×");
  });

  it("starts the second operand fresh", () => {
    expect(run("12+3")).toMatchObject({ phase: "enteringSecond", display: "3" });
    expect(run("12+.")).toMatchObject({ phase: "enteringSecond", display: "0." });
  });

  it("equals requests the binary call", () => {
    const s = run("12+3=");
    expect(s.phase).toBe("awaitingResult");
    expect(s.expression).toBe("12 + 3");
    expect(s.pending).toEqual({
      kind: "binary",
      operator: "add",
      a: "12",
      b: "3",
      then: { type: "show" },
    });
  });

  it("maps power to base and exponent like any other binary operator", () => {
    expect(run("2^10=").pending).toMatchObject({ operator: "power", a: "2", b: "10" });
  });

  it("equals without a second operand is a no-op", () => {
    const s = run("12+");
    expect(run("=", s)).toBe(s);
    expect(run("=")).toBe(initialState);
  });

  it("chaining evaluates the previous pair first", () => {
    expect(run("2+3*").pending).toEqual({
      kind: "binary",
      operator: "add",
      a: "2",
      b: "3",
      then: { type: "chain", nextOperator: "multiply" },
    });
  });

  it("ignores input while awaiting a result", () => {
    const s = run("2+3=");
    for (const key of ["9", "+", "=", "<", "~", "r", "."]) {
      expect(run(key, s)).toBe(s);
    }
  });

  it("shows the result", () => {
    expect(received(run("2+3="), "5")).toEqual({
      ...initialState,
      phase: "result",
      display: "5",
      expression: "2 + 3 =",
    });
  });

  it("continues a chain with the result as first operand", () => {
    expect(received(run("2+3*"), "5")).toMatchObject({
      phase: "operatorChosen",
      firstOperand: "5",
      operator: "multiply",
      display: "5",
      expression: "5 ×",
      pending: null,
    });
  });

  it("after a result, a digit starts over and an operator reuses the result", () => {
    const result = received(run("2+3="), "5");
    expect(run("7", result)).toMatchObject({
      display: "7",
      phase: "enteringFirst",
      expression: null,
    });
    expect(run("*", result)).toMatchObject({ firstOperand: "5", phase: "operatorChosen" });
    expect(run("<", result)).toBe(result);
  });

  it("toggling the sign of a result keeps it usable as an operand", () => {
    const result = received(run("2+3="), "5");
    expect(run("~+", result)).toMatchObject({ firstOperand: "-5", phase: "operatorChosen" });
  });
});

describe("committing operands", () => {
  it("normalises a trailing point and negative zero", () => {
    expect(run("0.+")).toMatchObject({ firstOperand: "0", expression: "0 +" });
    expect(run("1.5.+2.=").pending).toMatchObject({ a: "1.5", b: "2" });
    expect(run("5+~=").pending).toMatchObject({ a: "5", b: "0" });
    expect(run("3.r").pending).toMatchObject({ kind: "sqrt", value: "3" });
  });
});

describe("unary operations", () => {
  it("square root of the display", () => {
    const s = run("16r");
    expect(s.phase).toBe("awaitingResult");
    expect(s.expression).toBe("√16");
    expect(s.pending).toEqual({ kind: "sqrt", value: "16", resume: "result" });
  });

  it("a unary result replaces the display and the next digit starts fresh", () => {
    const s = received(run("16r"), "4");
    expect(s).toMatchObject({ display: "4", phase: "result", expression: "√16" });
    expect(run("2", s).display).toBe("2");
  });

  it("square root of the second operand resumes the binary operation", () => {
    const s = run("2+16r");
    expect(s.pending).toEqual({ kind: "sqrt", value: "16", resume: "enteringSecond" });
    const done = received(s, "4");
    expect(done).toMatchObject({
      phase: "enteringSecond",
      display: "4",
      firstOperand: "2",
      operator: "add",
      expression: "2 +",
    });
    expect(run("=", done).pending).toEqual({
      kind: "binary",
      operator: "add",
      a: "2",
      b: "4",
      then: { type: "show" },
    });
  });

  it("percent on its own divides by 100", () => {
    expect(run("50%").pending).toEqual({
      kind: "percent",
      mode: "plain",
      value: "50",
      resume: "result",
    });
  });

  it("1 % of the first operand is not confused with a plain percentage", () => {
    expect(run("200+1%").pending).toMatchObject({ mode: "ofFirst", value: "200", percent: "1" });
  });

  it("percent after + or − is a percentage of the first operand", () => {
    expect(run("200+15%").pending).toEqual({
      kind: "percent",
      mode: "ofFirst",
      value: "200",
      percent: "15",
      resume: "enteringSecond",
    });
    expect(run("200-15%").pending).toMatchObject({ value: "200", percent: "15" });
  });

  it("percent after × or ÷ divides the second operand by 100", () => {
    expect(run("200*15%").pending).toEqual({
      kind: "percent",
      mode: "plain",
      value: "15",
      resume: "enteringSecond",
    });
  });
});

describe("errors, clearing and recall", () => {
  it("an API error shows Error and the next digit starts over", () => {
    const failed = reduce(run("1/0="), divisionByZero);
    expect(failed).toMatchObject({ phase: "error", display: "Error", expression: "1 ÷ 0" });
    expect(failed.error?.kind).toBe("api");
    expect(run("7", failed)).toMatchObject({ display: "7", phase: "enteringFirst", error: null });
  });

  it("operators, unary keys and backspace do nothing in the error state", () => {
    const failed = reduce(run("1/0="), divisionByZero);
    for (const key of ["+", "r", "%", "<", "~", "="]) {
      expect(run(key, failed)).toBe(failed);
    }
  });

  it("a network error keeps the operands so = retries", () => {
    const failed = reduce(run("1+2="), {
      type: "apiFailed",
      error: { kind: "network", message: "offline" },
    });
    expect(failed).toMatchObject({
      phase: "enteringSecond",
      display: "2",
      firstOperand: "1",
      pending: null,
    });
    expect(failed.error?.kind).toBe("network");
    expect(run("=", failed).pending).toMatchObject({ kind: "binary", a: "1", b: "2" });
  });

  it("a network error during a unary call keeps the operand", () => {
    const failed = reduce(run("16r"), {
      type: "apiFailed",
      error: { kind: "network", message: "offline" },
    });
    expect(failed).toMatchObject({ phase: "enteringFirst", display: "16", pending: null });
    expect(run("r", failed).pending).toMatchObject({ kind: "sqrt", value: "16" });
  });

  it("restored text after a network error is replaced, not edited", () => {
    const offline: CalculatorEvent = {
      type: "apiFailed",
      error: { kind: "network", message: "offline" },
    };
    // A recalled "1E-17" must not become "1E-175" by typing after a failure.
    const recalled = reduce(run("2+"), { type: "recall", value: "1E-17" });
    const failed = reduce(run("=", recalled), offline);
    expect(run("5", failed).display).toBe("5");
    expect(run("<", failed).display).toBe("1E-17");
    // After "5 + √" fails, typing starts the second operand instead of appending to "5".
    const sqrtFailed = reduce(run("5+r"), offline);
    expect(run("3", sqrtFailed)).toMatchObject({ phase: "enteringSecond", display: "3" });
  });

  it("the next successful input clears a network error", () => {
    const failed = reduce(run("1+2="), {
      type: "apiFailed",
      error: { kind: "network", message: "x" },
    });
    expect(run("=", failed).error).toBeNull();
  });

  it("all clear resets everything, even while awaiting a result", () => {
    expect(run("12+3C")).toEqual(initialState);
    expect(run("12+3=C")).toEqual(initialState);
  });

  it("stray results are ignored", () => {
    expect(received(run("12"), "99")).toEqual(run("12"));
  });

  it("recall loads a value as the current operand", () => {
    const second = reduce(run("2+"), { type: "recall", value: "40" });
    expect(second).toMatchObject({ display: "40", phase: "enteringSecond", firstOperand: "2" });
    expect(run("=", second).pending).toMatchObject({ a: "2", b: "40" });

    const first = reduce(initialState, { type: "recall", value: "40" });
    expect(first).toMatchObject({ display: "40", phase: "result" });
    expect(run("+", first).firstOperand).toBe("40");
  });
});
