# Phase 2 — Expressions and Operator Precedence: Implementation Plan

> Execute task by task in the current session (superpowers:executing-plans). TDD for every code task: write the listed tests, see them fail, implement, see them pass, lint, commit. Independent review at the two checkpoints.

**Goal:** Ship [the phase 2 spec](../specs/2026-10-10-expression-evaluation-design.md): `POST /api/v1/evaluate` with a Pratt parser, and a Scientific mode beside the unchanged Basic mode.

**Architecture:** A new Go package `internal/expr` (lexer → parser → AST → evaluator over `calc`). A new pure reducer `model/expression.ts` over a token list, a `useScientific` hook with debounced preview, a mode switch, and a shared history owned by `Calculator`.

**Conventions:** as in phase 1 (English, Conventional Commits, one logical change per commit, no attribution). Before every push: Go tests and lint, Vitest, lint, typecheck, Prettier, **and Playwright against a freshly rebuilt stack**.

---

## Part A — Backend

### Task A1: Lexer

**Files:** `api/internal/expr/errors.go`, `lexer.go`, `lexer_test.go`

```go
const (MaxLength = 256; MaxTokens = 128; MaxDepth = 32)

var ErrSyntax = errors.New("invalid expression")

// SyntaxError carries a 1-based column (0 when the error has no location).
type SyntaxError struct{ Column int; Msg string }
func (e *SyntaxError) Error() string   // "unexpected ')' at column 7"
func (e *SyntaxError) Unwrap() error   // ErrSyntax

type Kind int // Number, Plus, Minus, Times, Divide, Power, Percent, Sqrt, LParen, RParen, EOF
type Token struct{ Kind Kind; Text string; Column int }

func Lex(s string) ([]Token, error) // always ends with an EOF token
```

Number scanning: digits, optional `.`, digits, optional `e`/`E` + optional sign + digits (the exponent is only consumed if a digit follows). Validation of the number itself is left to `calc.Parse` in the parser.

Tests (table-driven): each symbol and its alternative spelling (`- −`, `* ×`, `/ ÷`); columns counted in code points (`"√16 × 2"` → `×` at column 5); whitespace ignored; `"2 $ 3"` → `unexpected '$' at column 3`; 257 characters → length error; 129 tokens → token error; `"1e"` → number `1` then `unexpected 'e'`.

Commit: `feat(expr): tokenize expressions`

### Task A2: Parser and canonical form

**Files:** `api/internal/expr/ast.go`, `parser.go`, `parser_test.go`

AST: `Num{Value calc.Number}`, `Group{X}`, `Unary{Op, X}` (minus, plus, sqrt), `Binary{Op, L, R}`, `Pct{X}` (x ÷ 100), `PctOf{Op, Base, Rate}` (base ± base × rate ÷ 100). `String()` prints the canonical form: single spaces around binary operators, `−` `×` `÷` symbols, groups kept.

Pratt binding powers:

| Token | Role | Left bp | Right bp |
|---|---|---|---|
| `+` `−` | infix | 10 | 10 (left-assoc) |
| `×` `÷` | infix | 20 | 20 |
| `−` `+` | prefix | — | 30 |
| `^` | infix | 40 | 39 (right-assoc) |
| `%` | postfix | 50 | — |
| `√` | prefix | — | 60 |

When an infix `+`/`−` node's right operand is a `Pct`, build `PctOf` instead. A depth counter in `expr(rbp)` enforces `MaxDepth`. Numbers go through `calc.Parse`; its errors are wrapped with the column (`invalid number: "1.2.3" at column 5`) and keep their phase-1 problem types.

Tests:
- canonical output: `2+3*4` → `2 + 3 × 4`; `(2+3)*4` → `(2 + 3) × 4`; `-2^2` → `−2 ^ 2`.
- structure via evaluation in A3, but shape checks here: `2^3^2` is `2 ^ (3 ^ 2)`; `−2^2` is `−(2 ^ 2)`; `2^−1` parses; `√16+9` is `(√16) + 9`; `√16%` is `(√16)%`; `200+15%` is a `PctOf`; `200+15%×2` is not.
- errors with column: `""` → empty; `"2 +"` → unexpected end; `"(2 + 3"` → expected `)`; `"2 + 3)"` → `unexpected ')' at column 6`; `"2 3"` → unexpected number; 33 nested parentheses → depth error.
- `FuzzParse`: never panics; when `Parse(s)` succeeds, `Parse(ast.String())` succeeds and prints the same string.

Commit: `feat(expr): Pratt parser with canonical printing`, then `test(expr): fuzz the parser`.

### Task A3: Evaluator

**Files:** `api/internal/expr/eval.go`, `eval_test.go`

`func Eval(n Node) (calc.Number, error)` — recursive; operators map to `calc.Add/Subtract/Multiply/Divide/Power/Sqrt`; unary minus is `0 − x`; `Pct` is `calc.Percent(x, 1)`; `PctOf` evaluates the base once.

Tests: `2 + 3 × 4 = 14`, `(2 + 3) × 4 = 20`, `2 ^ 3 ^ 2 = 512`, `−2 ^ 2 = −4`, `2 ^ −1 = 0.5`, `√16 + 9 = 13`, `√(16 + 9) = 5`, `200 + 15% = 230`, `200 − 15% = 170`, `50% × 8 = 4`, `200 + 15% × 2 = 200.3`, `0.1 + 0.2 × 10 = 2.1`, `1 ÷ (2 − 2)` → `ErrDivisionByZero`, `√(0 − 4)` → `ErrNegativeSqrt`.

Commit: `feat(expr): evaluate expressions with calc`

### Task A4: `POST /api/v1/evaluate`

**Files:** `api/internal/httpapi/evaluate.go`, `evaluate_test.go`, `problem.go`, `operations.go`, `server.go`

- `Problem` gains `Position int \`json:"position,omitempty"\``; `writeError` sets it from a `*expr.SyntaxError`.
- `problemFromError` maps `expr.ErrSyntax` → `400 invalid-expression`; `titles` gains it.
- Handler: decode `{"expression"}` with the phase-1 decoder, `expr.Parse`, `expr.Eval`, respond `{"expression": canonical, "result"}`.
- `GET /api/v1/operations` returns the arithmetic operations plus `evaluate` (`params: ["expression"]`).

Tests: happy path with canonical echo; `invalid-expression` with `position`; a 422 from evaluation; malformed body; operations list length 8; method not allowed.

Commit: `feat(api): evaluate expressions over HTTP`

### Task A5: Contract and docs

- `openapi.yaml`: `/api/v1/evaluate`, `EvaluateRequest`, `EvaluateResponse`, `position` on `Problem`, `invalid-expression` in the slug list. Redocly lint; regenerate `schema.gen.ts`.
- `docs/api.md`: endpoint, grammar and precedence table, `### invalid-expression`. `docs/backend.md`: the package and limits. `docs/adr/0008-pratt-parser.md`.

Commits: `feat(api): document evaluate in OpenAPI`, `docs: phase 2 backend guide and ADR 8`

### ✅ Checkpoint 4 — review the backend (`internal/expr`, the route, the contract)

---

## Part B — Frontend

### Task B1: Typed responses per operation

`client.ts`: `ResponseBody<N>` from `paths[...]["post"]["responses"][200]`; `callOperation` returns it. No behaviour change.

Commit: `refactor(web): type responses per operation`

### Task B2: Shared history

`useCalculator(tuning, record)` receives the history's `add` instead of owning a history; `Calculator` owns `useHistory()`. Tests pass a spy for `record`.

Commit: `refactor(web): lift history out of the calculator hook`

### Task B3: Expression model

**Files:** `web/src/features/calculator/model/expression.ts`, `expression.test.ts`

Tokens: `number` (with `sealed` for recalled/result values, which are replaced rather than edited), `op`, `sign`, `sqrt`, `percent`, `open`, `close`. State: `tokens`, `phase` (`editing | evaluating | result | error`), `result`, `expression` (canonical, from the API), `preview` (with the expression it belongs to), `error`, `errorPosition`, `pending`, `replaced`.

Functions: `reduceExpression(state, event)`, `toApiString(tokens)` (with per-token column ranges for error mapping), `isComplete(tokens)`, `closeAll(tokens)`.

Tests, as key scripts: every guard in spec §4.3; `toApiString` columns; sealed values; result reuse; `=` auto-closes; preview accepted only for the current expression; syntax error keeps tokens and the position; backspace leaves the error state.

Commit: `feat(web): expression model for scientific mode`

### Task B4: `useScientific`

Debounced preview (250 ms, aborted by any edit), `=` evaluation, history recording through `record`, retry after network failure. Tests with msw and fake timers.

Commit: `feat(web): evaluate and preview expressions`

### Task B5: Mode switch, scientific keypad and display

- `useMode` (localStorage), `ModeSwitch` (radiogroup, sliding thumb).
- `SCIENTIFIC_KEYS`; `Keypad` takes `keys`; scientific keymap adds `( ) ^ r`.
- `ExpressionDisplay`: expression line with the error token underlined, preview line, swap animation on `=`.
- `Calculator` holds both hooks; the mode chooses what renders and where keys go; switching mode clears both entries.

Tests: mode persists and is a radiogroup; `2 + 3 × 4 = 14`; `(2 + 3) × 4 = 20`; preview appears; error underline; history recall into an expression; Basic tests unchanged.

Commits: `feat(web): mode switch`, `feat(web): scientific keypad and display`

### Task B6: e2e

Both modes, `2 + 3 × 4` → 20 in Basic and 14 in Scientific; parentheses; a syntax error from the physical keyboard.

Commit: `test(web): end-to-end scientific mode`

### Task B7: Docs

`frontend.md` (modes, expression model, preview), README (feature list, screenshots), `docs/ai/` (phase 2 prompts and corrections), spec §7 revisions if anything moved.

Commit: `docs: phase 2 frontend and README`

### ✅ Checkpoint 5 — review the frontend, then a final repository pass

---

## Done

CI green, cold clone verified, tag `v2.0.0`, test-runner deny rules restored in the developer's Claude Code settings.
