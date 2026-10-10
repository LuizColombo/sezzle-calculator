/**
 * The calculator as a pure state machine.
 *
 * The reducer never performs I/O. When a calculation is needed it records a
 * `pending` call and moves to `awaitingResult`; the useCalculator hook
 * performs the call and feeds back `resultReceived` or `apiFailed`.
 */
import {
  MAX_INPUT_DIGITS,
  OPERATOR_SYMBOL,
  type BinaryOperator,
  type CalculatorError,
  type CalculatorEvent,
  type CalculatorState,
  type PendingCall,
  type ResumePhase,
  type UnaryOperator,
} from "./types";

export const initialState: CalculatorState = {
  phase: "idle",
  display: "0",
  expression: null,
  firstOperand: null,
  operator: null,
  fresh: true,
  pending: null,
  error: null,
  replaced: 0,
};

/** A fresh state that keeps the replacement counter, optionally advancing it. */
function reset(
  state: CalculatorState,
  replace: boolean,
  overrides: Partial<CalculatorState>,
): CalculatorState {
  return { ...initialState, replaced: state.replaced + (replace ? 1 : 0), ...overrides };
}

export function reduce(state: CalculatorState, event: CalculatorEvent): CalculatorState {
  if (state.phase === "awaitingResult") {
    switch (event.type) {
      case "resultReceived":
        return onResult(state, event.result);
      case "apiFailed":
        return onFailure(state, event.error);
      case "allClear":
        return reset(state, true, {});
      default:
        return state;
    }
  }

  switch (event.type) {
    case "digit":
      return onDigit(state, event.digit);
    case "decimal":
      return onDecimal(state);
    case "backspace":
      return onBackspace(state);
    case "toggleSign":
      return onToggleSign(state);
    case "operator":
      return onOperator(state, event.operator);
    case "equals":
      return onEquals(state);
    case "unary":
      return onUnary(state, event.operator);
    case "recall":
      return onRecall(state, event.value);
    case "allClear":
      return reset(state, true, {});
    case "resultReceived":
    case "apiFailed":
      return state; // a stray response after the user moved on
  }
}

// ── typing ────────────────────────────────────────────────────────────────

/** Whether the next key starts a new operand instead of editing the current one. */
const startsNewOperand = (s: CalculatorState) =>
  s.fresh || s.phase === "result" || s.phase === "error";

/** Digits typed so far, not counting the leading zero of "0.xxx". */
const typedDigits = (display: string) => display.replace(/^-?0\./, ".").replace(/\D/g, "").length;

function beginOperand(state: CalculatorState, display: string): CalculatorState {
  if (state.phase === "operatorChosen" || (state.phase === "enteringSecond" && state.fresh)) {
    return { ...state, phase: "enteringSecond", display, fresh: false, error: null };
  }
  return reset(state, false, { phase: "enteringFirst", display, fresh: false });
}

function onDigit(state: CalculatorState, digit: string): CalculatorState {
  if (startsNewOperand(state)) return beginOperand(state, digit);
  if (typedDigits(state.display) >= MAX_INPUT_DIGITS) return state;
  const display =
    state.display === "0" ? digit : state.display === "-0" ? `-${digit}` : state.display + digit;
  return { ...state, display, error: null };
}

function onDecimal(state: CalculatorState): CalculatorState {
  if (startsNewOperand(state)) return beginOperand(state, "0.");
  if (state.display.includes(".")) return state;
  return { ...state, display: `${state.display}.`, error: null };
}

function onBackspace(state: CalculatorState): CalculatorState {
  if (startsNewOperand(state)) return state;
  const trimmed = state.display.slice(0, -1);
  const display = trimmed === "" || trimmed === "-" || trimmed === "-0" ? "0" : trimmed;
  return { ...state, display, error: null };
}

function onToggleSign(state: CalculatorState): CalculatorState {
  if (state.phase === "error") return state;
  // Right after an operator, ± starts a negative second operand: "5 + ± 3" is 5 + (−3).
  if (state.phase === "operatorChosen") {
    return { ...state, phase: "enteringSecond", display: "-0", fresh: false, error: null };
  }
  if (state.display === "0") return state;
  const display = state.display.startsWith("-") ? state.display.slice(1) : `-${state.display}`;
  return { ...state, display, error: null };
}

// ── operators ─────────────────────────────────────────────────────────────

/** The operand as it is committed to a calculation: "1." → "1", "-0" → "0". */
function commit(display: string): string {
  const trimmed = display.endsWith(".") ? display.slice(0, -1) : display;
  return /^-0(\.0*)?$/.test(trimmed) ? "0" : trimmed;
}

const describe = (a: string, op: BinaryOperator, b?: string) =>
  b === undefined ? `${a} ${OPERATOR_SYMBOL[op]}` : `${a} ${OPERATOR_SYMBOL[op]} ${b}`;

function request(
  state: CalculatorState,
  pending: PendingCall,
  expression: string,
): CalculatorState {
  return { ...state, phase: "awaitingResult", pending, expression, error: null };
}

/** The binary call for "firstOperand operator display", if one is complete. */
function completeBinary(
  state: CalculatorState,
  then: Extract<PendingCall, { kind: "binary" }>["then"],
): CalculatorState | null {
  if (state.phase !== "enteringSecond" || state.firstOperand === null || state.operator === null) {
    return null;
  }
  const b = commit(state.display);
  const pending: PendingCall = {
    kind: "binary",
    operator: state.operator,
    a: state.firstOperand,
    b,
    then,
  };
  return request(state, pending, describe(state.firstOperand, state.operator, b));
}

function onOperator(state: CalculatorState, operator: BinaryOperator): CalculatorState {
  if (state.phase === "error") return state;
  // "2 + 3 ×" evaluates 2 + 3 first, then continues with × (chaining).
  const chained = completeBinary(state, { type: "chain", nextOperator: operator });
  if (chained) return chained;
  const first = commit(state.display);
  return {
    ...state,
    phase: "operatorChosen",
    display: first,
    firstOperand: first,
    operator,
    expression: describe(first, operator),
    fresh: true,
    error: null,
  };
}

function onEquals(state: CalculatorState): CalculatorState {
  return completeBinary(state, { type: "show" }) ?? state;
}

function onUnary(state: CalculatorState, operator: UnaryOperator): CalculatorState {
  if (state.phase === "error") return state;
  const resume: ResumePhase =
    state.phase === "operatorChosen" || state.phase === "enteringSecond"
      ? "enteringSecond"
      : "result";
  const value = commit(state.display);

  if (operator === "sqrt") {
    return request(state, { kind: "sqrt", value, resume }, `√${value}`);
  }

  // Calculator convention: "200 + 15 %" means 15 % of 200; elsewhere x % is x / 100.
  const additive = state.operator === "add" || state.operator === "subtract";
  const pending: PendingCall =
    resume === "enteringSecond" && additive && state.firstOperand !== null
      ? { kind: "percent", mode: "ofFirst", value: state.firstOperand, percent: value, resume }
      : { kind: "percent", mode: "plain", value, resume };
  return request(state, pending, `${value}%`);
}

function onRecall(state: CalculatorState, value: string): CalculatorState {
  if (state.phase === "operatorChosen" || state.phase === "enteringSecond") {
    return {
      ...state,
      phase: "enteringSecond",
      display: value,
      fresh: true,
      error: null,
      replaced: state.replaced + 1,
    };
  }
  return reset(state, true, { phase: "result", display: value });
}

// ── responses ─────────────────────────────────────────────────────────────

/** Expression line while typing the second operand, e.g. "2 +". */
function secondOperandExpression(state: CalculatorState): string | null {
  return state.firstOperand !== null && state.operator !== null
    ? describe(state.firstOperand, state.operator)
    : null;
}

function onResult(state: CalculatorState, result: string): CalculatorState {
  const pending = state.pending;
  if (!pending) return state;

  if (pending.kind === "binary") {
    if (pending.then.type === "chain") {
      const op = pending.then.nextOperator;
      return reset(state, true, {
        phase: "operatorChosen",
        display: result,
        firstOperand: result,
        operator: op,
        expression: describe(result, op),
      });
    }
    return reset(state, true, {
      phase: "result",
      display: result,
      expression: `${describe(pending.a, pending.operator, pending.b)} =`,
    });
  }

  if (pending.resume === "enteringSecond") {
    return {
      ...state,
      phase: "enteringSecond",
      display: result,
      expression: secondOperandExpression(state),
      fresh: true,
      pending: null,
      replaced: state.replaced + 1,
    };
  }
  return reset(state, true, { phase: "result", display: result, expression: state.expression });
}

function onFailure(state: CalculatorState, error: CalculatorError): CalculatorState {
  if (error.kind === "api") {
    return reset(state, true, {
      phase: "error",
      display: "Error",
      expression: state.expression,
      error,
    });
  }

  // Network failure: restore the operands so the same key retries.
  const pending = state.pending;
  if (pending?.kind === "binary") {
    return {
      ...state,
      phase: "enteringSecond",
      display: pending.b,
      expression: secondOperandExpression(state),
      // The restored text was not typed in this operand, so the next key replaces it.
      fresh: true,
      pending: null,
      error,
    };
  }
  const resumeSecond = pending?.resume === "enteringSecond";
  return {
    ...state,
    phase: resumeSecond ? "enteringSecond" : "enteringFirst",
    expression: resumeSecond ? secondOperandExpression(state) : null,
    fresh: true,
    pending: null,
    error,
  };
}
