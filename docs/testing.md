# Testing

Every layer is tested at the level where its bugs live. Most tests are fast unit tests of pure code; fewer, slower tests check the pieces together; two end-to-end flows check the real stack.

```
            e2e (Playwright, real nginx + Go)          4 scenarios × desktop & mobile
        components (Testing Library + msw)            Calculator, Display, Keypad, History
      hooks (renderHook + msw)                        useCalculator, useHistory, useKeyboard
   HTTP (httptest, every route and error)             internal/httpapi, cmd/api
 domain + model (pure functions, table-driven, fuzz) internal/calc, reducer, format, client
```

## Backend

```bash
cd api
go test -race ./...                                   # everything, with the race detector
go test -cover ./...                                  # coverage per package
make cover                                            # coverage.html
go test -run='^$' -fuzz=FuzzParse -fuzztime=30s ./internal/calc
```

| Package | What is tested | Coverage |
|---|---|---|
| `internal/calc` | Parsing grammar and limits, rounding, every operation's edge cases (`0.1 + 0.2`, division by zero, `0^0`, negative bases, overflow, underflow, tiny results), the 34-digit precision boundary | 91.5 % |
| `internal/httpapi` | Every route through `httptest`: success bodies, each problem type, malformed / oversized / duplicate-key / non-string bodies, content type, 404, 405 with `Allow`, request ids, CORS preflight, panic recovery, request logs, OpenAPI and docs serving | 99.3 % |
| `cmd/api` | Configuration parsing, server start and graceful shutdown on a random port, the `-healthcheck` probe | 56.5 % |

`cmd/api` is lower because `main()` itself (flag parsing, `os.Exit`, signal wiring) is exercised by running the binary and the Docker health check rather than by unit tests; the logic it calls (`loadConfig`, `serve`, `probe`) is tested directly. The uncovered lines in `calc` are defensive panics on conditions the code sizes away.

**Fuzzing.** `FuzzParse` feeds arbitrary strings to `Parse` and checks three properties: no panic; anything that parses formats to a string that parses back and formats identically; and when formatting did not round, the value survives unchanged. It found two real bugs during development, both kept as regression tests:

- `1e70` parsed, but its plain rendering (1 followed by 70 zeros) was rejected as having 71 significant digits — trailing zeros are now not counted.
- `9.7E-16` crashed the tiny-result formatting because rounding carried into a new digit beyond the context's precision.

## Frontend

```bash
cd web
npm test               # Vitest, jsdom
npm run test:coverage  # coverage/index.html
npm run e2e            # Playwright against docker compose (start it first)
```

| Area | What is tested |
|---|---|
| `model/reducer` | Key sequences as data: typing, the digit cap, decimal and sign rules, chaining, `=` with nothing to do, results reused as operands, percent conventions, √ on either operand, API errors, network failures restoring operands, recall, AC while a request is in flight |
| `model/format` | Grouping, preserving what is being typed, half-even rounding, carries, scientific notation for 1001-digit results and for the API's exponent form, all without `Number()` |
| `api/client` | Request shape, the signal reaching `fetch`, 4xx and 500 not retried, network errors and 502/503/504 retried with exponential delays, full jitter and the cap, abort during a request and during a backoff wait, invalid success bodies |
| `hooks` | A calculation round-trip through a mock API, chain results kept out of history, history persistence, limits, corrupt or tampered storage, storage that throws, keyboard mapping, modifiers, focused buttons and editable fields |
| `ui` | Components through the accessibility tree: names, `aria-pressed`, live region, errors, the history panel's confirm-to-clear, Escape handling, and full user flows with the keyboard and the mouse |
| `e2e` | `0.1 + 0.2 = 0.3` through nginx and Go, division by zero, chaining with history surviving a reload, the physical keyboard — on a desktop and a phone viewport |

Coverage across `src/features`: 95 % of statements and 91 % of branches.

Component and hook tests talk to [msw](https://mswjs.io), which intercepts `fetch` with a float-based stand-in for the API. The stand-in is deliberately simple: the Go tests own arithmetic, the frontend tests own wiring and rendering. msw is configured to fail any test that makes a request it does not handle.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

| Job | Steps |
|---|---|
| API | `go vet`, golangci-lint, `go test -race` with coverage (summary on the run page, HTML as an artifact), 20 s of fuzzing |
| Web | ESLint, Prettier, `tsc`, OpenAPI lint, a check that `schema.gen.ts` matches the contract, Vitest with coverage |
| Docker · e2e | Builds both images, starts the stack with health checks, runs Playwright, uploads the report |
