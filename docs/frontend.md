# Frontend

React 19 and TypeScript (strict), built with Vite. Runtime dependencies are `react`, `react-dom` and [`motion`](https://motion.dev) for animation; nothing else ships to the browser.

## Layout

```
web/src/
├── features/calculator/
│   ├── model/          pure logic: no React, no fetch
│   │   ├── expression.ts  the calculator: tokens, input guards, state machine
│   │   ├── format.ts      display formatting (string-only, never Number())
│   │   ├── keymap.ts      physical key → event
│   │   └── types.ts       shared types (Problem, errors, limits)
│   ├── api/
│   │   ├── client.ts      fetch, retry with backoff, Problem Details
│   │   └── schema.gen.ts  generated from api/openapi.yaml — never edited
│   ├── hooks/
│   │   ├── useCalculator.ts  reducer + evaluation on "=" + live preview
│   │   ├── useHistory.ts     last 50 results in localStorage
│   │   ├── useKeyboard.ts    keyboard → events
│   │   └── useTheme.ts       light/dark, following the system until chosen
│   └── ui/             components, one CSS Module each
├── styles/             tokens.css, reset.css, global.css, contrast.test.ts
└── test/               Vitest setup and the msw mock API
```

The dependency direction is `ui → hooks → model/api`. Nothing in `model` imports React; nothing in `ui` calls `fetch`.

## The calculator model

`model/expression.ts` is the whole calculator: `reduceExpression(state, event) → state`, with no side effects. The expression is a **list of tokens** (numbers, operators, sign, `√`, `%`, parentheses) rather than text, because every input rule is a rule about the last token. It is evaluated by the server with operator precedence (`POST /api/v1/evaluate`), so `2 + 3 × 4` is 14 and `(2 + 3) × 4` is 20 ([ADR 0008](adr/0008-pratt-parser.md), [ADR 0009](adr/0009-one-mode.md)).

| Phase | Meaning |
|---|---|
| `editing` | Building the expression. |
| `evaluating` | `=` was pressed; input is ignored except AC. |
| `result` | A result is shown; a digit or `(` starts over, an operator continues from the result. |
| `error` | The API rejected it; backspace and operators keep fixing the same expression, a digit starts over. |

Input guards (each one is a test in `expression.test.ts`):

- An operator after an operator replaces it; `−` where a number is expected is a **sign** (`2 × −3`, `(−2)`), which is why there is no `±` key.
- `)` only when a `(` is open and something to close; `(` or `√` right after a number inserts `×` (`2(3)` becomes `2 × (3)`); `%` only after a number.
- `=` closes open parentheses and does nothing on an unfinished expression.
- Results and history values are *sealed*: a digit replaces them instead of editing them, so `1E-17` can never become `1E-175`.
- Each number is capped at 16 typed digits; a second `.` is ignored.
- **Percent** follows calculator convention: `200 + 15%` is 15% of 200 added to 200 (230); elsewhere `x%` is `x ÷ 100`.

The reducer never calls the API. On `=` it records a `pending` expression and moves to `evaluating`; `useCalculator` performs the request and dispatches `resultReceived` or `apiFailed`. A network failure keeps the expression, so `=` or Retry repeats it. An `invalid-expression` problem carries a column; the display maps it back to the token through `toApiString`'s column ranges and underlines it.

**Live preview.** 250 ms after the last edit of a complete expression that contains an operation, `useCalculator` evaluates it and shows the result in grey under the expression. Any newer edit aborts the request; a preview never retries and never shows errors (an unfinished expression is expected while typing).

| Keys | Tokens sent | Display | Preview |
|---|---|---|---|
| `2` `+` `3` `×` `4` | — | `2 + 3 × 4` | `14` |
| `=` | `2 + 3 × 4` | `14`, with `2 + 3 × 4 =` above | — |
| `(` `2` `+` `3` | — | `(2 + 3` | `5` |
| `)` `×` `4` `=` | `(2 + 3) × 4` | `20` | — |

## Talking to the API

`client.ts` exposes `callOperation(name, inputs)`. Operation names and response types come from `schema.gen.ts`, which `npm run gen` generates from `api/openapi.yaml`; CI fails if the committed file is stale, so the frontend cannot drift from the contract.

- **Retries** only on network errors and `502/503/504`: three attempts, exponential backoff from 300 ms with full jitter, capped at 2 s. Every other response is final.
- **Problem Details** responses become an `ApiError` carrying the problem; anything else unexpected is a `NetworkError`.
- **Abort** is honoured immediately, including during a backoff wait.

Numbers stay strings all the way through. The display formatter groups digits, rounds long results and switches to scientific notation using string and `BigInt` arithmetic only, because API results can have up to 1001 digits.

## Design system

`styles/tokens.css` defines every colour, radius, spacing step (4 pt grid), type size and motion duration ([ADR 0006](adr/0006-css-modules-over-tailwind.md)).

- **Palette:** neutral greys and one accent, Sezzle purple, used only for operators, `=` and interactive text.
- **Type:** the system UI font (SF Pro on Apple devices), light weight for the display, tabular figures so digits do not jitter.
- **Themes:** light and dark, chosen by a `data-theme` attribute on `<html>`. A sun/moon button switches them; until the user picks one, the theme follows the operating system and tracks changes to it. `public/theme.js` applies the theme before first paint, so a reload never flashes the wrong one; it is a file rather than an inline script so the Content Security Policy stays `script-src 'self'`.
- **Contrast:** `src/styles/contrast.test.ts` reads `tokens.css` and checks every text/background pair in both themes against WCAG 2.2 (4.5:1 for text, 3:1 for the large key labels and the focus ring). Accent *fills* (operator keys) and accent *text* (links, text buttons) are separate tokens, because text on grey surfaces needs more contrast than a fill does.
- **Layout:** on phones the calculator fills the screen with the keypad in thumb reach and history as a bottom sheet; from 721 px it becomes a floating card with history as a side panel.

## Motion

| Interaction | Animation |
|---|---|
| Key press | spring scale to 0.92 and a soft flash |
| Live preview | fades in under the expression |
| Result arrives | rises into the main line and unblurs; the expression fades into the line above |
| Calculation in flight | the display pulses |
| Invalid expression | the offending token turns red with a wavy underline; the detail appears below |
| Theme change | the sun/moon icon rotates; colours transition |
| History | slides in from the side while the calculator glides over, or springs up as a sheet |
| Connection problem | a banner drops in with Retry |

The reducer decides when the value was *replaced* rather than edited (a `replaced` counter in the state), and the display keys its enter animation on that, so typing never animates and every arriving result does once. These are enter-only animations on purpose: an earlier version morphed the preview into the result with shared layout ids, and when the preview unmounted first the result was left at opacity 0. The e2e suite now checks the result's computed opacity, because Playwright counts opacity 0 as visible.

`MotionConfig reducedMotion="user"` and the motion tokens disable all of it under `prefers-reduced-motion: reduce`.

## Accessibility and input

- Every key is a real `<button>` with a spoken name (`multiply`, `open parenthesis`, not `×` or `(`).
- The display is an `<output>` live region, so screen readers announce results and, on an API error, the problem's detail ("Error: division by zero"); `aria-busy` marks calculations in flight; the connection banner uses `role="alert"`.
- On phones the history sheet is a modal dialog: the calculator behind it is `inert`, and closing the sheet returns focus to the History button.
- Clicking a key does not leave focus on it, so pressing Enter afterwards means `=`; a key activated from the keyboard keeps its focus.
- Visible `:focus-visible` rings and 44 px minimum targets.
- Full keyboard support: digits, `.` or `,`, `+ - * x / ^`, `( )`, `r` for `√`, `%`, `Enter` or `=`, `Backspace`, `Escape` for AC (`Delete` is deliberately unbound, so a reflex keystroke cannot wipe a calculation). Shortcuts with Ctrl/⌘/Alt pass through to the browser, and Enter on a focused button activates that button.
- With history open, `Escape` closes it instead of clearing the calculator.
- Keys typed into an editable field are left alone.

## Running and testing

```bash
cd web
npm install
npm run dev            # http://localhost:5173, proxies /api to the Go service on :8080
npm test               # Vitest
npm run test:coverage  # coverage report in web/coverage/
npm run lint           # ESLint (typescript-eslint strict type-checked, react-hooks, jsx-a11y)
npm run typecheck
npm run gen            # regenerate API types after changing api/openapi.yaml
```

Tests are layered: the expression model, formatter, keymap, client and design tokens (contrast) are unit-tested without React; hooks are tested with `renderHook`; components are tested through the accessibility tree with Testing Library, against a mock API served by [msw](https://mswjs.io). See [testing.md](testing.md).

## Tooling notes

The current Vite template ships oxlint and TypeScript 6. The project uses ESLint 9 instead, because typescript-eslint's type-checked rules, `react-hooks` and `jsx-a11y` catch classes of bugs oxlint does not yet cover, and pins TypeScript to 5.9 because `openapi-typescript` supports 5.x.
