# Backend

A Go service with one runtime dependency, [`cockroachdb/apd`](https://github.com/cockroachdb/apd) for decimal arithmetic. Everything else is the standard library: `net/http` routing, `log/slog`, `embed`.

## Layout

```
api/
├── cmd/api/              entrypoint: config, listener, graceful shutdown, -healthcheck
├── internal/
│   ├── calc/             domain: Number, Parse, operations, sentinel errors
│   └── httpapi/          transport: routes, request decoding, problem+json, middleware
├── embed.go              embeds openapi.yaml and docs.html into the binary
├── openapi.yaml          the API contract (source of the frontend's types)
├── docs.html             Scalar API reference page served at /docs
└── Dockerfile            multi-stage build → distroless, non-root
```

`calc` imports nothing from HTTP, JSON or logging; `httpapi` depends on `calc`, never the reverse ([ADR 0005](adr/0005-layered-not-clean-architecture.md)).

## Request lifecycle

Middleware runs outermost first:

1. **recoverPanics** — turns a panic into a `500 internal-error` problem and logs it with the request id.
2. **requestID** — reuses a safe client `X-Request-ID` or generates a 64-bit random one; echoes it in the response and stores it in the context.
3. **logRequests** — one JSON line per request: method, path, status, duration, request id.
4. **cors** — only when `CORS_ORIGINS` is set (local development with Vite). In Docker the browser talks to nginx on the same origin, so CORS is off.
5. **mux** — `net/http.ServeMux` with method patterns. A `route` helper also registers a fallback per path so a wrong method gets a problem+json `405` with `Allow`; anything unmatched gets a `404` problem.

Each operation handler then:

1. decodes the body: `application/json` only, at most 1 KiB, exactly the expected fields, every value a JSON string, nothing after the object;
2. parses each value with `calc.Parse`;
3. calls the operation;
4. writes `{"operation", "inputs", "result"}` or the mapped problem.

Seven operations share one handler. The `operations` table in `internal/httpapi/operations.go` lists name, parameters and the `calc` function; it drives the routes and `GET /api/v1/operations`, and a test checks that `openapi.yaml` documents every entry.

## Domain rules

- **Grammar.** `^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d{1,4})?$`. The decimal library would also accept `NaN`, `Infinity` and other spellings; the grammar rejects them first.
- **Limits.** 64 significant digits per input, counted without trailing zeros (so `1e70` is one digit); magnitude within 10^±1000 for inputs and results.
- **Precision.** 34 digits, round half to even, for every operation. `String()` rounds to 16 decimal places, trims trailing zeros and never prints `-0`.
- **Special cases.** `0 ^ 0 = 1`. `0 ^ negative` and `negative ^ fractional` are `ErrInvalidPower`. Division by any zero is `ErrDivisionByZero`. A finiteness check after every operation guarantees that no `NaN` or `Infinity` leaves the package.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Listen port (1–65535). |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`. |
| `CORS_ORIGINS` | *(empty)* | Comma-separated allowed origins. Empty disables CORS. |

The version shown by `/healthz` is set at build time: `-ldflags "-X main.version=…"`.

## Server

`http.Server` timeouts: read header 5 s, read 10 s, write 10 s, idle 60 s. On `SIGINT` or `SIGTERM` the server stops accepting connections and drains in-flight requests for up to 10 s.

`/api -healthcheck` requests `/healthz` on the local port and exits 0 or 1. Distroless images have no shell, curl or wget, so the binary is its own probe.

## Running and testing

```bash
cd api
go run ./cmd/api                     # http://localhost:8080, docs at /docs
make test                            # go test -race ./...
make cover                           # coverage.html + total
make fuzz                            # FuzzParse for 20 s
make lint                            # golangci-lint (config in .golangci.yml)
npx @redocly/cli lint openapi.yaml   # validate the contract
```

Requires Go 1.27 (the toolchain is downloaded automatically by `go` if missing).

## Next steps (intentionally out of scope)

- **Rate limiting** per client IP, e.g. a token bucket in middleware.
- **Metrics** — request counts and latency histograms on a `/metrics` endpoint.
- **Authentication** — the API is public; an API key or OAuth2 would sit in middleware.
- **Server-side history** — would introduce the first interface (a store) and a persistence adapter.
