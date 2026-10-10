# Sezzle Calculator — Phase 2 Design Spec: Expressions and operator precedence

**Date:** 2026-10-10
**Status:** Approved
**Builds on:** [Phase 1 spec](2026-10-10-calculator-design.md) (v1.0.0). Everything there still holds unless this document says otherwise.

## 1. Goal

Phase 1 evaluates as you type, left to right, like a basic calculator: `2 + 3 × 4` is `20`. Phase 2 adds a **Scientific** mode that respects operator precedence and parentheses: `2 + 3 × 4` is `14`, `(2 + 3) × 4` is `20`. The **Basic** mode stays exactly as it is.

The expression is evaluated on the server, by the same decimal arithmetic as the per-operation endpoints, so both modes give identical results for the same calculation.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Two modes, Basic and Scientific, switched by a segmented control | Basic keeps the immediate-execution calculator people expect from a phone; Scientific adds precedence without changing Basic's behaviour. |
| 2 | One new endpoint, `POST /api/v1/evaluate`, taking the whole expression | The per-operation endpoints remain (they are the original requirement); evaluation stays on the server, so there is one implementation of arithmetic. |
| 3 | A Pratt (precedence-climbing) parser in a new `internal/expr` package | Each precedence level is one table row; unary operators and right-associative `^` fall out naturally. Shunting-yard needs special cases for both. ADR 0008. |
| 4 | Hard limits on expression length, token count and nesting depth | A recursive-descent parser must bound recursion; unbounded `((((…` is a stack-exhaustion DoS. |
| 5 | Syntax errors report the column | The UI can point at the mistake; a plain "invalid expression" helps no one. |
| 6 | The Scientific UI keeps the expression as tokens, not text | Input guards (balanced parentheses, no doubled operators) are rules over tokens; string surgery would be fragile. |

## 3. Backend

### 3.1 Package `internal/expr`

```
api/internal/expr/
├── lexer.go        string → []Token (with column)
├── parser.go       []Token → Node (AST), Pratt
├── ast.go          Node types and String() (canonical form)
├── eval.go         Node → calc.Number, via the calc package
├── errors.go       SyntaxError{Column, Msg}, limits
└── *_test.go       table-driven + FuzzParse
```

`expr` depends on `calc`; `calc` does not change. `httpapi` depends on `expr` for the new route only.

### 3.2 Grammar

Tokens:

| Token | Spellings |
|---|---|
| number | the phase-1 decimal grammar: `0.1`, `.5`, `1e-3` (at most 34 significant digits, as before) |
| plus, minus | `+`, `-`, `−` (U+2212) |
| times, divide | `*`, `×`, `/`, `÷` |
| power | `^` |
| percent | `%` |
| sqrt | `√` |
| parens | `(`, `)` |

Whitespace is ignored. Anything else is a syntax error at its column (columns count Unicode code points, 1-based).

Precedence, lowest to highest:

| Level | Operators | Associativity | Notes |
|---|---|---|---|
| 1 | `+` `−` | left | |
| 2 | `×` `÷` | left | |
| 3 | unary `−`, unary `+` | prefix | `−2^2 = −4` (as in mathematics and Python) |
| 4 | `^` | right | `2^3^2 = 512`; `2^−1 = 0.5` (unary minus allowed in the exponent) |
| 5 | `√` | prefix | binds to the next primary: `√16 + 9 = 13`, `√(16 + 9) = 5` |
| 6 | postfix `%`, primary (number, `( … )`) | | |

**Percent** follows the Basic-mode convention so the two modes agree: when the right operand of `+` or `−` is exactly `x%`, it is x percent of the left operand (`200 + 15%` = `200 + 30` = `230`; `200 − 15%` = `170`). Everywhere else `x%` is `x ÷ 100` (`50% × 8` = `4`, `2 × 15%` = `0.3`, and `200 + 15% × 2` = `200 + 0.3` = `200.3`, because the right operand is `15% × 2`, not `15%`). Implementation: the parser produces a `Percent` node; when building a `+`/`−` node whose right child is a `Percent`, it rewrites it to `Percent(of: left, rate: inner)`.

**No implicit multiplication** on the server: `2(3)` is a syntax error. The UI inserts an explicit `×` (§4.3).

### 3.3 Limits

| Limit | Value | Error |
|---|---|---|
| Expression length | 256 code points | `400 invalid-expression` |
| Tokens | 128 | `400 invalid-expression` |
| Parenthesis / unary nesting depth | 32 | `400 invalid-expression` |
| Each number | phase-1 limits | `400 invalid-number` / `422 number-too-large` |

### 3.4 Evaluation

The AST is evaluated bottom-up with the phase-1 functions (`calc.Add`, `calc.Power`, `calc.Sqrt`, `calc.Percent`, …). Errors are the phase-1 sentinel errors and map to the same problem types (`division-by-zero`, `invalid-power`, `negative-square-root`, `result-too-large`, …). The first error in evaluation order wins.

### 3.5 HTTP

```
POST /api/v1/evaluate
{"expression": "2 + (3 − 1) × 4^2 / √16"}

200 {"expression": "2 + (3 − 1) × 4 ^ 2 ÷ √16", "result": "10"}
```

- `expression` in the response is the canonical form (`String()` of the AST): normalised spacing and symbols, redundant parentheses kept as typed. It is what the UI shows in history.
- Request decoding reuses phase-1 rules (JSON object, exactly the `expression` field, a JSON string, 1 KiB body).
- New problem type `invalid-expression` (400) with an extension member `position` (1-based column) when the error has a location:

```json
{
  "type": ".../docs/api.md#invalid-expression",
  "title": "Invalid expression",
  "status": 400,
  "detail": "unexpected ')' at column 7",
  "position": 7,
  "instance": "/api/v1/evaluate"
}
```

- `GET /api/v1/operations` lists `evaluate` with params `["expression"]`.
- `openapi.yaml` gains the path, `EvaluateRequest`, `EvaluateResponse`, and documents `position` on `Problem`.

### 3.6 Tests

- Lexer: every token spelling, columns with multi-byte symbols, invalid characters.
- Parser: precedence and associativity tables (`2+3×4`, `2^3^2`, `−2^2`, `2^−1`, `√16+9`, `(2+3)×4`), the percent rewrite, every syntax error with its column, each limit at and beyond its boundary.
- Evaluator: results through `calc`, each domain error, `0.1 + 0.2 × 10`.
- `FuzzParse`: never panics; for any input that parses, `Parse(String(ast))` yields an equal AST (canonical form round-trips).
- HTTP: happy path, canonical expression in the response, `invalid-expression` with `position`, a domain error (422), decoding errors.

## 4. Frontend

### 4.1 Mode switch

A segmented control, `Basic | Scientific`, below the toolbar. The selected segment's background slides between options (`motion` `layoutId`). The mode is stored in `localStorage` (`sezzle-calculator.mode.v1`); default Basic. Switching mode clears the current entry (not history). Keyboard: `Ctrl/⌘` combos untouched; the control is a radio group (`role="radiogroup"`, arrow keys move between options).

### 4.2 Scientific keypad

```
 AC   (    )    ÷
 √    xʸ   %    ×
 7    8    9    −
 4    5    6    +
 1    2    3    =
 ⌫    0    .    =      "=" spans two rows
```

Physical keyboard adds `(`, `)`, `^`, `r` → `√` in Scientific mode. `±` is not needed: `−` typed where an operand is expected is a sign.

### 4.3 Expression model (`model/expression.ts`)

A pure reducer over a token list:

```ts
type Token =
  | { kind: "number"; text: string }        // being typed or complete
  | { kind: "operator"; op: "+" | "−" | "×" | "÷" | "^" }
  | { kind: "sign" }                          // unary minus
  | { kind: "sqrt" }
  | { kind: "percent" }
  | { kind: "open" } | { kind: "close" };
```

Input guards (each one a test):
- Digits and `.` extend the trailing number or start one; one `.` per number; 16 typed digits per number.
- An operator after an operator replaces it; an operator after `(` or at the start is ignored, except `−`, which becomes a sign.
- `)` only when a `(` is open and the last token ends an operand.
- `(` or `√` after a number or `)` inserts an explicit `×` first.
- `%` only after an operand.
- `⌫` removes the last character (a digit) or the last token.
- `=` auto-closes open parentheses, and does nothing if the expression does not end with an operand.
- After a result, a digit starts a new expression; an operator continues from the result.
- Recall from history appends the value as a number (inserting `×` if needed).

`toString(tokens)` produces the text sent to the API (ASCII-safe symbols are not required; the server accepts `× ÷ − √`).

### 4.4 Hook (`hooks/useScientific.ts`)

- **Live preview:** when the token list is a complete expression (balanced and ending with an operand), wait 250 ms, then `POST /evaluate`; a newer edit aborts the in-flight preview. Preview errors are not shown (the expression may simply be unfinished); network failures are silent for previews.
- **`=`:** evaluates immediately (cancelling any preview), shows the result, records `{expression: canonical, result}` in history.
- Errors on `=`: problem detail shown like phase 1; `invalid-expression` additionally underlines the token at `position`.
- Same retry/backoff client, same abort discipline as `useCalculator`.

### 4.5 Display

While typing: the expression is the main line (auto-shrinking, scrolls to the end if long), the preview is a muted line below. On `=`: a layout animation swaps them, the result grows into the main line and the expression moves to the small line. Reduced motion: instant swap.

### 4.6 Reuse and isolation

- Reused unchanged: API client, `format.ts`, `useHistory`, `useTheme`, `Key`, `HistoryPanel`, `StatusBanner`, tokens.
- `Keypad` takes the key list as a prop (`BASIC_KEYS`, `SCIENTIFIC_KEYS`).
- Basic mode's reducer is not modified. One history serves both modes, so `Calculator` owns `useHistory()` and passes its `add` to `useCalculator` and `useScientific` (a small dependency injection; Basic's behaviour does not change).
- `Calculator` holds both hooks; the mode decides which one renders and receives keys. Switching mode clears both entries.

### 4.7 Tests

- `expression.test.ts`: every guard in §4.3 as key scripts; `toString`; recall; result reuse.
- `useScientific.test.ts` (msw): preview after debounce, abort on edit, `=` evaluates and records history, error with position.
- Components: mode switch (persisted, radiogroup semantics), `2 + 3 × 4 = 14`, parentheses, error underline.
- e2e: both modes; `2 + 3 × 4` is 20 in Basic and 14 in Scientific; `(2 + 3) × 4 = 20`; a syntax error.

## 5. Delivery

- Commits: backend first (lexer → parser → evaluator → route → OpenAPI), then frontend (model → hook → keypad/mode switch → display), then e2e and docs.
- Docs: ADR 0008 (parser choice, server-side evaluation); `api.md` (endpoint, grammar table, `invalid-expression`); `backend.md` (package, limits); `frontend.md` (modes, expression model, preview); README (feature, screenshot); `docs/ai/` (phase-2 prompts and corrections).
- Independent review: after the backend, after the frontend, and a final repository pass.
- Done when: CI green, cold clone verified, tag `v2.0.0`.

## 6. Out of scope

- Implicit multiplication on the server, functions beyond `√` (sin, log…), variables, memory keys (M+, MR).
- Server-side history.
