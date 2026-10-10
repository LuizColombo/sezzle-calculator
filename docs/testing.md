# Testing

Every layer is tested at the level where its bugs live. Most tests are fast unit tests of pure code; fewer, slower tests check the pieces together; six end-to-end scenarios check the real stack.

```
            e2e (Playwright, real nginx + Go)          6 scenarios × desktop & phone
        components (Testing Library + msw)            Calculator, Display, Keypad, History, ThemeToggle
      hooks (renderHook + msw)                        useCalculator, useHistory, useKeyboard, useTheme
   HTTP (httptest, every route and error)             internal/httpapi, cmd/api
 domain + model (pure, table-driven, two fuzzers)    internal/calc, internal/expr, expression, format, client, tokens
```

## Backend

```bash
cd api
go test -race ./...                                   # everything, with the race detector
go test -cover ./...                                  # coverage per package
make cover                                            # coverage.html
go test -run='^$' -fuzz=FuzzParse -fuzztime=20s ./internal/calc   # numbers
go test -run='^$' -fuzz=FuzzParse -fuzztime=20s ./internal/expr   # expressions
```

| Package | What is tested | Coverage |
|---|---|---|
| `internal/calc` | Parsing grammar and limits, rounding, every operation's edge cases (`0.1 + 0.2`, division by zero, `0^0`, negative bases, overflow, underflow, tiny results), the 34-digit precision boundary | 91.5 % |
| `internal/expr` | Lexer (every operator spelling, columns in code points, limits), parser structure as S-expressions (precedence, associativity, unary minus vs `^`, `√` and `%`, percent-of), canonical form, every syntax error with its column, nesting depth, evaluation through `calc` and error propagation | 96.4 % |
| `internal/httpapi` | Every route through `httptest`: success bodies, each problem type, `position` on expression and number errors, malformed / oversized / duplicate-key / non-string bodies, content type, 404, 405 with `Allow`, request ids, CORS preflight, panic recovery, request logs, OpenAPI and docs serving | 99.4 % |
| `cmd/api` | Configuration parsing, server start and graceful shutdown on a random port, the `-healthcheck` probe | 56.5 % |

`cmd/api` is lower because `main()` itself (flag parsing, `os.Exit`, signal wiring) is exercised by running the binary and the Docker health check rather than by unit tests; the logic it calls (`loadConfig`, `serve`, `probe`) is tested directly. The uncovered lines in `calc` are defensive panics on conditions the code sizes away.

**Fuzzing.** Two fuzzers, both run in CI:

- `calc.FuzzParse` feeds arbitrary strings to the number parser: no panic; anything that parses formats to a string that parses back and formats identically; when formatting did not round, the value survives unchanged.
- `expr.FuzzParse` feeds arbitrary strings to the expression parser and evaluator: no panic, and the canonical form the API echoes always parses back to itself.

They found three real bugs during development, all kept as regression tests:

- `1e70` parsed, but its plain rendering (1 followed by 70 zeros) was rejected as having 71 significant digits — trailing zeros are now not counted.
- `9.7E-16` crashed the tiny-result formatting because rounding carried into a new digit beyond the context's precision.
- The canonical form of `1E700` (701 digits) and of long expressions (extra spaces) exceeded the length limit, so the API's own echo could be rejected — numbers are now printed as typed and the limit ignores spaces.

## Frontend

```bash
cd web
npm test               # Vitest, jsdom
npm run test:coverage  # coverage/index.html
npm run e2e            # Playwright against docker compose (start it first)
```

| Area | What is tested |
|---|---|
| `model/expression` | Key scripts as data: every input guard (operator replacement, `−` as a sign, `)` only when open, implicit `×` before `(` and `√`, `%` only after a number), the digit cap, `=` closing parentheses and ignoring unfinished input, sealed results and recalled values, error and network-failure states, the column ranges used to underline errors |
| `model/format` | Grouping, preserving what is being typed, half-even rounding, carries, scientific notation for 1001-digit results and for the API's exponent form, all without `Number()` |
| `api/client` | Request shape, the signal reaching `fetch`, 4xx and 500 not retried, network errors and 502/503/504 retried with exponential delays, full jitter and the cap, abort during a request and during a backoff wait, invalid success bodies |
| `hooks` | Evaluation with precedence through a mock API and the canonical expression recorded in history; the live preview (debounced, aborted on edit, never for a lone number); syntax errors with their position; retry after a network failure; history persistence, limits and tampered storage; keyboard mapping, modifiers, focused buttons and editable fields; theme choice and system tracking |
| `styles` | WCAG 2.2 contrast of every text/background token pair, in both themes, read from `tokens.css` |
| `ui` | Components through the accessibility tree: names, live region, the error underline, the history panel's confirm-to-clear, Escape handling, focus return, the theme toggle, and full user flows with the keyboard and the mouse |
| `e2e` | `0.1 + 0.2 = 0.3` through nginx and Go, precedence and parentheses (checking the result is actually visible, not just present), the live preview, division by zero, history surviving a reload, the physical keyboard — on a desktop and a phone viewport |

Coverage across `src/features`: 95 % of statements and 90 % of branches.

Component and hook tests talk to [msw](https://mswjs.io), which intercepts `fetch` and answers `/evaluate` from a small table of known expressions. The stand-in is deliberately simple: the Go tests own parsing, precedence and arithmetic; the frontend tests own wiring and rendering. msw is configured to fail any test that makes a request it does not handle.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

| Job | Steps |
|---|---|
| API | golangci-lint (including govet), `go test -race` with coverage (summary on the run page, HTML as an artifact), 20 s of fuzzing for each fuzzer |
| Web | ESLint, Prettier, `tsc`, OpenAPI lint, a check that `schema.gen.ts` matches the contract, Vitest with coverage |
| Docker · e2e | Builds both images, starts the stack with health checks, runs Playwright, uploads the report |
