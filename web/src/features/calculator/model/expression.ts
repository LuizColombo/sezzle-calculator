/**
 * Scientific mode: an expression built from tokens, evaluated by the API
 * with operator precedence. Like the Basic reducer this is pure; it records
 * a `pending` evaluation and the useScientific hook performs it.
 *
 * The expression is a token list rather than text because every input guard
 * ("no ')' without a '('", "an operator replaces an operator") is a rule
 * about the last token, which is fragile to express as string surgery.
 */
import { MAX_INPUT_DIGITS, type CalculatorError } from "./types";

export type ExprOp = "+" | "−" | "×" | "÷" | "^";

export type ExprToken =
  /** sealed: a recalled value or a previous result; replaced, never edited. */
  | { kind: "number"; text: string; sealed?: true }
  | { kind: "op"; op: ExprOp }
  | { kind: "sign" }
  | { kind: "sqrt" }
  | { kind: "percent" }
  | { kind: "open" }
  | { kind: "close" };

export interface Evaluated {
  /** The canonical expression, as the API returned it (results) or sent it (previews). */
  expression: string;
  value: string;
}

export interface ScientificState {
  tokens: ExprToken[];
  phase: "editing" | "evaluating" | "result" | "error";
  result: Evaluated | null;
  /** The last preview; it applies only while its expression matches the current one. */
  preview: Evaluated | null;
  error: CalculatorError | null;
  /** 1-based column (in the API string) of an invalid-expression error. */
  errorPosition: number | null;
  pending: { expression: string } | null;
  /** Counts value replacements; the display animates on it (as in Basic). */
  replaced: number;
}

export type ScientificEvent =
  | { type: "digit"; digit: string }
  | { type: "decimal" }
  | { type: "operator"; op: ExprOp }
  | { type: "open" }
  | { type: "close" }
  | { type: "sqrt" }
  | { type: "percent" }
  | { type: "backspace" }
  | { type: "allClear" }
  | { type: "equals" }
  | { type: "recall"; value: string }
  | { type: "previewReceived"; expression: string; value: string }
  | { type: "resultReceived"; expression: string; value: string }
  | { type: "apiFailed"; error: CalculatorError; position?: number };

export const initialScientific: ScientificState = {
  tokens: [],
  phase: "editing",
  result: null,
  preview: null,
  error: null,
  errorPosition: null,
  pending: null,
  replaced: 0,
};

// ── token helpers ─────────────────────────────────────────────────────────

const last = (tokens: ExprToken[]) => tokens.at(-1);

/** Whether the expression currently ends with a complete operand. */
function endsOperand(tokens: ExprToken[]): boolean {
  const t = last(tokens);
  return t?.kind === "number" || t?.kind === "close" || t?.kind === "percent";
}

function openCount(tokens: ExprToken[]): number {
  return tokens.reduce((n, t) => n + (t.kind === "open" ? 1 : t.kind === "close" ? -1 : 0), 0);
}

/** Appends `token`, inserting an explicit × when it would follow an operand. */
function afterOperand(tokens: ExprToken[], token: ExprToken): ExprToken[] {
  return endsOperand(tokens) ? [...tokens, { kind: "op", op: "×" }, token] : [...tokens, token];
}

/** Digits typed so far, not counting the leading zero of "0.xxx". */
const typedDigits = (text: string) => text.replace(/^-?0\./, ".").replace(/\D/g, "").length;

/** The expression can be evaluated: it ends with an operand (parentheses close themselves). */
export function isComplete(tokens: ExprToken[]): boolean {
  return tokens.length > 0 && endsOperand(tokens);
}

/** Closes every open parenthesis. */
export function closeAll(tokens: ExprToken[]): ExprToken[] {
  const missing = openCount(tokens);
  return missing > 0
    ? [...tokens, ...Array.from({ length: missing }, () => ({ kind: "close" }) as const)]
    : tokens;
}

const SYMBOL: Record<Exclude<ExprToken["kind"], "number" | "op">, string> = {
  sign: "−",
  sqrt: "√",
  percent: "%",
  open: "(",
  close: ")",
};

/** Text of one token, without surrounding spaces. */
export const tokenText = (t: ExprToken) =>
  t.kind === "number" ? t.text : t.kind === "op" ? t.op : SYMBOL[t.kind];

/**
 * The text sent to the API, with binary operators spaced, plus each token's
 * column range [start, end) — 1-based code points, as the API reports errors.
 */
export function toApiString(tokens: ExprToken[]): { text: string; ranges: [number, number][] } {
  let text = "";
  const ranges: [number, number][] = [];
  // Code points, not UTF-16 units: the API counts "×" and "÷" as one column each.
  const length = () => Array.from(text).length;
  for (const t of tokens) {
    if (t.kind === "op") text += " ";
    const start = length() + 1;
    text += tokenText(t);
    ranges.push([start, length() + 1]);
    if (t.kind === "op") text += " ";
  }
  return { text: text.trimEnd(), ranges };
}

// ── reducer ───────────────────────────────────────────────────────────────

export function reduceExpression(state: ScientificState, event: ScientificEvent): ScientificState {
  if (state.phase === "evaluating") {
    switch (event.type) {
      case "resultReceived":
        return {
          ...initialScientific,
          phase: "result",
          result: { expression: event.expression, value: event.value },
          replaced: state.replaced + 1,
        };
      case "apiFailed":
        return onFailure(state, event.error, event.position);
      case "allClear":
        return { ...initialScientific, replaced: state.replaced + 1 };
      default:
        return state;
    }
  }

  switch (event.type) {
    case "allClear":
      return { ...initialScientific, replaced: state.replaced + 1 };
    case "previewReceived":
      return { ...state, preview: { expression: event.expression, value: event.value } };
    case "resultReceived":
    case "apiFailed":
      return state; // a stray response after the user moved on
    case "equals":
      return onEquals(state);
    default:
      return edit(startEditing(state, event), event);
  }
}

/**
 * Leaves the result or error state for an editing key. After a result, a
 * value key starts a new expression and an operator continues from the
 * result; after an error, backspace and operators keep fixing the same
 * expression and a value key starts over.
 */
function startEditing(state: ScientificState, event: ScientificEvent): ScientificState {
  const startsValue = ["digit", "decimal", "open", "sqrt", "recall"].includes(event.type);
  if (state.phase === "result") {
    if (startsValue) return { ...initialScientific, replaced: state.replaced };
    const value = state.result?.value ?? "0";
    return {
      ...initialScientific,
      tokens: [{ kind: "number", text: value, sealed: true }],
      replaced: state.replaced,
    };
  }
  if (state.phase === "error" || state.error) {
    const tokens = state.phase === "error" && startsValue ? [] : state.tokens;
    return { ...state, phase: "editing", tokens, error: null, errorPosition: null };
  }
  return state;
}

function edit(state: ScientificState, event: ScientificEvent): ScientificState {
  const tokens = editTokens(state.tokens, event);
  return tokens === state.tokens ? state : { ...state, tokens };
}

function editTokens(tokens: ExprToken[], event: ScientificEvent): ExprToken[] {
  const t = last(tokens);
  switch (event.type) {
    case "digit":
    case "decimal": {
      const piece = event.type === "digit" ? event.digit : ".";
      if (t?.kind === "number" && !t.sealed) {
        if (piece === "." && t.text.includes(".")) return tokens;
        if (piece !== "." && typedDigits(t.text) >= MAX_INPUT_DIGITS) return tokens;
        const text = t.text === "0" && piece !== "." ? piece : t.text + piece;
        return [...tokens.slice(0, -1), { kind: "number", text }];
      }
      const fresh: ExprToken = { kind: "number", text: piece === "." ? "0." : piece };
      if (t?.kind === "number") return [...tokens.slice(0, -1), fresh]; // replaces a sealed value
      return afterOperand(tokens, fresh);
    }
    case "operator": {
      if (!t || t.kind === "open" || t.kind === "sqrt" || t.kind === "sign") {
        return event.op === "−" && t?.kind !== "sign" ? [...tokens, { kind: "sign" }] : tokens;
      }
      if (t.kind === "op") {
        if (event.op === "−" && (t.op === "×" || t.op === "÷" || t.op === "^")) {
          return [...tokens, { kind: "sign" }];
        }
        return [...tokens.slice(0, -1), { kind: "op", op: event.op }];
      }
      return [...tokens, { kind: "op", op: event.op }];
    }
    case "open":
      return afterOperand(tokens, { kind: "open" });
    case "sqrt":
      return afterOperand(tokens, { kind: "sqrt" });
    case "close":
      return openCount(tokens) > 0 && endsOperand(tokens) ? [...tokens, { kind: "close" }] : tokens;
    case "percent":
      return endsOperand(tokens) ? [...tokens, { kind: "percent" }] : tokens;
    case "backspace": {
      if (!t) return tokens;
      if (t.kind === "number" && !t.sealed && t.text.length > 1) {
        return [...tokens.slice(0, -1), { kind: "number", text: t.text.slice(0, -1) }];
      }
      return tokens.slice(0, -1);
    }
    case "recall":
      return afterOperand(tokens, { kind: "number", text: event.value, sealed: true });
    default:
      return tokens;
  }
}

function onEquals(state: ScientificState): ScientificState {
  const editing = state.phase === "error" ? { ...state, phase: "editing" as const } : state;
  if (editing.phase !== "editing" || !isComplete(editing.tokens)) return state;
  const tokens = closeAll(editing.tokens);
  return {
    ...editing,
    tokens,
    phase: "evaluating",
    pending: { expression: toApiString(tokens).text },
    error: null,
    errorPosition: null,
  };
}

function onFailure(
  state: ScientificState,
  error: CalculatorError,
  position?: number,
): ScientificState {
  if (error.kind === "network") {
    return { ...state, phase: "editing", pending: null, error };
  }
  return { ...state, phase: "error", pending: null, error, errorPosition: position ?? null };
}
