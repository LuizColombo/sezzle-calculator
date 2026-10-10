# Frontend

React 19 and TypeScript (strict), built with Vite. Runtime dependencies are `react`, `react-dom` and [`motion`](https://motion.dev) for animation; nothing else ships to the browser.

## Layout

```
web/src/
├── features/calculator/
│   ├── model/          pure logic: no React, no fetch
│   │   ├── types.ts      state, events, pending calls
│   │   ├── reducer.ts    the calculator state machine
│   │   ├── format.ts     display formatting (string-only, never Number())
│   │   └── keymap.ts     physical key → event
│   ├── api/
│   │   ├── client.ts     fetch, retry with backoff, Problem Details
│   │   └── schema.gen.ts generated from api/openapi.yaml — never edited
│   ├── hooks/
│   │   ├── useCalculator.ts  reducer + performs the API calls it asks for
│   │   ├── useHistory.ts     last 50 results in localStorage
│   │   └── useKeyboard.ts    keyboard → events
│   └── ui/             components, one CSS Module each
├── styles/             tokens.css, reset.css, global.css
└── test/               Vitest setup and the msw mock API
```

The dependency direction is `ui → hooks → model/api`. Nothing in `model` imports React; nothing in `ui` calls `fetch`.

## Modes

A segmented control switches **Basic** and **Scientific** (remembered across visits). `Calculator` holds both modes' hooks and one shared history; the mode decides which one renders and receives keys, and switching clears the current entry of both.

**Scientific** keeps the expression as a token list in a pure reducer, `model/expression.ts`, where the input guards live: an operator replaces an operator, `−` where an operand is expected becomes a sign, `)` needs an open `(`, `(` or `√` after a number inserts `×`, `=` closes open parentheses, and recalled values or previous results are *sealed* (replaced, never edited). `useScientific` evaluates on `=` and shows a **live preview**: 250 ms after the last edit of a complete expression it calls `/evaluate`, and any newer edit aborts it. An `invalid-expression` error underlines the token at the column the API reports. The display swaps the expression and the result with shared layout animations.

## The state machine

`reducer.ts` is the whole calculator: `reduce(state, event) → state`, with no side effects. It is the most heavily tested file.

| Phase | Meaning |
|---|---|
| `idle` | Fresh start, display `0`. |
| `enteringFirst` | Typing the first operand. |
| `operatorChosen` | An operator was pressed; the display still shows the first operand. |
| `enteringSecond` | Typing the second operand. |
| `awaitingResult` | A calculation is in flight; input is ignored except AC. |
| `result` | A result is shown; a digit starts over, an operator continues from it. |
| `error` | The API rejected the calculation; a digit starts over. |

When a calculation is needed the reducer does not call the API. It records a `pending` call (`{kind: "binary", operator: "add", a: "2", b: "3", then: …}`) and moves to `awaitingResult`. `useCalculator` sees `pending`, performs the request, and dispatches `resultReceived` or `apiFailed`. Starting a new calculation or pressing AC aborts the request in flight.

Rules worth knowing:

- **Chaining.** `2 + 3 ×` evaluates `2 + 3` first, then continues with `5 ×`. Only the final result goes to history.
- **Percent** follows calculator convention: after `+` or `−` it is a percentage of the first operand (`200 + 15 %` → `200 + 30`); otherwise `x %` is `x / 100`.
- **± after an operator** starts a negative second operand (`5 + ± 3` is `5 + (−3)`).
- **Network failure** restores the operands, so pressing the same key (or Retry) repeats the calculation. An API error (`422`) shows `Error` and the problem's `detail`.
- Input is capped at 16 digits; a second `.` is ignored; backspace bottoms out at `0`.

| Keys | Phase | Display | Pending |
|---|---|---|---|
| `1` `2` | enteringFirst | `12` | — |
| `+` | operatorChosen | `12` | — |
| `3` | enteringSecond | `3` | — |
| `=` | awaitingResult | `3` | `add 12 3, show` |
| *(response `15`)* | result | `15` | — |

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
| Operator chosen | the key inverts until the second operand starts |
| Value replaced (result, chained result, error, recall, AC) | the old value blurs out upwards, the new one rises in |
| Expression line | cross-fades when it changes |
| Calculation in flight | the display pulses |
| API error | the display shakes once and turns red |
| History | slides in from the side while the calculator glides over, or springs up as a sheet |
| Connection problem | a banner drops in with Retry |

The reducer decides when the value was *replaced* rather than edited (a `replaced` counter in the state), and the display keys its transition on that, so typing never animates and every arriving result does once.

`MotionConfig reducedMotion="user"` and the motion tokens disable all of it under `prefers-reduced-motion: reduce`.

## Accessibility and input

- Every key is a real `<button>` with a spoken name (`multiply`, not `×`); the active operator has `aria-pressed`.
- The display is an `<output>` live region, so screen readers announce results and, on an API error, the problem's detail ("Error: division by zero"); `aria-busy` marks calculations in flight; the connection banner uses `role="alert"`.
- On phones the history sheet is a modal dialog: the calculator behind it is `inert`, and closing the sheet returns focus to the History button.
- Clicking a key does not leave focus on it, so pressing Enter afterwards means `=`; a key activated from the keyboard keeps its focus.
- Visible `:focus-visible` rings and 44 px minimum targets.
- Full keyboard support: digits, `.` or `,`, `+ - * x / ^`, `%`, `Enter` or `=`, `Backspace`, `Escape` for AC (`Delete` is deliberately unbound, so a reflex keystroke cannot wipe a calculation). Shortcuts with Ctrl/⌘/Alt pass through to the browser, and Enter on a focused button activates that button.
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

Tests are layered: the reducer, formatter, keymap and client are unit-tested without React; hooks are tested with `renderHook`; components are tested through the accessibility tree with Testing Library, against a mock API served by [msw](https://mswjs.io). See [testing.md](testing.md).

## Tooling notes

The current Vite template ships oxlint and TypeScript 6. The project uses ESLint 9 instead, because typescript-eslint's type-checked rules, `react-hooks` and `jsx-a11y` catch classes of bugs oxlint does not yet cover, and pins TypeScript to 5.9 because `openapi-typescript` supports 5.x.
