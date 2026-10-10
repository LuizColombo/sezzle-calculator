# Sezzle Calculator — Design Spec

**Date:** 2026-10-10
**Status:** Approved
**Scope:** Phase 1 — per-operation calculator. Phase 2 (expression evaluation with operator precedence) gets its own spec once Phase 1 ships.

## 1. Goal

A full-stack calculator: a React (TypeScript) frontend consuming a Go REST microservice. The assignment asks for correctness, clarity and maintainability over feature count. This design optimises for a reader who will open the repository cold, run it in one command, and judge the code by reading it.

Required operations: add, subtract, multiply, divide.
Optional operations, all included: power, square root, percentage.

## 2. Guiding decisions

These are the decisions that shape everything else. Each one has an ADR in `docs/adr/`.

| # | Decision | Why |
|---|---|---|
| 1 | Decimal arithmetic (`cockroachdb/apd`), not `float64` | Sezzle is a payments company. `0.1 + 0.2` must equal `0.3`. |
| 2 | Numbers travel as JSON **strings** | A JSON number is decoded into a float before our code sees it; the precision loss is baked in. Strings preserve the decimal end to end. |
| 3 | Errors use RFC 9457 Problem Details (`application/problem+json`) | A standard error contract instead of an invented one. |
| 4 | Standard library router (`net/http`, Go 1.22+ patterns), not gorilla/mux | The stdlib now covers method + path routing. Handlers are plain `http.Handler`; swapping in gorilla/mux is a one-line change. |
| 5 | Layered, idiomatic Go — **not** hexagonal/clean architecture | Ports, adapters and use-case interfaces with a single implementation add indirection without testability gains at this size. |
| 6 | CSS Modules + design tokens, not Tailwind | A small, custom design system reads better as tokens and component stylesheets. JSX stays clean. |
| 7 | Monorepo: `api/` + `web/`, each owning its Dockerfile, compose at the root | Each service is self-contained; the root only orchestrates. |
| 8 | OpenAPI is the source of truth | The frontend's types are generated from `api/openapi.yaml`. CI fails if they drift. |

## 3. Repository layout

```
sezzle-calculator/
├── api/                      Go module (see §4)
├── web/                      React app (see §5)
├── docs/
│   ├── README.md             index
│   ├── api.md                usage guide with curl examples
│   ├── backend.md            layering, decisions, how to run and test
│   ├── frontend.md           state machine, design system, motion, a11y
│   ├── testing.md            test pyramid, coverage, how to run
│   ├── deployment.md         Docker, compose, CI
│   ├── adr/                  architecture decision records
│   ├── ai/                   how AI was used: process, prompts, corrections
│   ├── specs/                this document
│   └── plans/                implementation plan
├── .github/workflows/ci.yml
├── docker-compose.yml
├── Makefile                  convenience targets; never required
├── .editorconfig
├── .gitattributes            `* text=auto eol=lf`
├── .gitignore
├── CLAUDE.md                 project conventions for AI tooling
├── LICENSE                   MIT
└── README.md                 one screen: what, quickstart, API samples, links
```

Documentation is written alongside each task, not at the end. The root README is a one-screen pitch plus quickstart; everything else lives in `docs/`.

## 4. Backend (Go)

### 4.1 Layout

```
api/
├── cmd/api/main.go           config → handler → http.Server → graceful shutdown
├── internal/
│   ├── calc/                 pure domain. No HTTP, no JSON, no logging.
│   │   ├── number.go         Parse(string) (Number, error); limits
│   │   ├── operations.go     Add, Subtract, Multiply, Divide, Power, Sqrt, Percent
│   │   ├── errors.go         sentinel errors
│   │   └── *_test.go         table-driven + fuzz
│   └── httpapi/
│       ├── server.go         NewHandler(deps) http.Handler — mux + middleware chain
│       ├── handlers.go       binary/unary handler factories, operations list
│       ├── problem.go        Problem type, writer, domain error → status mapping
│       ├── middleware.go     requestID, recover, logging (slog), timeout, CORS (dev)
│       ├── docs.go           serves the embedded openapi.yaml and Scalar page
│       └── *_test.go         httptest per route
├── embed.go                  package api: go:embed of openapi.yaml and docs.html
├── openapi.yaml
├── docs.html                 Scalar bootstrap (loads the viewer from a CDN)
├── Dockerfile
├── Makefile
├── .golangci.yml
├── .dockerignore
└── go.mod                    Go 1.23+. Runtime deps: cockroachdb/apd only.
```

### 4.2 Domain (`internal/calc`)

- `Number` wraps `apd.Decimal`. Constructed only via `Parse`.
- `Parse` accepts: optional sign, digits, optional single decimal point, optional exponent (`1e3`). Rejects: empty, whitespace, `NaN`, `Inf`, hex, more than **64 significant digits**, exponent beyond ±1000. Never panics on any input (fuzz-tested).
- Arithmetic runs in a context with **34 digits of precision** (decimal128) and `RoundHalfEven`. Results are rounded to at most **16 decimal places** and trailing zeros are trimmed before formatting.
- Operations are plain functions: `func Add(a, b Number) (Number, error)`. No interfaces.
- Sentinel errors: `ErrInvalidNumber`, `ErrNumberTooLarge`, `ErrDivisionByZero`, `ErrNegativeSqrt`, `ErrInvalidPower` (e.g. `0^-1`, non-integer exponent on a negative base), `ErrResultTooLarge` (overflow/underflow of the context), `ErrInvalidOperation` (defensive catch-all for library conditions).
- `0^0` is defined as `1`. The library returns NaN (with an error) for it, so the domain handles it explicitly. The library also returns `Infinity` without an error for `0^-1` and accepts `NaN`/`Infinity` as input strings; the domain checks the decimal's form after every parse and operation and never lets a non-finite value out.
- `Percent(value, percent)` returns `value * percent / 100`.
- `Power` supports integer and fractional exponents where the result is real.

### 4.3 HTTP API (`internal/httpapi`)

Base path `/api/v1`. All request/response bodies are JSON. Numbers are strings.

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/api/v1/add` | `{"a":"0.1","b":"0.2"}` | `{"result":"0.3"}` |
| POST | `/api/v1/subtract` | `{"a","b"}` | `{"result"}` |
| POST | `/api/v1/multiply` | `{"a","b"}` | `{"result"}` |
| POST | `/api/v1/divide` | `{"a","b"}` | `{"result"}` — `b = 0` → 422 |
| POST | `/api/v1/power` | `{"base","exponent"}` | `{"result"}` |
| POST | `/api/v1/sqrt` | `{"value"}` | `{"result"}` — negative → 422 |
| POST | `/api/v1/percent` | `{"value","percent"}` | `{"result"}` |
| GET | `/api/v1/operations` | — | list of `{name, path, arity, params}` |
| GET | `/healthz` | — | `{"status":"ok","version":"…"}` |
| GET | `/openapi.yaml` | — | the spec |
| GET | `/docs` | — | Scalar API reference (embedded HTML) |

Success responses echo the operation and its inputs: `{"operation":"add","inputs":{"a":"0.1","b":"0.2"},"result":"0.3"}`. This makes the history on the client trivial and the response self-describing.

**Errors** are always `application/problem+json`:

```json
{
  "type": "https://github.com/LuizColombo/sezzle-calculator/blob/main/docs/api.md#division-by-zero",
  "title": "Division by zero",
  "status": 422,
  "detail": "divisor must not be zero",
  "instance": "/api/v1/divide",
  "requestId": "…"
}
```

Status mapping:

| Situation | Status | `type` slug |
|---|---|---|
| Malformed JSON, unknown field, missing field, wrong content type, body > 1 KiB | 400 | `invalid-request` |
| Value is not a valid number | 400 | `invalid-number` |
| Number exceeds limits | 422 | `number-too-large` |
| Division by zero | 422 | `division-by-zero` |
| Square root of a negative | 422 | `negative-square-root` |
| Invalid power (`0^-1`, complex result) | 422 | `invalid-power` |
| Result overflow or underflow | 422 | `result-too-large` |
| Any other arithmetic condition the library reports (defensive; not expected after the checks above) | 422 | `invalid-operation` |
| Route not found / method not allowed | 404 / 405 | `not-found` / `method-not-allowed` |
| Panic / unexpected | 500 | `internal-error` (no internal detail leaks) |

The JSON decoder uses `DisallowUnknownFields` and rejects trailing data.

### 4.4 Handlers

Two factories cover all operations without duplication:

```go
func binary(name string, op func(a, b calc.Number) (calc.Number, error), fields [2]string) http.Handler
func unary(name string, op func(v calc.Number) (calc.Number, error), field string) http.Handler
```

Field names follow the table above (`a/b`, `base/exponent`, `value`, `value/percent`). The same table feeds `GET /operations` and is the basis for the OpenAPI spec, so the three cannot disagree.

### 4.5 Server

- `http.Server` with `ReadHeaderTimeout: 5s`, `ReadTimeout: 10s`, `WriteTimeout: 10s`, `IdleTimeout: 60s`.
- Request bodies limited with `http.MaxBytesReader` (1 KiB).
- Middleware order: recover → requestID → logging → CORS (only when `CORS_ORIGINS` is set) → mux. No per-request timeout middleware: every operation is sub-millisecond and `WriteTimeout` already bounds the response.
- Logging via `log/slog`, JSON handler, one line per request: method, path, status, duration, request id.
- Graceful shutdown on `SIGINT`/`SIGTERM` with a 10 s drain.
- Config from environment with sane defaults: `PORT=8080`, `LOG_LEVEL=info`, `CORS_ORIGINS=` (empty = disabled). No config library.
- Version injected at build via `-ldflags "-X main.version=…"`, shown in `/healthz`.

### 4.6 Tests

- `calc`: table-driven tests per operation covering `0.1+0.2`, negative zero, division by zero, `√-1`, `0^0 = 1`, `0^-1`, huge exponents, `1e400`, `NaN`, `Infinity`, whitespace, leading `+`, multiple dots, 65-digit inputs. `FuzzParse` asserts no panic and that a successful parse round-trips through `String()`.
- `httpapi`: `httptest` per route — happy path, malformed JSON, missing field, unknown field, wrong method, oversized body, wrong content type. Assert status, `Content-Type`, and body.
- Targets: ≥ 90 % in `calc`, ≥ 80 % in `httpapi`. `make cover` writes `coverage.html`.
- Lint: `golangci-lint` with `errcheck`, `govet`, `staticcheck`, `revive`, `gosec`, `gofumpt`.

## 5. Frontend (React + TypeScript)

### 5.1 Layout

```
web/
├── src/
│   ├── features/calculator/
│   │   ├── model/
│   │   │   ├── reducer.ts        pure state machine; no React, no fetch
│   │   │   ├── format.ts         display formatting (Intl.NumberFormat, digit limits)
│   │   │   └── keymap.ts         physical key → event
│   │   ├── api/
│   │   │   ├── client.ts         fetch + retry/backoff + AbortController + problem+json
│   │   │   └── schema.gen.ts     generated from api/openapi.yaml; never edited
│   │   ├── hooks/
│   │   │   ├── useCalculator.ts  reducer + effect that performs pending API calls
│   │   │   ├── useHistory.ts     localStorage-backed history
│   │   │   └── useKeyboard.ts
│   │   └── ui/
│   │       Calculator.tsx, Display.tsx, Keypad.tsx, Key.tsx,
│   │       HistoryPanel.tsx, StatusBanner.tsx (+ .module.css each)
│   ├── styles/
│   │   ├── tokens.css            colours, radii, spacing (4 pt), type scale, motion
│   │   ├── reset.css
│   │   └── global.css
│   ├── test/                     setup, msw handlers
│   └── main.tsx
├── e2e/                          Playwright
├── Dockerfile
├── nginx.conf
├── .dockerignore
├── vite.config.ts                dev proxy: /api → http://localhost:8080
├── vitest.config.ts
├── playwright.config.ts
├── eslint.config.js
└── package.json
```

Runtime dependencies: `react`, `react-dom`, `motion`. Nothing else. Dev: `vite`, `typescript`, `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `msw`, `@playwright/test`, `openapi-typescript`, `eslint` (+ `typescript-eslint`, `react-hooks`, `jsx-a11y`), `prettier`.

### 5.2 State machine (`reducer.ts`)

States: `idle | enteringFirst | operatorChosen | enteringSecond | awaitingResult | result | error`.

Events: `digit(d)`, `decimal`, `operator(op)`, `equals`, `allClear`, `backspace`, `toggleSign`, `unary(sqrt | percent)`, `recall(entry)`, `resultReceived(response)`, `apiFailed(problem)`.

State shape:

```ts
{
  phase: Phase;
  display: string;            // what the user sees, raw digits
  expression: string | null;  // "2 + 3" line above the display
  firstOperand: string | null;
  operator: Operator | null;
  pending: PendingCall | null; // set by the reducer, consumed by the hook
  error: Problem | null;
}
```

Rules worth stating:
- `2 + 3 +` evaluates `2 + 3` before accepting the second operator (chaining).
- `=` with no second operand is a no-op.
- `%` follows calculator convention: after `a +`/`a −` it yields `a × x / 100` (x percent of a); otherwise it yields `x / 100`. Both go through the API's `percent` endpoint. `√` always applies to the displayed value. A unary result replaces the display; the next digit starts a fresh number.
- After `result`, typing a digit starts fresh; typing an operator uses the result as first operand.
- `backspace` on a single digit shows `0`. Second `.` is ignored. Leading zeros collapse.
- Display input is capped at 16 significant digits; further digits are ignored.
- `allClear` resets everything except history.
- The reducer never performs I/O. It sets `pending`; `useCalculator` runs the call and dispatches `resultReceived` or `apiFailed`.

### 5.3 API client (`client.ts`)

- One function per operation, typed from `schema.gen.ts`.
- Retries only on network errors and 502/503/504: max 3 attempts, base delay 300 ms, exponential with full jitter, capped at 2 s. 4xx is never retried.
- A new call aborts the previous one via `AbortController`.
- Non-2xx responses parse `application/problem+json` into a typed `Problem`.

### 5.4 Design system

- **Palette:** neutral graphite scale plus one accent, Sezzle purple (`#8A2BE2` family). Operators use the accent; everything else is monochrome.
- **Typography:** `system-ui` stack (renders as SF on macOS/iOS), `font-variant-numeric: tabular-nums`. Display scales down as the number grows (3 steps).
- **Spacing:** 4 pt grid. Key radius large (pill on mobile, rounded-square on desktop).
- **Themes:** light and dark via `prefers-color-scheme`. No toggle.
- **Motion tokens:** durations (`--motion-fast: 120ms`, `--motion-base: 220ms`), spring presets for `motion`. All honour `prefers-reduced-motion: reduce` (animations collapse to instant).

### 5.5 Motion (via `motion`)

| Interaction | Animation |
|---|---|
| Key press | scale to 0.94 + brief highlight flash |
| Operator selected | key inverts (accent fill → outline) and stays until next operand |
| `=` | expression shrinks into the small line above; result slides up (layout animation) |
| AC | current digits fade + blur out |
| Pending API call | display opacity pulse; no spinner |
| History panel | side panel on desktop (slide from right), bottom sheet on mobile (spring) |
| Error | display shakes once (reduced-motion: none), text turns to error colour |

### 5.6 History

- Stored in `localStorage` under a versioned key, last 50 entries: `{ expression, result, at }`.
- Clicking an entry recalls its result as the current operand.
- "Clear history" uses an inline two-step confirm, not `window.confirm`.

### 5.7 Error and offline behaviour

- 4xx from the API (e.g. division by zero): display shows `Error`, the problem `detail` appears in the expression line. Any key continues.
- Network failure after retries: `StatusBanner` shows "Can't reach the calculation service" with a retry button. Typing still works; the next `=` retries.

### 5.8 Accessibility and input

- Real `<button>` elements with `aria-label` (`"multiply"`, not `"×"`).
- Display is `role="status" aria-live="polite"`.
- Visible `:focus-visible` ring; minimum 44 × 44 px targets.
- Full physical keyboard: digits, `.`, `+ - * /`, `Enter`/`=`, `Escape` (AC), `Backspace`, `%`, `^`.

### 5.9 Responsive

Mobile-first. Below 480 px the calculator fills the viewport width; history is a bottom sheet. Above, a centred card with history as a side panel.

### 5.10 Tests

- `reducer.test.ts`: key sequences as data; this is the heaviest suite.
- `format.test.ts`, `keymap.test.ts`.
- `client.test.ts`: backoff with fake timers, abort behaviour, problem parsing.
- Component tests (RTL + msw): `1 + 2 =` renders `3`; `÷ 0` renders `Error`; history recall.
- E2E (Playwright): happy path and division-by-zero against the Docker compose stack.
- Coverage via `vitest --coverage` (v8). Target ≥ 85 % on `model/` and `api/`.

## 6. Delivery: Docker, compose, CI

### 6.1 Images

- `api/Dockerfile`: `golang:1.23-alpine` build stage (`CGO_ENABLED=0`, `-ldflags "-s -w -X main.version=…"`, BuildKit cache mounts for modules) → `gcr.io/distroless/static-debian12:nonroot`. Roughly 10 MB.
- `web/Dockerfile`: `node:22-alpine` build stage (`npm ci` with cache mount, `vite build`) → `nginx:1.27-alpine` serving `dist/`. nginx proxies `/api/` to `http://api:8080`, gzips, long-caches hashed assets, never caches `index.html`.
- Base images pinned to a minor version. `.dockerignore` in both services.

### 6.2 Compose

```yaml
services:
  api:
    build: ./api
    init: true
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "/api", "-healthcheck"]   # distroless has no wget/curl; the binary probes itself
      interval: 5s
      retries: 5
    # no ports: reachable only through web
  web:
    build: ./web
    init: true
    restart: unless-stopped
    depends_on:
      api: { condition: service_healthy }
    ports:
      - "${WEB_PORT:-8080}:80"
```

- `docker compose up` is the only command an evaluator needs. Builds happen before any container is replaced, so a failed build never takes a running stack down.
- No `.env` required; `.env.example` documents `WEB_PORT`.
- Single origin in Docker: no CORS.
- The API binary accepts a `-healthcheck` flag that GETs `/healthz` on itself and exits 0/1, so the health probe works inside a distroless image.

### 6.3 CI (GitHub Actions)

Jobs:
1. `api`: `go vet`, `golangci-lint`, `go test -race -coverprofile`, `go test -fuzz=FuzzParse -fuzztime=10s`, upload coverage HTML as artefact.
2. `web`: `npm ci`, `eslint`, `prettier --check`, `tsc --noEmit`, `vitest --coverage`, regenerate `schema.gen.ts` and fail on diff.
3. `docker`: build both images.
4. `e2e` (needs 1–3): `docker compose up -d --wait`, Playwright, `docker compose down`.

Status badge in the README. Coverage numbers are quoted in `docs/testing.md` and the HTML reports are CI artefacts; no third-party coverage service.

### 6.4 Makefile (root)

`dev` (api + web natively, in parallel), `test`, `cover`, `lint`, `gen` (OpenAPI → TS), `up` (compose). Convenience only; the README never depends on `make`.

## 7. Documentation deliverables

- `README.md`: what it is, screenshot/GIF, quickstart (`docker compose up`, then `make dev` alternative), three curl examples, link to `/docs`, decision table linking ADRs, link to `docs/`.
- `docs/adr/`: `0001-stdlib-router`, `0002-decimal-arithmetic`, `0003-numbers-as-json-strings`, `0004-problem-details-errors`, `0005-layered-not-clean-architecture`, `0006-css-modules-over-tailwind`, `0007-monorepo-layout`. Format: Context / Decision / Consequences.
- `docs/ai/README.md`: how AI was used (brainstorm → spec → plan → TDD implementation → independent agent review at four checkpoints), tools and models per phase.
- `docs/ai/prompts.md`: curated key prompts with outcomes.
- `docs/ai/corrections.md`: where AI suggestions were rejected or scaled down, and why.
- `CLAUDE.md`: project conventions.

## 8. Git conventions

- Conventional Commits, English, subject ≤ 50 chars, body only when the why is not obvious.
- One commit per logical change that compiles and passes tests. Test and implementation land together.
- Everything on `main`; no feature branches for a solo project.
- No AI attribution trailers.

## 9. Out of scope (Phase 1)

- Expression evaluation / operator precedence (Phase 2).
- Server-side history or persistence.
- Authentication, rate limiting, metrics endpoint. Mentioned in `docs/backend.md` as natural next steps.
- Theme toggle, i18n.

## 10. Revisions after review

Changes made after the independent review of the backend (checkpoint 1). The code and `docs/` describe the current behaviour; this section records what moved and why.

- **Input limit 64 → 34 significant digits.** Accepting 64 digits while computing at 34 rounded `+ − ×` silently. The limit now equals the working precision, so inputs are exact and only results round.
- **Tiny results.** A non-zero result that 16-place rounding would turn into `0` is returned in exponent notation with 16 significant digits (`1E-17`).
- **Percent** divides before multiplying, so `100 % of 1e1000` no longer overflows.
- **Duplicate JSON keys** are rejected with `400 invalid-request` instead of last-one-wins.
- **Panics** after a response started no longer append a 500 body; `http.ErrAbortHandler` propagates; net/http's own errors go to the JSON log.

