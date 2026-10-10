# Sezzle Calculator — Phase 1 Implementation Plan

> **For agentic workers:** Execute this plan task by task in the current session (superpowers:executing-plans). Steps use checkbox (`- [ ]`) syntax for tracking. An independent reviewer agent runs at the four checkpoints marked below; do not skip them.

**Goal:** Ship the Phase 1 calculator described in `docs/specs/2026-10-10-calculator-design.md`: a Go REST API with decimal arithmetic and a React/TypeScript frontend, runnable with `docker compose up`, with tests, CI and documentation.

**Architecture:** Two services in one repository. `api/` is a Go module with a pure domain package (`internal/calc`) and a thin HTTP layer (`internal/httpapi`). `web/` is a Vite + React app whose calculator logic lives in a pure reducer; a hook performs the API calls the reducer asks for. nginx serves the built frontend and proxies `/api` to Go, so Docker runs with a single origin.

**Tech Stack:** Go 1.27 (stdlib `net/http`, `log/slog`), `github.com/cockroachdb/apd/v3`; React 19.3, TypeScript 5.x strict, Vite 8, `motion` 14, Vitest 5, Testing Library, msw 3, Playwright 1.64, openapi-typescript 7; Docker Compose, GitHub Actions.

**Conventions for every task:**
- Everything in English: code, comments, commits, docs.
- TDD: write the failing test, run it, implement, run it green, commit. Test and implementation in the same commit.
- Commit author must be `Luiz Colombo <colombo74744@hotmail.com>` (already configured locally). No AI attribution trailers.
- Run commands from the directory shown. `api/` commands assume `cd api`; `web/` commands assume `cd web`.
- The local Go toolchain is 1.22 with `GOTOOLCHAIN=auto`; the first `go` command after `go.mod` says `go 1.27` downloads the 1.27 toolchain. That is expected.

---

## File map

| Path | Responsibility |
|---|---|
| `.gitignore`, `.gitattributes`, `.editorconfig`, `LICENSE`, `CLAUDE.md` | repo hygiene |
| `api/go.mod`, `api/go.sum` | module `github.com/LuizColombo/sezzle-calculator/api` |
| `api/internal/calc/errors.go` | sentinel errors |
| `api/internal/calc/number.go` | `Number`, `Parse`, `String`, decimal context, limits |
| `api/internal/calc/operations.go` | `Add` … `Percent` |
| `api/internal/calc/*_test.go` | table-driven + fuzz tests |
| `api/internal/httpapi/problem.go` | RFC 9457 writer + error mapping |
| `api/internal/httpapi/request.go` | JSON body decoding with limits |
| `api/internal/httpapi/operations.go` | operation registry + binary/unary handlers |
| `api/internal/httpapi/middleware.go` | recover, request id, logging, CORS |
| `api/internal/httpapi/server.go` | `NewHandler`: mux, health, docs, 404/405 |
| `api/internal/httpapi/*_test.go` | httptest per route |
| `api/embed.go`, `api/openapi.yaml`, `api/docs.html` | embedded API spec + Scalar page |
| `api/cmd/api/config.go`, `api/cmd/api/main.go` | env config, server lifecycle, `-healthcheck` |
| `api/Dockerfile`, `api/.dockerignore`, `api/Makefile`, `api/.golangci.yml` | build & tooling |
| `web/src/features/calculator/model/{reducer,format,keymap}.ts` | pure logic |
| `web/src/features/calculator/api/{client.ts,schema.gen.ts}` | HTTP client, generated types |
| `web/src/features/calculator/hooks/{useCalculator,useHistory,useKeyboard}.ts` | React glue |
| `web/src/features/calculator/ui/*` | components + CSS modules |
| `web/src/styles/{tokens,reset,global}.css` | design system |
| `web/src/test/*` | Vitest setup, msw handlers |
| `web/e2e/*` | Playwright |
| `web/Dockerfile`, `web/nginx.conf`, `web/.dockerignore` | delivery |
| `docker-compose.yml`, `.env.example`, `Makefile` | orchestration |
| `.github/workflows/ci.yml` | CI |
| `README.md`, `docs/**` | documentation |

---

## Part A — Repository scaffold

### Task 1: Root hygiene files

**Files:**
- Create: `.gitignore`, `.gitattributes`, `.editorconfig`, `LICENSE`, `CLAUDE.md`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
# Go
api/api
api/coverage.out
api/coverage.html
api/testdata/fuzz/**/[0-9a-f]*

# Node
web/node_modules/
web/dist/
web/coverage/
web/test-results/
web/playwright-report/
web/blob-report/

# Env & editors
.env
.DS_Store
.idea/
.vscode/
```

- [ ] **Step 2: Create `.gitattributes`**

```gitattributes
* text=auto eol=lf
*.png binary
*.gif binary
*.ico binary
```

- [ ] **Step 3: Create `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.go]
indent_style = tab

[Makefile]
indent_style = tab

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 4: Create `LICENSE`** — MIT, copyright `2026 Luiz Colombo`. Use the standard MIT text verbatim.

- [ ] **Step 5: Create `CLAUDE.md`**

```markdown
# Sezzle Calculator — conventions for AI tooling

- Language: English everywhere (code, comments, commits, docs).
- Design: `docs/specs/`. Plan: `docs/plans/`. Decisions: `docs/adr/`. Read the spec before changing behaviour.
- Backend (`api/`): Go, stdlib `net/http`, `log/slog`, `cockroachdb/apd` for decimals. Domain in `internal/calc` never imports HTTP or JSON. Handlers in `internal/httpapi` are thin.
- Frontend (`web/`): React 19 + TypeScript strict + Vite. Calculator logic lives in `src/features/calculator/model/reducer.ts` (pure). Components only render. Styling: CSS Modules + tokens in `src/styles/tokens.css`. Animations: `motion`.
- Numbers cross the API as JSON strings. Errors are `application/problem+json`.
- Tests first. `cd api && go test ./...` and `cd web && npm test` must pass before every commit.
- Commits: Conventional Commits, subject ≤ 50 chars, one logical change per commit, no attribution trailers.
- Run everything: `docker compose up`. Dev: `make dev`.
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore .gitattributes .editorconfig LICENSE CLAUDE.md
git commit -m "chore: add repository scaffolding"
```

---

## Part B — Go domain (`api/internal/calc`)

### Task 2: Go module, tooling, sentinel errors

**Files:**
- Create: `api/go.mod`, `api/Makefile`, `api/.golangci.yml`, `api/internal/calc/errors.go`

- [ ] **Step 1: Initialise the module**

```bash
cd api
go mod init github.com/LuizColombo/sezzle-calculator/api
go get github.com/cockroachdb/apd/v3@v3.2.3
```

Then edit `go.mod` so the `go` directive reads `go 1.27`. Run `go mod tidy`. Expected: `go.sum` lists `cockroachdb/apd/v3 v3.2.3`.

- [ ] **Step 2: Create `api/Makefile`**

```makefile
.PHONY: run test cover lint fuzz build

run:
	go run ./cmd/api

test:
	go test -race ./...

cover:
	go test -coverprofile=coverage.out ./... && go tool cover -html=coverage.out -o coverage.html
	go tool cover -func=coverage.out | tail -1

lint:
	golangci-lint run

fuzz:
	go test -run='^$$' -fuzz=FuzzParse -fuzztime=20s ./internal/calc

build:
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o api ./cmd/api
```

- [ ] **Step 3: Create `api/.golangci.yml`** (golangci-lint v2 format)

```yaml
version: "2"
linters:
  default: none
  enable:
    - errcheck
    - govet
    - staticcheck
    - revive
    - gosec
    - ineffassign
    - unused
    - misspell
    - bodyclose
formatters:
  enable:
    - gofumpt
    - goimports
```

Install the linter locally: `go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.14.0`.

- [ ] **Step 4: Create `api/internal/calc/errors.go`**

```go
// Package calc implements arbitrary-precision decimal calculator operations.
// It has no dependency on HTTP, JSON or logging.
package calc

import "errors"

// Sentinel errors. Callers match them with errors.Is.
var (
	ErrInvalidNumber    = errors.New("invalid number")
	ErrNumberTooLarge   = errors.New("number too large")
	ErrDivisionByZero   = errors.New("division by zero")
	ErrNegativeSqrt     = errors.New("square root of a negative number")
	ErrInvalidPower     = errors.New("invalid power")
	ErrResultTooLarge   = errors.New("result out of range")
	ErrInvalidOperation = errors.New("invalid operation")
)
```

- [ ] **Step 5: Verify it compiles and commit**

```bash
go build ./... && git add go.mod go.sum Makefile .golangci.yml internal/calc/errors.go
git commit -m "chore(api): init go module and tooling"
```

### Task 3: `Number`: parsing, limits, formatting

**Files:**
- Create: `api/internal/calc/number.go`, `api/internal/calc/number_test.go`

- [ ] **Step 1: Write the failing tests**

```go
package calc

import (
	"errors"
	"strings"
	"testing"
)

func TestParseValid(t *testing.T) {
	cases := []struct{ in, want string }{
		{"0", "0"},
		{"-0", "0"},
		{"42", "42"},
		{"+42", "42"},
		{"0.1", "0.1"},
		{".5", "0.5"},
		{"1.", "1"},
		{"1.50", "1.5"},
		{"-3.25", "-3.25"},
		{"1e3", "1000"},
		{"1E-3", "0.001"},
		{"1234567890123456789012345678901234567890", "1234567890123456789012345678901234567890"},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			n, err := Parse(c.in)
			if err != nil {
				t.Fatalf("Parse(%q) error: %v", c.in, err)
			}
			if got := n.String(); got != c.want {
				t.Fatalf("Parse(%q).String() = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestParseInvalid(t *testing.T) {
	cases := []struct {
		in   string
		want error
	}{
		{"", ErrInvalidNumber},
		{" 1", ErrInvalidNumber},
		{"1 ", ErrInvalidNumber},
		{"abc", ErrInvalidNumber},
		{"1..2", ErrInvalidNumber},
		{"1,5", ErrInvalidNumber},
		{"1_000", ErrInvalidNumber},
		{"0x10", ErrInvalidNumber},
		{"NaN", ErrInvalidNumber},
		{"Inf", ErrInvalidNumber},
		{"-Infinity", ErrInvalidNumber},
		{"1e", ErrInvalidNumber},
		{"e5", ErrInvalidNumber},
		{"--1", ErrInvalidNumber},
		{"١", ErrInvalidNumber},
		{strings.Repeat("9", 65), ErrNumberTooLarge},
		{"1e1001", ErrNumberTooLarge},
		{"1e-1001", ErrNumberTooLarge},
		{"1e99999", ErrNumberTooLarge},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			_, err := Parse(c.in)
			if !errors.Is(err, c.want) {
				t.Fatalf("Parse(%q) error = %v, want %v", c.in, err, c.want)
			}
		})
	}
}

func TestParseAcceptsExactly64Digits(t *testing.T) {
	if _, err := Parse(strings.Repeat("9", 64)); err != nil {
		t.Fatalf("64 digits should be accepted: %v", err)
	}
}

func TestStringRoundsTo16DecimalPlaces(t *testing.T) {
	n, err := Parse("0.12345678901234567890")
	if err != nil {
		t.Fatal(err)
	}
	if got, want := n.String(), "0.1234567890123457"; got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestIsZero(t *testing.T) {
	for _, s := range []string{"0", "0.0", "-0", "0e5"} {
		n, _ := Parse(s)
		if !n.IsZero() {
			t.Errorf("%q should be zero", s)
		}
	}
	n, _ := Parse("0.0001")
	if n.IsZero() {
		t.Error("0.0001 should not be zero")
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `go test ./internal/calc/`
Expected: compile error, `undefined: Parse`.

- [ ] **Step 3: Implement `number.go`**

```go
package calc

import (
	"fmt"
	"regexp"

	"github.com/cockroachdb/apd/v3"
)

const (
	// MaxInputDigits is the maximum number of significant digits accepted in input.
	MaxInputDigits = 64
	// MaxExponent bounds the magnitude of inputs and results (10^±1000).
	MaxExponent = 1000
	// precision is the working precision of every operation (IEEE decimal128).
	precision = 34
	// maxScale is the number of decimal places kept when formatting a result.
	maxScale = 16
)

// numberPattern accepts an optional sign, digits with an optional single
// decimal point, and an optional exponent of up to four digits. It rejects
// NaN, Infinity, whitespace, separators and hex, which the underlying
// library would otherwise accept.
var numberPattern = regexp.MustCompile(`^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d{1,4})?$`)

// ctx is the decimal context shared by all operations.
var ctx = newContext()

func newContext() *apd.Context {
	c := apd.BaseContext.WithPrecision(precision)
	c.MaxExponent = MaxExponent
	c.MinExponent = -MaxExponent
	c.Rounding = apd.RoundHalfEven
	return c
}

// Number is a finite arbitrary-precision decimal. Build one with Parse.
// The zero value is 0.
type Number struct {
	d apd.Decimal
}

// Parse converts s into a Number, enforcing the input limits.
func Parse(s string) (Number, error) {
	if !numberPattern.MatchString(s) {
		return Number{}, fmt.Errorf("%w: %q", ErrInvalidNumber, s)
	}
	var n Number
	if _, _, err := n.d.SetString(s); err != nil {
		return Number{}, fmt.Errorf("%w: %q", ErrInvalidNumber, s)
	}
	if n.d.Form != apd.Finite {
		return Number{}, fmt.Errorf("%w: %q", ErrInvalidNumber, s)
	}
	if n.d.NumDigits() > MaxInputDigits {
		return Number{}, fmt.Errorf("%w: more than %d significant digits", ErrNumberTooLarge, MaxInputDigits)
	}
	if exp := adjustedExponent(&n.d); exp > MaxExponent || exp < -MaxExponent {
		return Number{}, fmt.Errorf("%w: magnitude outside 10^±%d", ErrNumberTooLarge, MaxExponent)
	}
	return n, nil
}

// adjustedExponent returns the exponent of d in scientific notation.
func adjustedExponent(d *apd.Decimal) int64 {
	return int64(d.Exponent) + d.NumDigits() - 1
}

// IsZero reports whether the number equals zero.
func (n Number) IsZero() bool { return n.d.IsZero() }

// IsNegative reports whether the number is strictly below zero.
func (n Number) IsNegative() bool { return n.d.Negative && !n.d.IsZero() }

// String renders the number in plain decimal notation, rounded half-even to
// at most 16 decimal places, with trailing zeros removed and no negative zero.
func (n Number) String() string {
	var d apd.Decimal
	d.Set(&n.d)
	if d.Exponent < -maxScale {
		var q apd.Decimal
		if _, err := ctx.Quantize(&q, &d, -maxScale); err == nil {
			d.Set(&q)
		}
	}
	d.Reduce(&d)
	if d.IsZero() {
		return "0"
	}
	return d.Text('f')
}
```

- [ ] **Step 4: Run tests**

Run: `go test ./internal/calc/ -run 'TestParse|TestString|TestIsZero' -v`
Expected: all PASS. If `"-0"` renders as `"-0"`, the `IsZero` guard in `String` is missing.

- [ ] **Step 5: Commit**

```bash
git add internal/calc/number.go internal/calc/number_test.go
git commit -m "feat(calc): add decimal Number with input limits"
```

### Task 4: Fuzz test for `Parse`

**Files:**
- Create: `api/internal/calc/number_fuzz_test.go`

- [ ] **Step 1: Write the fuzz test**

```go
package calc

import "testing"

// FuzzParse checks two properties for any input: Parse never panics, and a
// value that parses successfully formats to something that parses back to
// the same value.
func FuzzParse(f *testing.F) {
	for _, seed := range []string{"0", "-1.5", "1e3", ".5", "1.", "NaN", "Inf", "", "1e99999", "0x10", "1..2"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, s string) {
		n, err := Parse(s)
		if err != nil {
			return
		}
		formatted := n.String()
		back, err := Parse(formatted)
		if err != nil {
			t.Fatalf("Parse(%q) ok but Parse(String()=%q) failed: %v", s, formatted, err)
		}
		if back.String() != formatted {
			t.Fatalf("round-trip mismatch: %q -> %q -> %q", s, formatted, back.String())
		}
	})
}
```

- [ ] **Step 2: Run the seeds and a short fuzz session**

Run: `go test ./internal/calc/ -run FuzzParse -v` then `go test ./internal/calc/ -run='^$' -fuzz=FuzzParse -fuzztime=15s`
Expected: PASS, no crashers. If a crasher is found it is written under `testdata/fuzz/FuzzParse/`; fix the bug, keep the file as a regression test, and remove the `testdata/fuzz` line from `.gitignore` only if you want to commit it.

- [ ] **Step 3: Commit**

```bash
git add internal/calc/number_fuzz_test.go
git commit -m "test(calc): fuzz number parsing"
```

### Task 5: Basic operations: add, subtract, multiply, divide

**Files:**
- Create: `api/internal/calc/operations.go`, `api/internal/calc/operations_test.go`

- [ ] **Step 1: Write the failing tests**

```go
package calc

import (
	"errors"
	"testing"
)

type binaryCase struct {
	name    string
	a, b    string
	want    string
	wantErr error
}

func runBinary(t *testing.T, op func(a, b Number) (Number, error), cases []binaryCase) {
	t.Helper()
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			a := mustParse(t, c.a)
			b := mustParse(t, c.b)
			got, err := op(a, b)
			if c.wantErr != nil {
				if !errors.Is(err, c.wantErr) {
					t.Fatalf("error = %v, want %v", err, c.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.String() != c.want {
				t.Fatalf("got %q, want %q", got.String(), c.want)
			}
		})
	}
}

func mustParse(t *testing.T, s string) Number {
	t.Helper()
	n, err := Parse(s)
	if err != nil {
		t.Fatalf("Parse(%q): %v", s, err)
	}
	return n
}

func TestAdd(t *testing.T) {
	runBinary(t, Add, []binaryCase{
		{name: "integers", a: "2", b: "3", want: "5"},
		{name: "decimal exactness", a: "0.1", b: "0.2", want: "0.3"},
		{name: "negative", a: "-5", b: "3", want: "-2"},
		{name: "cancels to zero", a: "1.5", b: "-1.5", want: "0"},
		{name: "large", a: "99999999999999999999", b: "1", want: "100000000000000000000"},
		{name: "overflow", a: "9e1000", b: "9e1000", wantErr: ErrResultTooLarge},
	})
}

func TestSubtract(t *testing.T) {
	runBinary(t, Subtract, []binaryCase{
		{name: "integers", a: "10", b: "4", want: "6"},
		{name: "decimal exactness", a: "0.3", b: "0.1", want: "0.2"},
		{name: "negative result", a: "3", b: "5", want: "-2"},
		{name: "no negative zero", a: "0", b: "0", want: "0"},
	})
}

func TestMultiply(t *testing.T) {
	runBinary(t, Multiply, []binaryCase{
		{name: "integers", a: "6", b: "7", want: "42"},
		{name: "decimals", a: "1.5", b: "2", want: "3"},
		{name: "trailing zeros trimmed", a: "2.50", b: "2", want: "5"},
		{name: "negative", a: "-3", b: "3", want: "-9"},
		{name: "by zero", a: "123.456", b: "0", want: "0"},
		{name: "overflow", a: "1e600", b: "1e600", wantErr: ErrResultTooLarge},
	})
}

func TestDivide(t *testing.T) {
	runBinary(t, Divide, []binaryCase{
		{name: "exact", a: "10", b: "4", want: "2.5"},
		{name: "repeating rounded to 16 places", a: "1", b: "3", want: "0.3333333333333333"},
		{name: "two thirds rounds half-even", a: "2", b: "3", want: "0.6666666666666667"},
		{name: "negative", a: "-1", b: "8", want: "-0.125"},
		{name: "zero numerator", a: "0", b: "5", want: "0"},
		{name: "by zero", a: "1", b: "0", wantErr: ErrDivisionByZero},
		{name: "zero by zero", a: "0", b: "0", wantErr: ErrDivisionByZero},
		{name: "by negative zero", a: "1", b: "-0", wantErr: ErrDivisionByZero},
		{name: "underflow", a: "1e-900", b: "1e900", wantErr: ErrResultTooLarge},
	})
}
```

- [ ] **Step 2: Run to verify failure**

Run: `go test ./internal/calc/ -run 'TestAdd|TestSubtract|TestMultiply|TestDivide'`
Expected: compile error, `undefined: Add`.

- [ ] **Step 3: Implement `operations.go`**

```go
package calc

import (
	"fmt"

	"github.com/cockroachdb/apd/v3"
)

// Add returns a + b.
func Add(a, b Number) (Number, error) { return apply(ctx.Add, a, b) }

// Subtract returns a - b.
func Subtract(a, b Number) (Number, error) { return apply(ctx.Sub, a, b) }

// Multiply returns a × b.
func Multiply(a, b Number) (Number, error) { return apply(ctx.Mul, a, b) }

// Divide returns a ÷ b. Dividing by zero is an error.
func Divide(a, b Number) (Number, error) {
	if b.IsZero() {
		return Number{}, ErrDivisionByZero
	}
	return apply(ctx.Quo, a, b)
}

type binaryFunc func(d, x, y *apd.Decimal) (apd.Condition, error)

// apply runs op into a fresh result and normalises library conditions.
func apply(op binaryFunc, a, b Number) (Number, error) {
	var r Number
	cond, err := op(&r.d, &a.d, &b.d)
	return finish(r, cond, err)
}

// finish converts a library condition into a domain error and guarantees
// that only finite values leave the package.
func finish(r Number, cond apd.Condition, err error) (Number, error) {
	switch {
	case cond.Overflow() || cond.Underflow() || cond.Subnormal():
		return Number{}, ErrResultTooLarge
	case err != nil:
		return Number{}, fmt.Errorf("%w: %v", ErrInvalidOperation, err)
	case r.d.Form != apd.Finite:
		return Number{}, fmt.Errorf("%w: non-finite result", ErrInvalidOperation)
	}
	return r, nil
}
```

- [ ] **Step 4: Run tests**

Run: `go test ./internal/calc/ -run 'TestAdd|TestSubtract|TestMultiply|TestDivide' -v`
Expected: all PASS. If the `underflow` case fails because the library reports a subnormal condition without an error, confirm `finish` checks `cond` before `err` (it does above).

- [ ] **Step 5: Commit**

```bash
git add internal/calc/operations.go internal/calc/operations_test.go
git commit -m "feat(calc): add, subtract, multiply, divide"
```

### Task 6: Advanced operations: power, square root, percent

**Files:**
- Modify: `api/internal/calc/operations.go`, `api/internal/calc/operations_test.go`

- [ ] **Step 1: Append the failing tests**

```go
func TestPower(t *testing.T) {
	runBinary(t, Power, []binaryCase{
		{name: "integer exponent", a: "2", b: "10", want: "1024"},
		{name: "negative base odd exponent", a: "-2", b: "3", want: "-8"},
		{name: "negative base even exponent", a: "-2", b: "2", want: "4"},
		{name: "fractional exponent", a: "4", b: "0.5", want: "2"},
		{name: "negative exponent", a: "2", b: "-2", want: "0.25"},
		{name: "zero exponent", a: "123.4", b: "0", want: "1"},
		{name: "zero to zero is one", a: "0", b: "0", want: "1"},
		{name: "zero to positive", a: "0", b: "5", want: "0"},
		{name: "integer-valued decimal exponent", a: "-8", b: "2.0", want: "64"},
		{name: "zero to negative", a: "0", b: "-1", wantErr: ErrInvalidPower},
		{name: "negative base fractional exponent", a: "-8", b: "0.5", wantErr: ErrInvalidPower},
		{name: "overflow", a: "10", b: "1001", wantErr: ErrResultTooLarge},
		{name: "huge exponent", a: "2", b: "9999", wantErr: ErrResultTooLarge},
	})
}

func TestSqrt(t *testing.T) {
	cases := []struct {
		in, want string
		wantErr  error
	}{
		{in: "16", want: "4"},
		{in: "2", want: "1.4142135623730951"},
		{in: "0.25", want: "0.5"},
		{in: "0", want: "0"},
		{in: "-0", want: "0"},
		{in: "-1", wantErr: ErrNegativeSqrt},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			got, err := Sqrt(mustParse(t, c.in))
			if c.wantErr != nil {
				if !errors.Is(err, c.wantErr) {
					t.Fatalf("error = %v, want %v", err, c.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.String() != c.want {
				t.Fatalf("got %q, want %q", got.String(), c.want)
			}
		})
	}
}

func TestPercent(t *testing.T) {
	runBinary(t, Percent, []binaryCase{
		{name: "fifteen percent of two hundred", a: "200", b: "15", want: "30"},
		{name: "half percent", a: "50", b: "0.5", want: "0.25"},
		{name: "percent of zero", a: "0", b: "15", want: "0"},
		{name: "negative percent", a: "100", b: "-10", want: "-10"},
		{name: "one percent of one", a: "1", b: "1", want: "0.01"},
	})
}
```

- [ ] **Step 2: Run to verify failure**

Run: `go test ./internal/calc/ -run 'TestPower|TestSqrt|TestPercent'`
Expected: compile error, `undefined: Power`.

- [ ] **Step 3: Append to `operations.go`**

```go
var (
	one     = Number{d: *apd.New(1, 0)}
	hundred = Number{d: *apd.New(100, 0)}
)

// Power returns base ^ exponent. 0^0 is defined as 1. Zero to a negative
// power and a negative base with a fractional exponent are errors.
func Power(base, exponent Number) (Number, error) {
	switch {
	case base.IsZero() && exponent.IsZero():
		return one, nil
	case base.IsZero() && exponent.IsNegative():
		return Number{}, fmt.Errorf("%w: zero to a negative power", ErrInvalidPower)
	case base.IsNegative() && !isInteger(exponent):
		return Number{}, fmt.Errorf("%w: negative base with a fractional exponent", ErrInvalidPower)
	}
	return apply(ctx.Pow, base, exponent)
}

// Sqrt returns the square root of v. Negative input is an error.
func Sqrt(v Number) (Number, error) {
	if v.IsNegative() {
		return Number{}, ErrNegativeSqrt
	}
	var r Number
	cond, err := ctx.Sqrt(&r.d, &v.d)
	return finish(r, cond, err)
}

// Percent returns value × percent ÷ 100.
func Percent(value, percent Number) (Number, error) {
	product, err := Multiply(value, percent)
	if err != nil {
		return Number{}, err
	}
	return apply(ctx.Quo, product, hundred)
}

// isInteger reports whether n has no fractional part (2.0 counts as integer).
func isInteger(n Number) bool {
	var d apd.Decimal
	d.Set(&n.d)
	d.Reduce(&d)
	return d.Exponent >= 0
}
```

- [ ] **Step 4: Run the whole package with coverage**

Run: `go test ./internal/calc/ -cover`
Expected: PASS, coverage ≥ 90 %. If `huge exponent` returns a value instead of an error, the `MaxExponent` on the context is not applied; check `newContext`.

- [ ] **Step 5: Commit**

```bash
git add internal/calc/operations.go internal/calc/operations_test.go
git commit -m "feat(calc): power, square root and percent"
```

---

## Part C — HTTP layer (`api/internal/httpapi`)

### Task 7: Problem Details writer and error mapping

**Files:**
- Create: `api/internal/httpapi/problem.go`, `api/internal/httpapi/problem_test.go`

- [ ] **Step 1: Write the failing tests**

```go
package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/LuizColombo/sezzle-calculator/api/internal/calc"
)

func TestWriteProblem(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/divide", nil)
	req = req.WithContext(withRequestID(req.Context(), "req-123"))

	writeProblem(rec, req, http.StatusUnprocessableEntity, "division-by-zero", "Division by zero", "divisor must not be zero")

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != problemContentType {
		t.Fatalf("content-type = %q", ct)
	}
	var p Problem
	if err := json.Unmarshal(rec.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	want := Problem{
		Type:      typeBase + "division-by-zero",
		Title:     "Division by zero",
		Status:    422,
		Detail:    "divisor must not be zero",
		Instance:  "/api/v1/divide",
		RequestID: "req-123",
	}
	if p != want {
		t.Fatalf("got %+v, want %+v", p, want)
	}
}

func TestProblemFromError(t *testing.T) {
	cases := []struct {
		err    error
		status int
		slug   string
	}{
		{calc.ErrInvalidNumber, 400, "invalid-number"},
		{calc.ErrNumberTooLarge, 422, "number-too-large"},
		{calc.ErrDivisionByZero, 422, "division-by-zero"},
		{calc.ErrNegativeSqrt, 422, "negative-square-root"},
		{calc.ErrInvalidPower, 422, "invalid-power"},
		{calc.ErrResultTooLarge, 422, "result-too-large"},
		{calc.ErrInvalidOperation, 422, "invalid-operation"},
		{errors.New("something else"), 500, "internal-error"},
	}
	for _, c := range cases {
		t.Run(c.slug, func(t *testing.T) {
			status, slug, _ := problemFromError(c.err)
			if status != c.status || slug != c.slug {
				t.Fatalf("got (%d, %q), want (%d, %q)", status, slug, c.status, c.slug)
			}
		})
	}
}

func TestProblemFromErrorHidesInternalDetail(t *testing.T) {
	_, _, detail := problemFromError(errors.New("secret stack info"))
	if detail != "" {
		t.Fatalf("internal detail must not leak, got %q", detail)
	}
}

func TestProblemFromErrorKeepsDomainDetail(t *testing.T) {
	err := calc.ErrInvalidPower
	wrapped := errors.Join(err, errors.New("zero to a negative power"))
	_, _, detail := problemFromError(wrapped)
	if detail == "" {
		t.Fatal("domain errors should carry their message as detail")
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `go test ./internal/httpapi/`
Expected: compile error, `undefined: writeProblem`.

- [ ] **Step 3: Implement `problem.go`**

```go
// Package httpapi exposes the calculator over HTTP/JSON.
package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/LuizColombo/sezzle-calculator/api/internal/calc"
)

const (
	problemContentType = "application/problem+json"
	// typeBase prefixes every problem "type" URI; the anchors exist in docs/api.md.
	typeBase = "https://github.com/LuizColombo/sezzle-calculator/blob/main/docs/api.md#"
)

// Problem is an RFC 9457 Problem Details body.
type Problem struct {
	Type      string `json:"type"`
	Title     string `json:"title"`
	Status    int    `json:"status"`
	Detail    string `json:"detail,omitempty"`
	Instance  string `json:"instance,omitempty"`
	RequestID string `json:"requestId,omitempty"`
}

// writeProblem writes a problem+json response.
func writeProblem(w http.ResponseWriter, r *http.Request, status int, slug, title, detail string) {
	w.Header().Set("Content-Type", problemContentType)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Problem{
		Type:      typeBase + slug,
		Title:     title,
		Status:    status,
		Detail:    detail,
		Instance:  r.URL.Path,
		RequestID: requestIDFrom(r.Context()),
	})
}

// problemFromError maps a domain error to an HTTP status, a type slug and a
// safe detail message. Unknown errors become a 500 with no detail.
func problemFromError(err error) (status int, slug, detail string) {
	mapping := []struct {
		target error
		status int
		slug   string
	}{
		{calc.ErrInvalidNumber, http.StatusBadRequest, "invalid-number"},
		{calc.ErrNumberTooLarge, http.StatusUnprocessableEntity, "number-too-large"},
		{calc.ErrDivisionByZero, http.StatusUnprocessableEntity, "division-by-zero"},
		{calc.ErrNegativeSqrt, http.StatusUnprocessableEntity, "negative-square-root"},
		{calc.ErrInvalidPower, http.StatusUnprocessableEntity, "invalid-power"},
		{calc.ErrResultTooLarge, http.StatusUnprocessableEntity, "result-too-large"},
		{calc.ErrInvalidOperation, http.StatusUnprocessableEntity, "invalid-operation"},
	}
	for _, m := range mapping {
		if errors.Is(err, m.target) {
			return m.status, m.slug, err.Error()
		}
	}
	return http.StatusInternalServerError, "internal-error", ""
}

// titles maps slugs to human titles.
var titles = map[string]string{
	"invalid-request":      "Invalid request",
	"invalid-number":       "Invalid number",
	"number-too-large":     "Number too large",
	"division-by-zero":     "Division by zero",
	"negative-square-root": "Square root of a negative number",
	"invalid-power":        "Invalid power",
	"result-too-large":     "Result out of range",
	"invalid-operation":    "Invalid operation",
	"not-found":            "Not found",
	"method-not-allowed":   "Method not allowed",
	"internal-error":       "Internal server error",
}

// writeError writes the problem for a domain error.
func writeError(w http.ResponseWriter, r *http.Request, err error) {
	status, slug, detail := problemFromError(err)
	writeProblem(w, r, status, slug, titles[slug], detail)
}
```

`withRequestID` / `requestIDFrom` come in Task 9; for now add a minimal `context.go`:

```go
package httpapi

import "context"

type ctxKey int

const requestIDKey ctxKey = iota

func withRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey, id)
}

func requestIDFrom(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey).(string)
	return id
}
```

- [ ] **Step 4: Run tests**

Run: `go test ./internal/httpapi/ -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/httpapi/problem.go internal/httpapi/problem_test.go internal/httpapi/context.go
git commit -m "feat(api): problem+json error responses"
```

### Task 8: Request decoding and operation handlers

**Files:**
- Create: `api/internal/httpapi/request.go`, `api/internal/httpapi/operations.go`, `api/internal/httpapi/operations_test.go`

- [ ] **Step 1: Write the failing tests**

```go
package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newTestHandler() http.Handler {
	return NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), "test", nil)
}

func post(t *testing.T, h http.Handler, path, body string, headers ...string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func decodeProblem(t *testing.T, rec *httptest.ResponseRecorder) Problem {
	t.Helper()
	if ct := rec.Header().Get("Content-Type"); ct != problemContentType {
		t.Fatalf("content-type = %q, body = %s", ct, rec.Body.String())
	}
	var p Problem
	if err := json.Unmarshal(rec.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestOperationsHappyPath(t *testing.T) {
	h := newTestHandler()
	cases := []struct {
		path, body, want string
	}{
		{"/api/v1/add", `{"a":"0.1","b":"0.2"}`, "0.3"},
		{"/api/v1/subtract", `{"a":"5","b":"7"}`, "-2"},
		{"/api/v1/multiply", `{"a":"1.5","b":"2"}`, "3"},
		{"/api/v1/divide", `{"a":"1","b":"8"}`, "0.125"},
		{"/api/v1/power", `{"base":"2","exponent":"10"}`, "1024"},
		{"/api/v1/sqrt", `{"value":"16"}`, "4"},
		{"/api/v1/percent", `{"value":"200","percent":"15"}`, "30"},
	}
	for _, c := range cases {
		t.Run(c.path, func(t *testing.T) {
			rec := post(t, h, c.path, c.body)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Fatalf("content-type = %q", ct)
			}
			var resp Response
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatal(err)
			}
			if resp.Result != c.want {
				t.Fatalf("result = %q, want %q", resp.Result, c.want)
			}
			if resp.Operation != strings.TrimPrefix(c.path, "/api/v1/") {
				t.Fatalf("operation = %q", resp.Operation)
			}
		})
	}
}

func TestOperationsEchoInputs(t *testing.T) {
	rec := post(t, newTestHandler(), "/api/v1/add", `{"a":"1","b":"2"}`)
	var resp Response
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.Inputs["a"] != "1" || resp.Inputs["b"] != "2" {
		t.Fatalf("inputs = %v", resp.Inputs)
	}
}

func TestOperationsDomainErrors(t *testing.T) {
	h := newTestHandler()
	cases := []struct {
		path, body string
		status     int
		slug       string
	}{
		{"/api/v1/divide", `{"a":"1","b":"0"}`, 422, "division-by-zero"},
		{"/api/v1/sqrt", `{"value":"-1"}`, 422, "negative-square-root"},
		{"/api/v1/power", `{"base":"0","exponent":"-1"}`, 422, "invalid-power"},
		{"/api/v1/multiply", `{"a":"1e600","b":"1e600"}`, 422, "result-too-large"},
		{"/api/v1/add", `{"a":"1e1001","b":"1"}`, 422, "number-too-large"},
		{"/api/v1/add", `{"a":"abc","b":"1"}`, 400, "invalid-number"},
		{"/api/v1/add", `{"a":"NaN","b":"1"}`, 400, "invalid-number"},
	}
	for _, c := range cases {
		t.Run(c.slug+c.path, func(t *testing.T) {
			rec := post(t, h, c.path, c.body)
			p := decodeProblem(t, rec)
			if rec.Code != c.status || !strings.HasSuffix(p.Type, c.slug) {
				t.Fatalf("got %d %s, want %d %s", rec.Code, p.Type, c.status, c.slug)
			}
			if p.Instance != c.path {
				t.Fatalf("instance = %q", p.Instance)
			}
		})
	}
}

func TestOperationsInvalidRequests(t *testing.T) {
	h := newTestHandler()
	cases := []struct {
		name, body string
		headers    []string
	}{
		{name: "malformed json", body: `{"a":"1",`},
		{name: "missing field", body: `{"a":"1"}`},
		{name: "unknown field", body: `{"a":"1","b":"2","c":"3"}`},
		{name: "number instead of string", body: `{"a":1,"b":2}`},
		{name: "empty body", body: ``},
		{name: "trailing data", body: `{"a":"1","b":"2"} {}`},
		{name: "array body", body: `["1","2"]`},
		{name: "oversized body", body: `{"a":"` + strings.Repeat("1", 2000) + `","b":"1"}`},
		{name: "wrong content type", body: `{"a":"1","b":"2"}`, headers: []string{"Content-Type", "text/plain"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := post(t, h, "/api/v1/add", c.body, c.headers...)
			p := decodeProblem(t, rec)
			if rec.Code != http.StatusBadRequest || !strings.HasSuffix(p.Type, "invalid-request") {
				t.Fatalf("got %d %s", rec.Code, p.Type)
			}
		})
	}
}

func TestOperationsAcceptCharsetInContentType(t *testing.T) {
	rec := post(t, newTestHandler(), "/api/v1/add", `{"a":"1","b":"2"}`, "Content-Type", "application/json; charset=utf-8")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestListOperations(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/operations", nil)
	rec := httptest.NewRecorder()
	newTestHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var ops []Operation
	if err := json.Unmarshal(rec.Body.Bytes(), &ops); err != nil {
		t.Fatal(err)
	}
	if len(ops) != 7 {
		t.Fatalf("got %d operations, want 7", len(ops))
	}
	if ops[0].Name != "add" || ops[0].Path != "/api/v1/add" || ops[0].Arity != 2 {
		t.Fatalf("first op = %+v", ops[0])
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `go test ./internal/httpapi/`
Expected: compile error, `undefined: NewHandler`.

- [ ] **Step 3: Implement `request.go`**

```go
package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
)

// maxBodyBytes bounds request bodies; two 64-digit numbers fit comfortably.
const maxBodyBytes = 1024

// errInvalidRequest is wrapped by every decoding failure.
var errInvalidRequest = errors.New("invalid request")

// decodeInputs reads a JSON object whose values are all strings and whose
// keys are exactly `fields`. Any deviation is a 400.
func decodeInputs(w http.ResponseWriter, r *http.Request, fields []string) (map[string]string, error) {
	ct, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || ct != "application/json" {
		return nil, fmt.Errorf("%w: Content-Type must be application/json", errInvalidRequest)
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	var raw map[string]string
	if err := dec.Decode(&raw); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			return nil, fmt.Errorf("%w: body exceeds %d bytes", errInvalidRequest, maxBodyBytes)
		}
		return nil, fmt.Errorf("%w: body must be a JSON object of strings", errInvalidRequest)
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("%w: unexpected data after JSON body", errInvalidRequest)
	}
	for _, f := range fields {
		if _, ok := raw[f]; !ok {
			return nil, fmt.Errorf("%w: missing field %q", errInvalidRequest, f)
		}
	}
	if len(raw) != len(fields) {
		return nil, fmt.Errorf("%w: unexpected fields; allowed: %v", errInvalidRequest, fields)
	}
	return raw, nil
}

// writeJSON writes v as application/json with the given status.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
```

- [ ] **Step 4: Implement `operations.go`**

```go
package httpapi

import (
	"net/http"

	"github.com/LuizColombo/sezzle-calculator/api/internal/calc"
)

// Operation describes one calculator endpoint. The same table drives the
// routes, GET /operations and (by hand) openapi.yaml.
type Operation struct {
	Name   string   `json:"name"`
	Path   string   `json:"path"`
	Arity  int      `json:"arity"`
	Params []string `json:"params"`

	binary func(a, b calc.Number) (calc.Number, error)
	unary  func(v calc.Number) (calc.Number, error)
}

// Response is the body of every successful operation.
type Response struct {
	Operation string            `json:"operation"`
	Inputs    map[string]string `json:"inputs"`
	Result    string            `json:"result"`
}

const basePath = "/api/v1/"

var operations = []Operation{
	{Name: "add", Params: []string{"a", "b"}, binary: calc.Add},
	{Name: "subtract", Params: []string{"a", "b"}, binary: calc.Subtract},
	{Name: "multiply", Params: []string{"a", "b"}, binary: calc.Multiply},
	{Name: "divide", Params: []string{"a", "b"}, binary: calc.Divide},
	{Name: "power", Params: []string{"base", "exponent"}, binary: calc.Power},
	{Name: "sqrt", Params: []string{"value"}, unary: calc.Sqrt},
	{Name: "percent", Params: []string{"value", "percent"}, binary: calc.Percent},
}

func init() {
	for i := range operations {
		operations[i].Path = basePath + operations[i].Name
		operations[i].Arity = len(operations[i].Params)
	}
}

// handler returns the HTTP handler for the operation.
func (op Operation) handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		inputs, err := decodeInputs(w, r, op.Params)
		if err != nil {
			writeProblem(w, r, http.StatusBadRequest, "invalid-request", titles["invalid-request"], err.Error())
			return
		}
		nums := make([]calc.Number, len(op.Params))
		for i, field := range op.Params {
			n, err := calc.Parse(inputs[field])
			if err != nil {
				writeError(w, r, err)
				return
			}
			nums[i] = n
		}
		var result calc.Number
		if op.unary != nil {
			result, err = op.unary(nums[0])
		} else {
			result, err = op.binary(nums[0], nums[1])
		}
		if err != nil {
			writeError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, Response{Operation: op.Name, Inputs: inputs, Result: result.String()})
	}
}

// listOperations serves GET /api/v1/operations.
func listOperations(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, operations)
}

// isOperation reports whether name is a known operation.
func isOperation(name string) bool {
	for _, op := range operations {
		if op.Name == name {
			return true
		}
	}
	return false
}
```

- [ ] **Step 5: Add a minimal `server.go` so the tests compile** (expanded in Task 9)

```go
package httpapi

import (
	"log/slog"
	"net/http"
)

// NewHandler wires routes and middleware. corsOrigins empty disables CORS.
func NewHandler(logger *slog.Logger, version string, corsOrigins []string) http.Handler {
	mux := http.NewServeMux()
	for _, op := range operations {
		mux.Handle("POST "+op.Path, op.handler())
	}
	mux.HandleFunc("GET "+basePath+"operations", listOperations)
	return mux
}
```

- [ ] **Step 6: Run tests**

Run: `go test ./internal/httpapi/ -v`
Expected: PASS for all tests in this task. (`go vet` will flag unused parameters `logger`, `version`, `corsOrigins`? No: unused function parameters are allowed in Go.)

- [ ] **Step 7: Commit**

```bash
git add internal/httpapi/
git commit -m "feat(api): expose calculator operations over HTTP"
```

### Task 9: Middleware, health, 404/405, CORS

**Files:**
- Create: `api/internal/httpapi/middleware.go`, `api/internal/httpapi/server_test.go`
- Modify: `api/internal/httpapi/server.go`

- [ ] **Step 1: Write the failing tests**

```go
package httpapi

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealthz(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	newTestHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var body map[string]string
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["status"] != "ok" || body["version"] != "test" {
		t.Fatalf("body = %v", body)
	}
}

func TestNotFoundIsProblem(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/nope", nil)
	rec := httptest.NewRecorder()
	newTestHandler().ServeHTTP(rec, req)
	p := decodeProblem(t, rec)
	if rec.Code != http.StatusNotFound || !strings.HasSuffix(p.Type, "not-found") {
		t.Fatalf("got %d %s", rec.Code, p.Type)
	}
}

func TestUnknownOperationIsNotFound(t *testing.T) {
	rec := post(t, newTestHandler(), "/api/v1/modulo", `{}`)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestWrongMethodIsProblem(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/add", nil)
	rec := httptest.NewRecorder()
	newTestHandler().ServeHTTP(rec, req)
	p := decodeProblem(t, rec)
	if rec.Code != http.StatusMethodNotAllowed || !strings.HasSuffix(p.Type, "method-not-allowed") {
		t.Fatalf("got %d %s", rec.Code, p.Type)
	}
	if allow := rec.Header().Get("Allow"); allow != "POST" {
		t.Fatalf("Allow = %q", allow)
	}
}

func TestRequestIDIsGeneratedAndEchoed(t *testing.T) {
	rec := post(t, newTestHandler(), "/api/v1/add", `{"a":"1","b":"2"}`)
	if rec.Header().Get("X-Request-ID") == "" {
		t.Fatal("missing X-Request-ID")
	}
	rec = post(t, newTestHandler(), "/api/v1/add", `{"a":"1","b":"2"}`, "X-Request-ID", "client-42")
	if got := rec.Header().Get("X-Request-ID"); got != "client-42" {
		t.Fatalf("X-Request-ID = %q", got)
	}
}

func TestRequestIDAppearsInProblem(t *testing.T) {
	rec := post(t, newTestHandler(), "/api/v1/divide", `{"a":"1","b":"0"}`, "X-Request-ID", "client-42")
	if p := decodeProblem(t, rec); p.RequestID != "client-42" {
		t.Fatalf("requestId = %q", p.RequestID)
	}
}

func TestRecoverTurnsPanicInto500(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))
	h := chain(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") }), recoverPanics(logger))
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	p := decodeProblem(t, rec)
	if rec.Code != http.StatusInternalServerError || p.Detail != "" {
		t.Fatalf("got %d detail=%q", rec.Code, p.Detail)
	}
	if !strings.Contains(buf.String(), "boom") {
		t.Fatal("panic should be logged")
	}
}

func TestRequestLogging(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))
	h := NewHandler(logger, "test", nil)
	post(t, h, "/api/v1/add", `{"a":"1","b":"2"}`)
	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("log is not one JSON line: %s", buf.String())
	}
	if entry["method"] != "POST" || entry["path"] != "/api/v1/add" || entry["status"] != float64(200) {
		t.Fatalf("entry = %v", entry)
	}
}

func TestCORSDisabledByDefault(t *testing.T) {
	rec := post(t, newTestHandler(), "/api/v1/add", `{"a":"1","b":"2"}`, "Origin", "http://localhost:5173")
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("CORS headers must be absent when no origins are configured")
	}
}

func TestCORSPreflightAndAllowedOrigin(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(bytes.NewBuffer(nil), nil))
	h := NewHandler(logger, "test", []string{"http://localhost:5173"})

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/add", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", "POST")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Fatalf("allow-origin = %q", rec.Header().Get("Access-Control-Allow-Origin"))
	}
	if !strings.Contains(rec.Header().Get("Access-Control-Allow-Headers"), "Content-Type") {
		t.Fatal("preflight must allow Content-Type")
	}

	rec = post(t, h, "/api/v1/add", `{"a":"1","b":"2"}`, "Origin", "http://evil.example")
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("unknown origin must not be allowed")
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `go test ./internal/httpapi/`
Expected: compile error, `undefined: chain`.

- [ ] **Step 3: Implement `middleware.go`**

```go
package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"
)

type middleware func(http.Handler) http.Handler

// chain applies middlewares so that the first one listed is the outermost.
func chain(h http.Handler, mws ...middleware) http.Handler {
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}

// recoverPanics converts a panic into a 500 problem and logs the stack.
func recoverPanics(logger *slog.Logger) middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					logger.Error("panic recovered", "panic", rec, "path", r.URL.Path, "requestId", requestIDFrom(r.Context()))
					writeProblem(w, r, http.StatusInternalServerError, "internal-error", titles["internal-error"], "")
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// requestID reuses the client's X-Request-ID or generates one, and echoes it.
func requestID() middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := r.Header.Get("X-Request-ID")
			if id == "" || len(id) > 128 {
				id = newRequestID()
			}
			w.Header().Set("X-Request-ID", id)
			next.ServeHTTP(w, r.WithContext(withRequestID(r.Context(), id)))
		})
	}
}

func newRequestID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// statusRecorder captures the status code for logging.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// logRequests writes one structured line per request.
func logRequests(logger *slog.Logger) middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rec, r)
			logger.Info("request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", rec.status,
				"durationMs", float64(time.Since(start).Microseconds())/1000,
				"requestId", requestIDFrom(r.Context()),
			)
		})
	}
}

// cors allows the listed origins. With no origins it is a no-op.
func cors(origins []string) middleware {
	return func(next http.Handler) http.Handler {
		if len(origins) == 0 {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && slices.Contains(origins, origin) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				if r.Method == http.MethodOptions {
					w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
					w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Request-ID")
					w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID")
					w.Header().Set("Access-Control-Max-Age", "600")
					w.WriteHeader(http.StatusNoContent)
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// methodNotAllowed answers any method on a known operation path that is not
// POST. It exists because the stdlib mux's built-in 405 is plain text.
func methodNotAllowed(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Allow", http.MethodPost)
	writeProblem(w, r, http.StatusMethodNotAllowed, "method-not-allowed", titles["method-not-allowed"],
		"use POST "+r.URL.Path+"; allowed: "+strings.Join([]string{http.MethodPost}, ", "))
}
```

- [ ] **Step 4: Replace `server.go`**

```go
package httpapi

import (
	"log/slog"
	"net/http"
)

// NewHandler wires routes and middleware. corsOrigins empty disables CORS.
func NewHandler(logger *slog.Logger, version string, corsOrigins []string) http.Handler {
	mux := http.NewServeMux()

	for _, op := range operations {
		mux.Handle("POST "+op.Path, op.handler())
	}
	mux.HandleFunc("GET "+basePath+"operations", listOperations)
	mux.HandleFunc(basePath+"{name}", func(w http.ResponseWriter, r *http.Request) {
		if isOperation(r.PathValue("name")) {
			methodNotAllowed(w, r)
			return
		}
		notFound(w, r)
	})

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": version})
	})
	registerDocs(mux)
	mux.HandleFunc("/", notFound)

	return chain(mux,
		recoverPanics(logger),
		requestID(),
		logRequests(logger),
		cors(corsOrigins),
	)
}

func notFound(w http.ResponseWriter, r *http.Request) {
	writeProblem(w, r, http.StatusNotFound, "not-found", titles["not-found"], "no route for "+r.Method+" "+r.URL.Path)
}
```

`registerDocs` is added in Task 10; for this task create `docs.go` with an empty `func registerDocs(*http.ServeMux) {}` so the package compiles, then fill it in next task.

- [ ] **Step 5: Run tests and vet**

Run: `go test ./internal/httpapi/ -v && go vet ./...`
Expected: PASS. Note the ordering: the `OPTIONS` preflight must be answered by `cors` *before* reaching the mux, which happens because `cors` wraps `mux`. `TestWrongMethodIsProblem` passes because the pattern `/api/v1/{name}` (no method) is less specific than `POST /api/v1/add`, so GET falls through to it.

- [ ] **Step 6: Commit**

```bash
git add internal/httpapi/
git commit -m "feat(api): middleware, health check and JSON 404/405"
```

### Task 10: OpenAPI spec and Scalar docs page

**Files:**
- Create: `api/openapi.yaml`, `api/docs.html`, `api/embed.go`
- Modify: `api/internal/httpapi/docs.go`, add tests to `api/internal/httpapi/server_test.go`

- [ ] **Step 1: Write the failing tests** (append to `server_test.go`)

```go
func TestOpenAPIIsServed(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/openapi.yaml", nil)
	rec := httptest.NewRecorder()
	newTestHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.HasPrefix(rec.Header().Get("Content-Type"), "application/yaml") {
		t.Fatalf("got %d %s", rec.Code, rec.Header().Get("Content-Type"))
	}
	body := rec.Body.String()
	for _, op := range operations {
		if !strings.Contains(body, op.Path+":") {
			t.Errorf("openapi.yaml does not document %s", op.Path)
		}
	}
}

func TestDocsPageIsServed(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/docs", nil)
	rec := httptest.NewRecorder()
	newTestHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/html") {
		t.Fatalf("got %d %s", rec.Code, rec.Header().Get("Content-Type"))
	}
	if !strings.Contains(rec.Body.String(), "/openapi.yaml") {
		t.Fatal("docs page must reference the spec")
	}
}
```

- [ ] **Step 2: Create `api/embed.go`**

```go
// Package api holds the files that document the service, embedded so the
// binary is self-contained.
package api

import _ "embed"

// OpenAPISpec is the OpenAPI 3.1 description of the HTTP API.
//
//go:embed openapi.yaml
var OpenAPISpec []byte

// DocsPage is the Scalar API reference bootstrap page.
//
//go:embed docs.html
var DocsPage []byte
```

- [ ] **Step 3: Create `api/docs.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sezzle Calculator API</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference("#app", { url: "/openapi.yaml" });
    </script>
  </body>
</html>
```

- [ ] **Step 4: Create `api/openapi.yaml`**

Write OpenAPI 3.1 with: `info` (title "Sezzle Calculator API", version "1.0.0", description mentioning decimal strings and problem+json), `servers: [{url: /}]`, components:
- `schemas.DecimalString`: `type: string`, `pattern: '^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d{1,4})?$'`, description with the 64-digit / 10^±1000 limits, example `"0.1"`.
- `schemas.BinaryRequestAB` (`a`, `b` required), `schemas.PowerRequest` (`base`, `exponent`), `schemas.UnaryRequest` (`value`), `schemas.PercentRequest` (`value`, `percent`), all `additionalProperties: false`.
- `schemas.Response` with `operation`, `inputs` (object of DecimalString), `result`.
- `schemas.Problem` with `type` (uri), `title`, `status`, `detail`, `instance`, `requestId`.
- `schemas.Operation` (`name`, `path`, `arity`, `params`).
- `responses.BadRequest` and `responses.Unprocessable`, both `application/problem+json` with `Problem` and one example each (`invalid-request`, `division-by-zero`).

Paths: one `post` per operation (`/api/v1/add` … `/api/v1/percent`) with `operationId` equal to the name, the matching request schema, `200` → `Response` with a concrete example (`add`: `0.1`+`0.2`=`0.3`; `divide`: `1`/`8`=`0.125`; `power`: `2`^`10`=`1024`; `sqrt`: `16`→`4`; `percent`: `200`,`15`→`30`), `400` and `422` referencing the shared responses. `get /api/v1/operations` → array of `Operation`. `get /healthz` → `{status, version}`.

Every operation path key must appear literally as `/api/v1/<name>:` so `TestOpenAPIIsServed` finds it.

- [ ] **Step 5: Implement `docs.go`**

```go
package httpapi

import (
	"net/http"

	api "github.com/LuizColombo/sezzle-calculator/api"
)

// registerDocs serves the embedded OpenAPI spec and the Scalar reference UI.
func registerDocs(mux *http.ServeMux) {
	mux.HandleFunc("GET /openapi.yaml", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
		_, _ = w.Write(api.OpenAPISpec)
	})
	mux.HandleFunc("GET /docs", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(api.DocsPage)
	})
}
```

- [ ] **Step 6: Validate the spec and run tests**

Run: `npx --yes @redocly/cli@2.62.1 lint openapi.yaml` (from `api/`)
Expected: no errors (warnings about missing `security` are fine).
Run: `go test ./... -cover`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add embed.go openapi.yaml docs.html internal/httpapi/docs.go internal/httpapi/server_test.go
git commit -m "feat(api): serve OpenAPI spec and Scalar docs"
```

### Task 11: Entrypoint: config, server lifecycle, health probe

**Files:**
- Create: `api/cmd/api/config.go`, `api/cmd/api/config_test.go`, `api/cmd/api/main.go`

- [ ] **Step 1: Write the failing tests**

```go
package main

import (
	"log/slog"
	"testing"
)

func TestLoadConfigDefaults(t *testing.T) {
	cfg, err := loadConfig(func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "8080" || cfg.LogLevel != slog.LevelInfo || len(cfg.CORSOrigins) != 0 {
		t.Fatalf("cfg = %+v", cfg)
	}
}

func TestLoadConfigFromEnv(t *testing.T) {
	env := map[string]string{"PORT": "9000", "LOG_LEVEL": "debug", "CORS_ORIGINS": "http://a.test, http://b.test"}
	cfg, err := loadConfig(func(k string) string { return env[k] })
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "9000" || cfg.LogLevel != slog.LevelDebug {
		t.Fatalf("cfg = %+v", cfg)
	}
	if len(cfg.CORSOrigins) != 2 || cfg.CORSOrigins[1] != "http://b.test" {
		t.Fatalf("origins = %v", cfg.CORSOrigins)
	}
}

func TestLoadConfigRejectsBadValues(t *testing.T) {
	for _, env := range []map[string]string{
		{"PORT": "abc"},
		{"PORT": "70000"},
		{"LOG_LEVEL": "loud"},
	} {
		if _, err := loadConfig(func(k string) string { return env[k] }); err == nil {
			t.Errorf("expected error for %v", env)
		}
	}
}
```

- [ ] **Step 2: Implement `config.go`**

```go
package main

import (
	"fmt"
	"log/slog"
	"strconv"
	"strings"
)

type config struct {
	Port        string
	LogLevel    slog.Level
	CORSOrigins []string
}

// loadConfig reads configuration from the environment via getenv.
func loadConfig(getenv func(string) string) (config, error) {
	cfg := config{Port: "8080", LogLevel: slog.LevelInfo}

	if p := getenv("PORT"); p != "" {
		n, err := strconv.Atoi(p)
		if err != nil || n < 1 || n > 65535 {
			return config{}, fmt.Errorf("PORT must be 1-65535, got %q", p)
		}
		cfg.Port = p
	}
	if l := getenv("LOG_LEVEL"); l != "" {
		if err := cfg.LogLevel.UnmarshalText([]byte(l)); err != nil {
			return config{}, fmt.Errorf("LOG_LEVEL must be debug|info|warn|error, got %q", l)
		}
	}
	if o := getenv("CORS_ORIGINS"); o != "" {
		for _, origin := range strings.Split(o, ",") {
			if origin = strings.TrimSpace(origin); origin != "" {
				cfg.CORSOrigins = append(cfg.CORSOrigins, origin)
			}
		}
	}
	return cfg, nil
}
```

- [ ] **Step 3: Implement `main.go`**

```go
// Command api runs the calculator HTTP service.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/LuizColombo/sezzle-calculator/api/internal/httpapi"
)

// version is injected at build time with -ldflags "-X main.version=…".
var version = "dev"

func main() {
	healthcheck := flag.Bool("healthcheck", false, "probe the running server's /healthz and exit 0 if healthy")
	flag.Parse()

	cfg, err := loadConfig(os.Getenv)
	if err != nil {
		fmt.Fprintln(os.Stderr, "config:", err)
		os.Exit(2)
	}
	if *healthcheck {
		os.Exit(probe(cfg.Port))
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	if err := run(context.Background(), cfg, logger); err != nil {
		logger.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

// run serves until ctx is cancelled or a termination signal arrives.
func run(ctx context.Context, cfg config, logger *slog.Logger) error {
	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           httpapi.NewHandler(logger, version, cfg.CORSOrigins),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("listening", "addr", srv.Addr, "version", version)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// probe is the Docker HEALTHCHECK: distroless images have no curl or wget.
func probe(port string) int {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/healthz")
	if err != nil {
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
```

- [ ] **Step 4: Run tests, build, smoke test**

```bash
go test ./... && go build -o /tmp/sezzle-api ./cmd/api
PORT=18080 /tmp/sezzle-api &  # in background
sleep 1
curl -s -X POST localhost:18080/api/v1/add -H 'Content-Type: application/json' -d '{"a":"0.1","b":"0.2"}'
curl -s -X POST localhost:18080/api/v1/divide -H 'Content-Type: application/json' -d '{"a":"1","b":"0"}'
PORT=18080 /tmp/sezzle-api -healthcheck; echo "probe exit=$?"
kill %1
```

Expected: `{"operation":"add","inputs":{"a":"0.1","b":"0.2"},"result":"0.3"}`, a 422 problem body, `probe exit=0`, and a JSON "shutting down" log line on kill.

- [ ] **Step 5: Lint and commit**

```bash
golangci-lint run && git add cmd/
git commit -m "feat(api): server entrypoint with graceful shutdown"
```

### Task 12: API Dockerfile

**Files:**
- Create: `api/Dockerfile`, `api/.dockerignore`

- [ ] **Step 1: Create `api/.dockerignore`**

```
coverage.*
api
Dockerfile
.golangci.yml
testdata/fuzz
```

- [ ] **Step 2: Create `api/Dockerfile`**

```dockerfile
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
ARG VERSION=dev
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /out/api ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /api
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/api"]
```

- [ ] **Step 3: Build and run**

```bash
docker build -t sezzle-api:dev --build-arg VERSION=dev .
docker run --rm -d -p 18080:8080 --name sezzle-api sezzle-api:dev
sleep 1; curl -s localhost:18080/healthz; docker exec sezzle-api /api -healthcheck; echo "probe=$?"
docker images sezzle-api:dev --format '{{.Size}}'
docker stop sezzle-api
```

Expected: `{"status":"ok","version":"dev"}`, `probe=0`, image size around 10 MB.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "build(api): distroless multi-stage Dockerfile"
```

### Task 13: Backend docs and ADRs

**Files:**
- Create: `docs/backend.md`, `docs/api.md`, `docs/adr/0001-stdlib-router.md`, `docs/adr/0002-decimal-arithmetic.md`, `docs/adr/0003-numbers-as-json-strings.md`, `docs/adr/0004-problem-details-errors.md`, `docs/adr/0005-layered-not-clean-architecture.md`

- [ ] **Step 1: Write the five ADRs.** Each uses this template and stays within 15–30 lines:

```markdown
# ADR 000N: <title>

**Status:** Accepted · **Date:** 2026-10-10

## Context
<2–5 sentences: the forces, what the assignment asked, what alternatives existed>

## Decision
<1–3 sentences, imperative>

## Consequences
- <positive>
- <negative or trade-off>
- <what would make us revisit>
```

Content per ADR:
- **0001 stdlib router**: Go 1.22 added method and wildcard patterns to `net/http.ServeMux`; gorilla/mux (archived Dec 2022, revived 2023) is a known choice at Sezzle but adds a dependency for no feature we use; handlers are `http.Handler` so swapping is one line in `server.go`; trade-off: the stdlib's built-in 405 is plain text, so we register a catch-all to answer in problem+json.
- **0002 decimal arithmetic**: `float64` cannot represent `0.1`; for a payments company this is a correctness bug; chose `cockroachdb/apd` (decimal128 context, `Sqrt`/`Pow`, battle-tested in CockroachDB) over `shopspring/decimal` (no sqrt) and `math/big` (binary, not decimal); consequences: inputs/results bounded (64 digits, 10^±1000, 16 display places) and the library's NaN/Infinity leniency is guarded in the domain.
- **0003 numbers as JSON strings**: a JSON number is parsed into `float64` by every mainstream decoder before application code sees it; strings preserve the decimal; cost: clients must quote numbers, documented in OpenAPI with a pattern.
- **0004 Problem Details**: RFC 9457 gives a standard shape, machine-readable `type` URIs that link to `docs/api.md`, and a place for the request id; 400 for malformed requests, 422 for valid JSON with impossible maths.
- **0005 layered, not clean architecture**: two packages (`calc`, `httpapi`) with the dependency pointing inward is all the separation a calculator needs; use-case interfaces, ports and adapters would be interfaces with one implementation; revisit when a second transport or a persistence layer appears.

- [ ] **Step 2: Write `docs/backend.md`** with sections: Layout (the tree from the spec), Request lifecycle (middleware order and what each does), Domain rules (limits, rounding, the NaN/Infinity guards, `0^0`), Configuration (table of env vars with defaults), Running locally (`go run ./cmd/api`, `make test`, `make cover`, `make lint`, `make fuzz`), Next steps (rate limiting, metrics, auth — explicitly out of scope).

- [ ] **Step 3: Write `docs/api.md`** with: base URL, content types, a curl example for every endpoint (success), the error format with one full example, and a section `## Error types` containing one `### <slug>` heading per slug in `titles` (these are the anchors the `type` URIs point to), each with status code and when it happens.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: backend guide, API usage and ADRs 1-5"
```

### ✅ Checkpoint 1 — independent review (backend)

Dispatch the reviewer (`code-reviewer`, `model: fable`) with: the spec path, the plan path, and "review `api/` for correctness, idiomatic Go, test quality, security of input handling, and anything that contradicts the spec". Address findings, commit fixes as `fix(api): …` or `refactor(api): …`, and record notable findings in `docs/ai/corrections.md` (created in Task 27).

---

## Part D — Frontend foundation (`web/`)

### Task 14: Scaffold Vite + React + TypeScript with tooling

**Files:**
- Create: `web/` via Vite template, then `web/tsconfig.json`, `web/tsconfig.app.json`, `web/vite.config.ts`, `web/vitest.config.ts`, `web/eslint.config.js`, `web/.prettierrc`, `web/.prettierignore`, `web/src/test/setup.ts`, `web/src/styles/{tokens,reset,global}.css`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`

- [ ] **Step 1: Scaffold**

```bash
cd /var/www/html/sezzle
npm create vite@latest web -- --template react-ts
cd web
rm -rf src/assets src/App.css src/index.css public/vite.svg
npm install
npm install motion@14.1.0
npm install -D vitest@5.0.3 @vitest/coverage-v8@5.0.3 jsdom@30.1.2 \
  @testing-library/react@16.3.3 @testing-library/user-event@14.6.7 @testing-library/jest-dom@7.0.1 \
  msw@3.0.3 @playwright/test@1.64.0 openapi-typescript@7.13.0 \
  prettier@3.9.10 eslint-config-prettier@10.1.8 eslint-plugin-jsx-a11y@6.10.2
```

The Vite template already brings `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `@vitejs/plugin-react`, `typescript`. Keep them.

- [ ] **Step 2: `package.json` scripts** (replace the `scripts` block)

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "typecheck": "tsc -b --noEmit",
  "lint": "eslint .",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "gen": "openapi-typescript ../api/openapi.yaml -o src/features/calculator/api/schema.gen.ts",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "e2e": "playwright test"
},
"engines": { "node": ">=22" }
```

- [ ] **Step 3: `tsconfig.app.json`** — ensure these compiler options are present (the template has most):

```json
"strict": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"noFallthroughCasesInSwitch": true,
"noUncheckedIndexedAccess": true,
"exactOptionalPropertyTypes": true,
"verbatimModuleSyntax": true,
"types": ["vitest/globals", "@testing-library/jest-dom"]
```

Add `"exclude": ["src/**/*.test.ts", "src/**/*.test.tsx", "src/test"]` to `tsconfig.app.json` is **not** desired: tests must type-check too. Leave `include: ["src"]`.

- [ ] **Step 4: `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/healthz": "http://localhost:8080",
      "/docs": "http://localhost:8080",
      "/openapi.yaml": "http://localhost:8080",
    },
  },
});
```

- [ ] **Step 5: `vitest.config.ts`**

```ts
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: { modules: { classNameStrategy: "non-scoped" } },
      exclude: ["e2e/**", "node_modules/**"],
      coverage: {
        provider: "v8",
        reporter: ["text", "html"],
        include: ["src/features/**"],
        exclude: ["src/features/calculator/api/schema.gen.ts", "**/*.test.*"],
      },
    },
  }),
);
```

- [ ] **Step 6: `src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
```

- [ ] **Step 7: `eslint.config.js`** — extend the template's flat config with `jsx-a11y` and Prettier:

```js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "coverage", "playwright-report", "test-results", "src/features/calculator/api/schema.gen.ts"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
      prettier,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
]);
```

If the installed template exports a different shape (e.g. `reactHooks.configs["recommended-latest"]`), keep the template's name for that entry.

- [ ] **Step 8: `.prettierrc` and `.prettierignore`**

```json
{ "printWidth": 100, "singleQuote": false, "trailingComma": "all" }
```

```
dist
coverage
playwright-report
test-results
src/features/calculator/api/schema.gen.ts
package-lock.json
```

- [ ] **Step 9: Styles**

`src/styles/reset.css` — a minimal modern reset: `*,*::before,*::after{box-sizing:border-box}`, `body{margin:0;-webkit-font-smoothing:antialiased}`, `button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}`, `html,body,#root{height:100%}`.

`src/styles/tokens.css`:

```css
:root {
  color-scheme: light dark;

  /* colour — light */
  --color-bg: #f2f2f7;
  --color-surface: #ffffff;
  --color-key: #e5e5ea;
  --color-key-pressed: #d1d1d6;
  --color-key-function: #d1d1d6;
  --color-text: #1c1c1e;
  --color-text-muted: #6e6e73;
  --color-accent: #8a2be2;
  --color-accent-pressed: #7424c0;
  --color-on-accent: #ffffff;
  --color-error: #d0342c;
  --color-border: rgba(0, 0, 0, 0.08);
  --shadow-card: 0 20px 60px rgba(0, 0, 0, 0.12);

  /* shape */
  --radius-key: 18px;
  --radius-card: 28px;

  /* spacing (4pt grid) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  /* type */
  --font-ui: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --text-display-lg: clamp(44px, 10vw, 64px);
  --text-display-md: clamp(32px, 7vw, 44px);
  --text-display-sm: clamp(22px, 5vw, 30px);
  --text-key: 26px;
  --text-expression: 17px;
  --text-body: 15px;

  /* motion */
  --motion-fast: 120ms;
  --motion-base: 220ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #000000;
    --color-surface: #1c1c1e;
    --color-key: #2c2c2e;
    --color-key-pressed: #3a3a3c;
    --color-key-function: #48484a;
    --color-text: #f5f5f7;
    --color-text-muted: #98989d;
    --color-accent: #a259ff;
    --color-accent-pressed: #8a2be2;
    --color-error: #ff6b6b;
    --color-border: rgba(255, 255, 255, 0.08);
    --shadow-card: 0 20px 60px rgba(0, 0, 0, 0.6);
  }
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-fast: 0ms;
    --motion-base: 0ms;
  }
}
```

`src/styles/global.css`:

```css
@import "./reset.css";
@import "./tokens.css";

body {
  font-family: var(--font-ui);
  font-size: var(--text-body);
  color: var(--color-text);
  background: var(--color-bg);
}

:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

- [ ] **Step 10: `index.html`, `main.tsx`, `App.tsx`**

`index.html`: title `Sezzle Calculator`, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `<meta name="color-scheme" content="light dark">`, `<meta name="description" content="A decimal-exact calculator backed by a Go API.">`.

`src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import "./styles/global.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
```

`src/App.tsx` for now:

```tsx
export default function App() {
  return <main>Sezzle Calculator</main>;
}
```

- [ ] **Step 11: Verify**

```bash
npm run lint && npm run format:check && npm run typecheck && npm run build && npm test
```

Expected: all clean; `npm test` reports "No test files found" (exit 0 — if Vitest exits 1 on no tests, add `passWithNoTests: true` to `vitest.config.ts` and remove it in Task 16).

- [ ] **Step 12: Commit**

```bash
cd /var/www/html/sezzle
git add web
git commit -m "chore(web): scaffold Vite React TypeScript app"
```

### Task 15: Generate API types from OpenAPI

**Files:**
- Create: `web/src/features/calculator/api/schema.gen.ts` (generated)

- [ ] **Step 1: Generate**

```bash
cd web && npm run gen
```

Expected: file created with `export interface paths { "/api/v1/add": { post: … } … }` and `components.schemas.Response`, `components.schemas.Problem`.

- [ ] **Step 2: Add a header comment to the top of the file? No.** The file is regenerated by CI; never hand-edit it. The lint/prettier ignores from Task 14 already cover it.

- [ ] **Step 3: Commit**

```bash
git add src/features/calculator/api/schema.gen.ts
git commit -m "feat(web): generate API types from OpenAPI"
```

### Task 16: Calculator reducer (pure state machine)

**Files:**
- Create: `web/src/features/calculator/model/types.ts`, `web/src/features/calculator/model/reducer.ts`, `web/src/features/calculator/model/reducer.test.ts`

- [ ] **Step 1: Define `types.ts`**

```ts
import type { components } from "../api/schema.gen";

export type Problem = components["schemas"]["Problem"];
export type ApiResponse = components["schemas"]["Response"];

export type BinaryOperator = "add" | "subtract" | "multiply" | "divide" | "power";
export type UnaryOperator = "sqrt" | "percent";

export const OPERATOR_SYMBOL: Record<BinaryOperator, string> = {
  add: "+",
  subtract: "−",
  multiply: "×",
  divide: "÷",
  power: "^",
};

export type Phase =
  | "idle"
  | "enteringFirst"
  | "operatorChosen"
  | "enteringSecond"
  | "awaitingResult"
  | "result"
  | "error";

export type PendingCall =
  | {
      kind: "binary";
      operator: BinaryOperator;
      a: string;
      b: string;
      /** What to do with the result: show it, or use it as the first operand of nextOperator. */
      then: { type: "show" } | { type: "chain"; nextOperator: BinaryOperator };
    }
  | { kind: "sqrt"; value: string; resume: Phase }
  | { kind: "percent"; value: string; percent: string; resume: Phase };

export type CalculatorError =
  | { kind: "api"; problem: Problem }
  | { kind: "network"; message: string };

export interface CalculatorState {
  phase: Phase;
  /** Raw digits shown on the display, e.g. "12.5" or "0". */
  display: string;
  /** Small line above the display, e.g. "2 + 3" or "√16". */
  expression: string | null;
  firstOperand: string | null;
  operator: BinaryOperator | null;
  /** When true the next digit replaces the display instead of appending. */
  fresh: boolean;
  pending: PendingCall | null;
  error: CalculatorError | null;
}

export type CalculatorEvent =
  | { type: "digit"; digit: string }
  | { type: "decimal" }
  | { type: "operator"; operator: BinaryOperator }
  | { type: "equals" }
  | { type: "allClear" }
  | { type: "backspace" }
  | { type: "toggleSign" }
  | { type: "unary"; operator: UnaryOperator }
  | { type: "recall"; value: string }
  | { type: "resultReceived"; result: string }
  | { type: "apiFailed"; error: CalculatorError };

export const MAX_INPUT_DIGITS = 16;
```

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { initialState, reduce } from "./reducer";
import type { CalculatorEvent, CalculatorState } from "./types";

/** Applies a compact key script: digits, ".", "+-*/^" operators, "=" , "C" (AC), "<" (backspace), "~" (toggle sign), "r" (sqrt), "%" (percent). */
function run(script: string, from: CalculatorState = initialState): CalculatorState {
  const ops: Record<string, CalculatorEvent> = {
    "+": { type: "operator", operator: "add" },
    "-": { type: "operator", operator: "subtract" },
    "*": { type: "operator", operator: "multiply" },
    "/": { type: "operator", operator: "divide" },
    "^": { type: "operator", operator: "power" },
    "=": { type: "equals" },
    C: { type: "allClear" },
    "<": { type: "backspace" },
    "~": { type: "toggleSign" },
    r: { type: "unary", operator: "sqrt" },
    "%": { type: "unary", operator: "percent" },
    ".": { type: "decimal" },
  };
  return [...script].reduce((state, ch) => {
    const event = ops[ch] ?? ({ type: "digit", digit: ch } as const);
    return reduce(state, event);
  }, from);
}

describe("entering numbers", () => {
  it("starts at 0", () => {
    expect(initialState.display).toBe("0");
    expect(initialState.phase).toBe("idle");
  });
  it("appends digits and collapses leading zeros", () => {
    expect(run("007").display).toBe("7");
    expect(run("120").display).toBe("120");
  });
  it("adds a single decimal point", () => {
    expect(run("1.5").display).toBe("1.5");
    expect(run("1.5.2").display).toBe("1.52");
    expect(run(".5").display).toBe("0.5");
  });
  it("caps input at 16 digits", () => {
    expect(run("12345678901234567890").display).toBe("1234567890123456");
    expect(run("0.12345678901234567890").display).toBe("0.1234567890123456");
  });
  it("backspace removes the last digit and bottoms out at 0", () => {
    expect(run("123<").display).toBe("12");
    expect(run("1<").display).toBe("0");
    expect(run("1<<").display).toBe("0");
    expect(run("-5<", { ...initialState }).display).toBe("0");
  });
  it("toggles sign", () => {
    expect(run("5~").display).toBe("-5");
    expect(run("5~~").display).toBe("5");
    expect(run("0~").display).toBe("0");
  });
});

describe("binary operations", () => {
  it("chooses an operator and keeps the display until the next digit", () => {
    const s = run("12+");
    expect(s.phase).toBe("operatorChosen");
    expect(s.firstOperand).toBe("12");
    expect(s.operator).toBe("add");
    expect(s.display).toBe("12");
    expect(s.expression).toBe("12 +");
  });
  it("replaces the operator if pressed twice", () => {
    expect(run("12+*").operator).toBe("multiply");
  });
  it("enters the second operand fresh", () => {
    const s = run("12+3");
    expect(s.phase).toBe("enteringSecond");
    expect(s.display).toBe("3");
  });
  it("equals requests a binary call", () => {
    const s = run("12+3=");
    expect(s.phase).toBe("awaitingResult");
    expect(s.pending).toEqual({
      kind: "binary",
      operator: "add",
      a: "12",
      b: "3",
      then: { type: "show" },
    });
  });
  it("equals without a second operand is a no-op", () => {
    const s = run("12+=");
    expect(s.pending).toBeNull();
    expect(s.phase).toBe("operatorChosen");
  });
  it("chaining evaluates the previous pair first", () => {
    const s = run("2+3+");
    expect(s.phase).toBe("awaitingResult");
    expect(s.pending).toEqual({
      kind: "binary",
      operator: "add",
      a: "2",
      b: "3",
      then: { type: "chain", nextOperator: "add" },
    });
  });
  it("ignores input while awaiting a result", () => {
    const s = run("2+3=");
    expect(run("9", s)).toBe(s);
    expect(run("+", s)).toBe(s);
  });
  it("shows the result", () => {
    const s = reduce(run("2+3="), { type: "resultReceived", result: "5" });
    expect(s.phase).toBe("result");
    expect(s.display).toBe("5");
    expect(s.expression).toBe("2 + 3 =");
    expect(s.pending).toBeNull();
    expect(s.firstOperand).toBeNull();
  });
  it("continues a chain with the result as first operand", () => {
    const s = reduce(run("2+3+"), { type: "resultReceived", result: "5" });
    expect(s.phase).toBe("operatorChosen");
    expect(s.firstOperand).toBe("5");
    expect(s.operator).toBe("add");
    expect(s.display).toBe("5");
    expect(s.expression).toBe("5 +");
  });
  it("after a result, a digit starts over and an operator reuses the result", () => {
    const result = reduce(run("2+3="), { type: "resultReceived", result: "5" });
    expect(run("7", result).display).toBe("7");
    expect(run("7", result).firstOperand).toBeNull();
    const chained = run("*", result);
    expect(chained.firstOperand).toBe("5");
    expect(chained.phase).toBe("operatorChosen");
  });
});

describe("unary operations", () => {
  it("sqrt of the display", () => {
    const s = run("16r");
    expect(s.phase).toBe("awaitingResult");
    expect(s.pending).toEqual({ kind: "sqrt", value: "16", resume: "result" });
    expect(s.expression).toBe("√16");
  });
  it("sqrt result replaces the display and the next digit starts fresh", () => {
    const s = reduce(run("16r"), { type: "resultReceived", result: "4" });
    expect(s.display).toBe("4");
    expect(s.phase).toBe("result");
    expect(run("2", s).display).toBe("2");
  });
  it("sqrt inside a second operand resumes entering the second operand", () => {
    const s = run("2+16r");
    expect(s.pending).toEqual({ kind: "sqrt", value: "16", resume: "enteringSecond" });
    const done = reduce(s, { type: "resultReceived", result: "4" });
    expect(done.phase).toBe("enteringSecond");
    expect(done.display).toBe("4");
    expect(done.firstOperand).toBe("2");
    expect(run("=", done).pending).toEqual({
      kind: "binary",
      operator: "add",
      a: "2",
      b: "4",
      then: { type: "show" },
    });
  });
  it("percent alone divides by 100", () => {
    expect(run("50%").pending).toEqual({ kind: "percent", value: "50", percent: "1", resume: "result" });
  });
  it("percent after + or − is a percentage of the first operand", () => {
    expect(run("200+15%").pending).toEqual({
      kind: "percent",
      value: "200",
      percent: "15",
      resume: "enteringSecond",
    });
    expect(run("200-15%").pending?.kind).toBe("percent");
  });
  it("percent after × or ÷ divides the second operand by 100", () => {
    expect(run("200*15%").pending).toEqual({
      kind: "percent",
      value: "15",
      percent: "1",
      resume: "enteringSecond",
    });
  });
});

describe("errors and clearing", () => {
  it("api error shows Error and keeps typing possible", () => {
    const failed = reduce(run("1/0="), {
      type: "apiFailed",
      error: { kind: "api", problem: { type: "x", title: "Division by zero", status: 422, detail: "divisor must not be zero" } },
    });
    expect(failed.phase).toBe("error");
    expect(failed.display).toBe("Error");
    expect(failed.error?.kind).toBe("api");
    const next = run("7", failed);
    expect(next.display).toBe("7");
    expect(next.error).toBeNull();
    expect(next.phase).toBe("enteringFirst");
  });
  it("network error keeps the operands so retry is possible", () => {
    const s = run("1+2=");
    const failed = reduce(s, { type: "apiFailed", error: { kind: "network", message: "offline" } });
    expect(failed.phase).toBe("enteringSecond");
    expect(failed.display).toBe("2");
    expect(failed.firstOperand).toBe("1");
    expect(failed.error?.kind).toBe("network");
    expect(run("=", failed).pending?.kind).toBe("binary");
  });
  it("allClear resets everything", () => {
    expect(run("12+3C")).toEqual(initialState);
  });
  it("recall loads a value as the current operand", () => {
    const s = reduce(run("2+"), { type: "recall", value: "40" });
    expect(s.display).toBe("40");
    expect(s.phase).toBe("enteringSecond");
    const t = reduce(initialState, { type: "recall", value: "40" });
    expect(t.phase).toBe("result");
    expect(run("+", t).firstOperand).toBe("40");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/features/calculator/model/reducer.test.ts`
Expected: FAIL, cannot resolve `./reducer`.

- [ ] **Step 4: Implement `reducer.ts`**

```ts
import {
  MAX_INPUT_DIGITS,
  OPERATOR_SYMBOL,
  type BinaryOperator,
  type CalculatorEvent,
  type CalculatorState,
  type PendingCall,
  type Phase,
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
};

function countDigits(display: string): number {
  return display.replace(/[^0-9]/g, "").length;
}

function describe(a: string, op: BinaryOperator, b?: string): string {
  const head = `${a} ${OPERATOR_SYMBOL[op]}`;
  return b === undefined ? head : `${head} ${b}`;
}

/** Phase to return to after a unary call, given where we were. */
function resumePhaseFor(phase: Phase): Phase {
  return phase === "operatorChosen" || phase === "enteringSecond" ? "enteringSecond" : "result";
}

function startFresh(state: CalculatorState, display: string): CalculatorState {
  // A digit after a result or an error starts a new calculation.
  const base = state.phase === "result" || state.phase === "error" ? initialState : state;
  return {
    ...base,
    display,
    fresh: false,
    error: null,
    phase: base.phase === "operatorChosen" ? "enteringSecond" : "enteringFirst",
    expression: base.phase === "operatorChosen" ? base.expression : null,
  };
}

export function reduce(state: CalculatorState, event: CalculatorEvent): CalculatorState {
  if (state.phase === "awaitingResult" && event.type !== "resultReceived" && event.type !== "apiFailed" && event.type !== "allClear") {
    return state;
  }

  switch (event.type) {
    case "allClear":
      return initialState;

    case "digit": {
      if (state.fresh || state.phase === "result" || state.phase === "error") {
        return startFresh(state, event.digit);
      }
      if (countDigits(state.display) >= MAX_INPUT_DIGITS) return state;
      const display = state.display === "0" ? event.digit : state.display + event.digit;
      return { ...state, display, error: null };
    }

    case "decimal": {
      if (state.fresh || state.phase === "result" || state.phase === "error") {
        return startFresh(state, "0.");
      }
      if (state.display.includes(".")) return state;
      return { ...state, display: state.display + "." };
    }

    case "backspace": {
      if (state.fresh || state.phase === "result" || state.phase === "error") return state;
      const trimmed = state.display.slice(0, -1);
      const display = trimmed === "" || trimmed === "-" || trimmed === "-0" ? "0" : trimmed;
      return { ...state, display };
    }

    case "toggleSign": {
      if (state.display === "0" || state.display === "Error") return state;
      const display = state.display.startsWith("-") ? state.display.slice(1) : `-${state.display}`;
      const phase: Phase = state.phase === "operatorChosen" ? "enteringSecond" : state.phase;
      return { ...state, display, phase, fresh: false };
    }

    case "operator": {
      if (state.phase === "error") return state;
      // "2 + 3 +" → evaluate 2 + 3 first, then chain.
      if (state.phase === "enteringSecond" && state.firstOperand !== null && state.operator !== null) {
        const pending: PendingCall = {
          kind: "binary",
          operator: state.operator,
          a: state.firstOperand,
          b: state.display,
          then: { type: "chain", nextOperator: event.operator },
        };
        return { ...state, phase: "awaitingResult", pending, expression: describe(state.firstOperand, state.operator, state.display) };
      }
      return {
        ...state,
        phase: "operatorChosen",
        firstOperand: state.display,
        operator: event.operator,
        expression: describe(state.display, event.operator),
        fresh: true,
        error: null,
      };
    }

    case "equals": {
      if (state.phase !== "enteringSecond" || state.firstOperand === null || state.operator === null) return state;
      const pending: PendingCall = {
        kind: "binary",
        operator: state.operator,
        a: state.firstOperand,
        b: state.display,
        then: { type: "show" },
      };
      return { ...state, phase: "awaitingResult", pending, expression: describe(state.firstOperand, state.operator, state.display) };
    }

    case "unary": {
      if (state.phase === "error" || state.display === "Error") return state;
      const resume = resumePhaseFor(state.phase);
      if (event.operator === "sqrt") {
        return { ...state, phase: "awaitingResult", pending: { kind: "sqrt", value: state.display, resume }, expression: `√${state.display}` };
      }
      const additive = state.operator === "add" || state.operator === "subtract";
      const pending: PendingCall =
        resume === "enteringSecond" && additive && state.firstOperand !== null
          ? { kind: "percent", value: state.firstOperand, percent: state.display, resume }
          : { kind: "percent", value: state.display, percent: "1", resume };
      return { ...state, phase: "awaitingResult", pending, expression: `${state.display}%` };
    }

    case "recall": {
      if (state.phase === "operatorChosen" || state.phase === "enteringSecond") {
        return { ...state, display: event.value, phase: "enteringSecond", fresh: true, error: null };
      }
      return { ...initialState, display: event.value, phase: "result", fresh: true };
    }

    case "resultReceived": {
      const pending = state.pending;
      if (!pending) return state;
      if (pending.kind === "binary") {
        if (pending.then.type === "chain") {
          const op = pending.then.nextOperator;
          return { ...initialState, phase: "operatorChosen", display: event.result, firstOperand: event.result, operator: op, expression: describe(event.result, op), fresh: true };
        }
        return { ...initialState, phase: "result", display: event.result, expression: `${describe(pending.a, pending.operator, pending.b)} =`, fresh: true };
      }
      // unary
      if (pending.resume === "enteringSecond") {
        return { ...state, phase: "enteringSecond", display: event.result, pending: null, fresh: true, expression: state.firstOperand && state.operator ? describe(state.firstOperand, state.operator) : null };
      }
      return { ...initialState, phase: "result", display: event.result, expression: state.expression, fresh: true };
    }

    case "apiFailed": {
      const pending = state.pending;
      if (event.error.kind === "network") {
        // Keep operands so the user can press = again.
        const phase: Phase = pending?.kind === "binary" ? "enteringSecond" : resumePhaseFor(state.phase) === "enteringSecond" ? "enteringSecond" : "enteringFirst";
        const display = pending?.kind === "binary" ? pending.b : state.display;
        return { ...state, phase, display, pending: null, error: event.error, fresh: false };
      }
      return { ...initialState, phase: "error", display: "Error", expression: state.expression, error: event.error };
    }
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/features/calculator/model/reducer.test.ts`
Expected: PASS. Iterate on the reducer until every case in the test file passes; the test file is the specification. Do not weaken tests to fit the reducer.

- [ ] **Step 6: Lint, type-check, commit**

```bash
npm run lint && npm run typecheck
git add src/features/calculator/model/
git commit -m "feat(web): calculator state machine"
```

### Task 17: Display formatting and keyboard map

**Files:**
- Create: `web/src/features/calculator/model/format.ts`, `format.test.ts`, `keymap.ts`, `keymap.test.ts`

- [ ] **Step 1: Write the failing tests**

`format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatDisplay, displaySize } from "./format";

describe("formatDisplay", () => {
  it("groups thousands and keeps what the user is typing", () => {
    expect(formatDisplay("1234")).toBe("1,234");
    expect(formatDisplay("1234567.5")).toBe("1,234,567.5");
    expect(formatDisplay("1.")).toBe("1.");
    expect(formatDisplay("1.50")).toBe("1.50");
    expect(formatDisplay("0.")).toBe("0.");
    expect(formatDisplay("-1234")).toBe("-1,234");
  });
  it("leaves short values and Error untouched", () => {
    expect(formatDisplay("0")).toBe("0");
    expect(formatDisplay("Error")).toBe("Error");
  });
  it("switches to exponent notation when a result is too long", () => {
    expect(formatDisplay("1" + "0".repeat(30))).toBe("1e+30");
    expect(formatDisplay("0.3333333333333333")).toBe("0.3333333333333333");
    expect(formatDisplay("12345678901234567890.5")).toBe("1.2345678901e+19");
  });
});

describe("displaySize", () => {
  it("shrinks as the text grows", () => {
    expect(displaySize("123")).toBe("lg");
    expect(displaySize("1,234,567,890")).toBe("md");
    expect(displaySize("1,234,567,890,123,456")).toBe("sm");
  });
});
```

`keymap.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eventForKey } from "./keymap";

describe("eventForKey", () => {
  it("maps digits, operators and controls", () => {
    expect(eventForKey("7")).toEqual({ type: "digit", digit: "7" });
    expect(eventForKey(".")).toEqual({ type: "decimal" });
    expect(eventForKey(",")).toEqual({ type: "decimal" });
    expect(eventForKey("+")).toEqual({ type: "operator", operator: "add" });
    expect(eventForKey("-")).toEqual({ type: "operator", operator: "subtract" });
    expect(eventForKey("*")).toEqual({ type: "operator", operator: "multiply" });
    expect(eventForKey("/")).toEqual({ type: "operator", operator: "divide" });
    expect(eventForKey("^")).toEqual({ type: "operator", operator: "power" });
    expect(eventForKey("%")).toEqual({ type: "unary", operator: "percent" });
    expect(eventForKey("Enter")).toEqual({ type: "equals" });
    expect(eventForKey("=")).toEqual({ type: "equals" });
    expect(eventForKey("Escape")).toEqual({ type: "allClear" });
    expect(eventForKey("Backspace")).toEqual({ type: "backspace" });
  });
  it("returns null for anything else", () => {
    expect(eventForKey("a")).toBeNull();
    expect(eventForKey("Shift")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/calculator/model/`
Expected: FAIL on the two new files.

- [ ] **Step 3: Implement `format.ts`**

```ts
const MAX_DISPLAY_CHARS = 16;

const grouper = new Intl.NumberFormat("en-US", { useGrouping: true, maximumFractionDigits: 0 });

/** Formats a raw decimal string for the display without altering what the user typed. */
export function formatDisplay(raw: string): string {
  if (raw === "Error") return raw;
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [intPart = "0", fracPart] = unsigned.split(".");

  const significant = unsigned.replace(/^0+(?=\d)/, "").replace(".", "").length;
  if (significant > MAX_DISPLAY_CHARS) {
    const n = Number(raw);
    const mantissaDigits = Math.min(10, MAX_DISPLAY_CHARS - 6);
    return Number.isFinite(n) ? trimExponent(n.toExponential(mantissaDigits)) : raw;
  }

  const groupedInt = intPart.length > 3 ? grouper.format(BigInt(intPart)) : intPart;
  const body = fracPart === undefined ? groupedInt : `${groupedInt}.${fracPart}`;
  return negative ? `-${body}` : body;
}

/** "1.2300000000e+19" → "1.23e+19" */
function trimExponent(s: string): string {
  const [mantissa = "", exp = ""] = s.split("e");
  const trimmed = mantissa.includes(".") ? mantissa.replace(/0+$/, "").replace(/\.$/, "") : mantissa;
  return `${trimmed}e${exp}`;
}

export type DisplaySize = "lg" | "md" | "sm";

/** Picks a font-size step so long values still fit. */
export function displaySize(formatted: string): DisplaySize {
  if (formatted.length <= 9) return "lg";
  if (formatted.length <= 14) return "md";
  return "sm";
}
```

Note on the test `"1" + "0".repeat(30)` → `"1e+30"`: `toExponential(10)` gives `1.0000000000e+30`, trimmed to `1e+30`. And `12345678901234567890.5` has 21 significant digits → `1.2345678901e+19` (`toExponential(10)` rounds the mantissa; the test expects exactly that output). Adjust `mantissaDigits` only if the expected strings cannot be produced, then update both consistently.

- [ ] **Step 4: Implement `keymap.ts`**

```ts
import type { CalculatorEvent } from "./types";

const KEYS: Record<string, CalculatorEvent> = {
  ".": { type: "decimal" },
  ",": { type: "decimal" },
  "+": { type: "operator", operator: "add" },
  "-": { type: "operator", operator: "subtract" },
  "*": { type: "operator", operator: "multiply" },
  "/": { type: "operator", operator: "divide" },
  "^": { type: "operator", operator: "power" },
  "%": { type: "unary", operator: "percent" },
  Enter: { type: "equals" },
  "=": { type: "equals" },
  Escape: { type: "allClear" },
  Backspace: { type: "backspace" },
};

/** Maps a KeyboardEvent.key to a calculator event, or null if the key is not bound. */
export function eventForKey(key: string): CalculatorEvent | null {
  if (/^[0-9]$/.test(key)) return { type: "digit", digit: key };
  return KEYS[key] ?? null;
}
```

- [ ] **Step 5: Run, lint, commit**

```bash
npx vitest run src/features/calculator/model/ && npm run lint
git add src/features/calculator/model/
git commit -m "feat(web): display formatting and keyboard map"
```

### Task 18: API client with retry/backoff

**Files:**
- Create: `web/src/features/calculator/api/client.ts`, `web/src/features/calculator/api/client.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, callOperation } from "./client";

const ok = (result: string, inputs: Record<string, string> = {}) =>
  new Response(JSON.stringify({ operation: "add", inputs, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const problem = (status: number, detail: string) =>
  new Response(JSON.stringify({ type: "x", title: "T", status, detail }), {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });

describe("callOperation", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const sleep = vi.fn(async () => undefined);

  beforeEach(() => {
    fetchMock.mockReset();
    sleep.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("posts JSON and returns the result", async () => {
    fetchMock.mockResolvedValueOnce(ok("3", { a: "1", b: "2" }));
    const res = await callOperation("add", { a: "1", b: "2" }, { sleep });
    expect(res.result).toBe("3");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v1/add");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(init?.body).toBe(JSON.stringify({ a: "1", b: "2" }));
  });

  it("throws ApiError with the problem on 4xx and does not retry", async () => {
    fetchMock.mockResolvedValueOnce(problem(422, "divisor must not be zero"));
    await expect(callOperation("divide", { a: "1", b: "0" }, { sleep })).rejects.toMatchObject({
      name: "ApiError",
      problem: { status: 422, detail: "divisor must not be zero" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries on network errors with growing delays, then succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(ok("3"));
    const res = await callOperation("add", { a: "1", b: "2" }, { sleep, random: () => 1 });
    expect(res.result).toBe("3");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([300, 600]);
  });

  it("retries on 503 and gives up after 3 attempts with NetworkError", async () => {
    fetchMock.mockResolvedValue(problem(503, "down"));
    await expect(callOperation("add", { a: "1", b: "2" }, { sleep })).rejects.toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("caps the delay and applies jitter", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await callOperation("add", { a: "1", b: "2" }, { sleep, random: () => 0.5, attempts: 5 }).catch(() => undefined);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([150, 300, 600, 1000]);
  });

  it("does not retry when aborted", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException("aborted", "AbortError"));
    });
    await expect(callOperation("add", { a: "1", b: "2" }, { sleep, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a non-JSON 500 as a NetworkError", async () => {
    fetchMock.mockResolvedValue(new Response("<html>oops</html>", { status: 500 }));
    await expect(callOperation("add", { a: "1", b: "2" }, { sleep, attempts: 1 })).rejects.toBeInstanceOf(NetworkError);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/calculator/api/`
Expected: FAIL, cannot resolve `./client`.

- [ ] **Step 3: Implement `client.ts`**

```ts
import type { components, paths } from "./schema.gen";

export type Problem = components["schemas"]["Problem"];
export type ApiResponse = components["schemas"]["Response"];

type OperationPath = Extract<keyof paths, `/api/v1/${string}`>;
export type OperationName = OperationPath extends `/api/v1/${infer Name}` ? Exclude<Name, "operations"> : never;

export class ApiError extends Error {
  readonly name = "ApiError";
  constructor(readonly problem: Problem) {
    super(problem.detail ?? problem.title);
  }
}

export class NetworkError extends Error {
  readonly name = "NetworkError";
}

export interface CallOptions {
  signal?: AbortSignal;
  /** Total attempts including the first. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const RETRYABLE = new Set([502, 503, 504]);

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * POSTs an operation to the API. Retries network failures and 502/503/504
 * with exponential backoff and full jitter; never retries other statuses.
 */
export async function callOperation(
  name: OperationName,
  inputs: Record<string, string>,
  options: CallOptions = {},
): Promise<ApiResponse> {
  const { signal, attempts = 3, baseDelayMs = 300, maxDelayMs = 2000, sleep = defaultSleep, random = Math.random } = options;

  let lastFailure = "request failed";
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)) * random();
      await sleep(delay);
    }
    let response: Response;
    try {
      response = await fetch(`/api/v1/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, application/problem+json" },
        body: JSON.stringify(inputs),
        ...(signal ? { signal } : {}),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      lastFailure = err instanceof Error ? err.message : String(err);
      continue;
    }

    if (response.ok) {
      return (await response.json()) as ApiResponse;
    }
    const problem = await readProblem(response);
    if (problem && !RETRYABLE.has(response.status)) {
      throw new ApiError(problem);
    }
    lastFailure = problem?.detail ?? `HTTP ${response.status}`;
    if (!RETRYABLE.has(response.status) && response.status < 500) break;
  }
  throw new NetworkError(lastFailure);
}

async function readProblem(response: Response): Promise<Problem | null> {
  const type = response.headers.get("Content-Type") ?? "";
  if (!type.includes("json")) return null;
  try {
    return (await response.json()) as Problem;
  } catch {
    return null;
  }
}
```

The jitter test expects `random: () => 1` to give `[300, 600]` and `random: () => 0.5` with 5 attempts to give `[150, 300, 600, 1000]` (cap 2000 × 0.5). The formula above produces exactly that.

- [ ] **Step 4: Run, lint, commit**

```bash
npx vitest run src/features/calculator/api/ && npm run lint && npm run typecheck
git add src/features/calculator/api/client.ts src/features/calculator/api/client.test.ts
git commit -m "feat(web): API client with exponential backoff"
```

### ✅ Checkpoint 2 — independent review (frontend foundation)

Message the same reviewer agent: "review `web/src/features/calculator/{model,api}` for correctness of the state machine against spec §5.2, test quality, TypeScript strictness, and the retry policy against spec §5.3". Fix, commit as `fix(web): …`, note findings for `docs/ai/corrections.md`.

---

## Part E — Frontend UI

### Task 19: Hooks: `useHistory`, `useKeyboard`, `useCalculator`

**Files:**
- Create: `web/src/features/calculator/hooks/useHistory.ts`, `useHistory.test.ts`, `useKeyboard.ts`, `useKeyboard.test.ts`, `useCalculator.ts`, `useCalculator.test.ts`
- Create: `web/src/test/server.ts` (msw handlers used by hook and component tests)

- [ ] **Step 1: msw test server** (`src/test/server.ts`)

```ts
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

type Inputs = Record<string, string>;

/** A float-based stand-in for the Go API; precise enough for UI tests. */
const compute: Record<string, (i: Inputs) => number> = {
  add: (i) => Number(i.a) + Number(i.b),
  subtract: (i) => Number(i.a) - Number(i.b),
  multiply: (i) => Number(i.a) * Number(i.b),
  divide: (i) => Number(i.a) / Number(i.b),
  power: (i) => Number(i.base) ** Number(i.exponent),
  sqrt: (i) => Math.sqrt(Number(i.value)),
  percent: (i) => (Number(i.value) * Number(i.percent)) / 100,
};

export const handlers = [
  http.post("/api/v1/:operation", async ({ params, request }) => {
    const operation = String(params.operation);
    const inputs = (await request.json()) as Inputs;
    if (operation === "divide" && Number(inputs.b) === 0) {
      return HttpResponse.json(
        { type: "x#division-by-zero", title: "Division by zero", status: 422, detail: "divisor must not be zero", instance: "/api/v1/divide" },
        { status: 422, headers: { "Content-Type": "application/problem+json" } },
      );
    }
    const fn = compute[operation];
    if (!fn) return HttpResponse.json({ type: "x#not-found", title: "Not found", status: 404 }, { status: 404 });
    return HttpResponse.json({ operation, inputs, result: String(fn(inputs)) });
  }),
];

export const server = setupServer(...handlers);
```

Add to `src/test/setup.ts`:

```ts
import { server } from "./server";
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

(`beforeAll`/`afterAll` come from `vitest`; import them.) msw needs absolute URLs in Node: set `vitest.config.ts` → `test.environmentOptions.jsdom.url = "http://localhost"` so relative `fetch("/api/v1/add")` resolves.

- [ ] **Step 2: Failing tests for `useHistory`**

```ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HISTORY_KEY, useHistory } from "./useHistory";

describe("useHistory", () => {
  it("starts empty and adds entries newest first", () => {
    const { result } = renderHook(() => useHistory());
    expect(result.current.entries).toEqual([]);
    act(() => result.current.add({ expression: "1 + 2 =", result: "3" }));
    act(() => result.current.add({ expression: "√16", result: "4" }));
    expect(result.current.entries.map((e) => e.result)).toEqual(["4", "3"]);
    expect(result.current.entries[0]?.at).toBeTypeOf("number");
  });
  it("persists to localStorage and caps at 50", () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      for (let i = 0; i < 60; i++) result.current.add({ expression: `${i} + 0 =`, result: String(i) });
    });
    expect(result.current.entries).toHaveLength(50);
    expect(JSON.parse(window.localStorage.getItem(HISTORY_KEY)!)).toHaveLength(50);
    const { result: again } = renderHook(() => useHistory());
    expect(again.current.entries[0]?.result).toBe("59");
  });
  it("clears", () => {
    const { result } = renderHook(() => useHistory());
    act(() => result.current.add({ expression: "1 + 2 =", result: "3" }));
    act(() => result.current.clear());
    expect(result.current.entries).toEqual([]);
    expect(window.localStorage.getItem(HISTORY_KEY)).toBeNull();
  });
  it("ignores corrupt storage", () => {
    window.localStorage.setItem(HISTORY_KEY, "{not json");
    const { result } = renderHook(() => useHistory());
    expect(result.current.entries).toEqual([]);
  });
});
```

- [ ] **Step 3: Implement `useHistory.ts`**

```ts
import { useCallback, useState } from "react";

export const HISTORY_KEY = "sezzle-calculator.history.v1";
const MAX_ENTRIES = 50;

export interface HistoryEntry {
  expression: string;
  result: string;
  at: number;
}

function load(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]).slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

function save(entries: HistoryEntry[]) {
  try {
    if (entries.length === 0) window.localStorage.removeItem(HISTORY_KEY);
    else window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable: history is in-memory only */
  }
}

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(load);

  const add = useCallback((entry: Omit<HistoryEntry, "at">) => {
    setEntries((prev) => {
      const next = [{ ...entry, at: Date.now() }, ...prev].slice(0, MAX_ENTRIES);
      save(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
    save([]);
  }, []);

  return { entries, add, clear };
}
```

- [ ] **Step 4: Failing tests for `useKeyboard`**

```ts
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useKeyboard } from "./useKeyboard";

describe("useKeyboard", () => {
  it("dispatches mapped keys and ignores others and modifier combos", () => {
    const send = vi.fn();
    renderHook(() => useKeyboard(send));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "7" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "7", ctrlKey: true }));
    expect(send.mock.calls).toEqual([[{ type: "digit", digit: "7" }], [{ type: "equals" }]]);
  });
  it("prevents default on handled keys so / does not open quick find", () => {
    const send = vi.fn();
    renderHook(() => useKeyboard(send));
    const ev = new KeyboardEvent("keydown", { key: "/", cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
```

- [ ] **Step 5: Implement `useKeyboard.ts`**

```ts
import { useEffect } from "react";
import { eventForKey } from "../model/keymap";
import type { CalculatorEvent } from "../model/types";

/** Binds the physical keyboard to the calculator while the component is mounted. */
export function useKeyboard(send: (event: CalculatorEvent) => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const event = eventForKey(e.key);
      if (!event) return;
      e.preventDefault();
      send(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [send]);
}
```

- [ ] **Step 6: Failing tests for `useCalculator`**

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../test/server";
import { useCalculator } from "./useCalculator";

describe("useCalculator", () => {
  it("performs a binary operation through the API and records history", async () => {
    const { result } = renderHook(() => useCalculator());
    act(() => {
      result.current.send({ type: "digit", digit: "1" });
      result.current.send({ type: "operator", operator: "add" });
      result.current.send({ type: "digit", digit: "2" });
      result.current.send({ type: "equals" });
    });
    expect(result.current.state.phase).toBe("awaitingResult");
    await waitFor(() => expect(result.current.state.phase).toBe("result"));
    expect(result.current.state.display).toBe("3");
    expect(result.current.history.entries[0]).toMatchObject({ expression: "1 + 2 =", result: "3" });
  });

  it("surfaces an API problem as an error state", async () => {
    const { result } = renderHook(() => useCalculator());
    act(() => {
      result.current.send({ type: "digit", digit: "1" });
      result.current.send({ type: "operator", operator: "divide" });
      result.current.send({ type: "digit", digit: "0" });
      result.current.send({ type: "equals" });
    });
    await waitFor(() => expect(result.current.state.phase).toBe("error"));
    expect(result.current.state.error).toMatchObject({ kind: "api", problem: { status: 422 } });
    expect(result.current.history.entries).toHaveLength(0);
  });

  it("reports a network failure and allows retry", async () => {
    server.use(http.post("/api/v1/add", () => HttpResponse.error()));
    const { result } = renderHook(() => useCalculator({ attempts: 1 }));
    act(() => {
      result.current.send({ type: "digit", digit: "1" });
      result.current.send({ type: "operator", operator: "add" });
      result.current.send({ type: "digit", digit: "2" });
      result.current.send({ type: "equals" });
    });
    await waitFor(() => expect(result.current.state.error?.kind).toBe("network"));
    server.resetHandlers();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.display).toBe("3"));
  });

  it("records unary operations in history", async () => {
    const { result } = renderHook(() => useCalculator());
    act(() => {
      result.current.send({ type: "digit", digit: "1" });
      result.current.send({ type: "digit", digit: "6" });
      result.current.send({ type: "unary", operator: "sqrt" });
    });
    await waitFor(() => expect(result.current.state.display).toBe("4"));
    expect(result.current.history.entries[0]).toMatchObject({ expression: "√16", result: "4" });
  });
});
```

- [ ] **Step 7: Implement `useCalculator.ts`**

```ts
import { useCallback, useEffect, useReducer, useRef } from "react";
import { ApiError, callOperation, type CallOptions } from "../api/client";
import { initialState, reduce } from "../model/reducer";
import { OPERATOR_SYMBOL, type CalculatorEvent, type PendingCall } from "../model/types";
import { useHistory } from "./useHistory";

function requestFor(pending: PendingCall): { name: Parameters<typeof callOperation>[0]; inputs: Record<string, string> } {
  switch (pending.kind) {
    case "binary":
      return pending.operator === "power"
        ? { name: "power", inputs: { base: pending.a, exponent: pending.b } }
        : { name: pending.operator, inputs: { a: pending.a, b: pending.b } };
    case "sqrt":
      return { name: "sqrt", inputs: { value: pending.value } };
    case "percent":
      return { name: "percent", inputs: { value: pending.value, percent: pending.percent } };
  }
}

function historyExpression(pending: PendingCall): string {
  switch (pending.kind) {
    case "binary":
      return `${pending.a} ${OPERATOR_SYMBOL[pending.operator]} ${pending.b} =`;
    case "sqrt":
      return `√${pending.value}`;
    case "percent":
      return pending.percent === "1" ? `${pending.value}%` : `${pending.percent}% of ${pending.value}`;
  }
}

/** Owns the calculator state, performs the API calls the reducer asks for, and feeds history. */
export function useCalculator(callOptions: Pick<CallOptions, "attempts" | "baseDelayMs"> = {}) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const history = useHistory();
  const abortRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(callOptions);

  const send = useCallback((event: CalculatorEvent) => dispatch(event), []);

  useEffect(() => {
    const pending = state.pending;
    if (!pending || state.phase !== "awaitingResult") return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { name, inputs } = requestFor(pending);

    callOperation(name, inputs, { ...optionsRef.current, signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        dispatch({ type: "resultReceived", result: response.result });
        // Chained intermediate results are not history entries; only shown results are.
        if (pending.kind !== "binary" || pending.then.type === "show") {
          history.add({ expression: historyExpression(pending), result: response.result });
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError) {
          dispatch({ type: "apiFailed", error: { kind: "api", problem: err.problem } });
        } else {
          dispatch({ type: "apiFailed", error: { kind: "network", message: err instanceof Error ? err.message : "request failed" } });
        }
      });

    return () => controller.abort();
  }, [state.pending, state.phase, history.add]);

  /** Re-issues the last calculation after a network failure. */
  const retry = useCallback(() => dispatch({ type: "equals" }), []);

  return { state, send, retry, history };
}
```

If `react-hooks/exhaustive-deps` complains about `history`, destructure `const { add } = history` and depend on `add`.

- [ ] **Step 8: Run, lint, commit**

```bash
npx vitest run src/features/calculator/hooks/ && npm run lint && npm run typecheck
git add src/test/ src/features/calculator/hooks/ vitest.config.ts
git commit -m "feat(web): calculator, history and keyboard hooks"
```

### Task 20: `Key`, `Keypad`, `Display` components

**Files:**
- Create: `web/src/features/calculator/ui/Key.tsx`, `Key.module.css`, `Keypad.tsx`, `Keypad.module.css`, `keys.ts`, `Display.tsx`, `Display.module.css`, `Display.test.tsx`, `Keypad.test.tsx`

- [ ] **Step 1: Failing component tests**

`Display.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Display } from "./Display";

describe("Display", () => {
  it("shows the formatted value in a live region with the expression above", () => {
    render(<Display value="1234.5" expression="2 + 3" pending={false} error={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("1,234.5");
    expect(screen.getByText("2 + 3")).toBeInTheDocument();
  });
  it("marks pending and error states", () => {
    const { rerender } = render(<Display value="1" expression={null} pending error={null} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    rerender(<Display value="Error" expression={null} pending={false} error={{ kind: "api", problem: { type: "x", title: "Division by zero", status: 422, detail: "divisor must not be zero" } }} />);
    expect(screen.getByText("divisor must not be zero")).toBeInTheDocument();
  });
});
```

`Keypad.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Keypad } from "./Keypad";

describe("Keypad", () => {
  it("renders accessible keys and sends events", async () => {
    const send = vi.fn();
    render(<Keypad send={send} activeOperator={null} />);
    await userEvent.click(screen.getByRole("button", { name: "7" }));
    await userEvent.click(screen.getByRole("button", { name: "multiply" }));
    await userEvent.click(screen.getByRole("button", { name: "equals" }));
    expect(send.mock.calls).toEqual([
      [{ type: "digit", digit: "7" }],
      [{ type: "operator", operator: "multiply" }],
      [{ type: "equals" }],
    ]);
  });
  it("marks the active operator as pressed", () => {
    render(<Keypad send={vi.fn()} activeOperator="add" />);
    expect(screen.getByRole("button", { name: "add" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "multiply" })).toHaveAttribute("aria-pressed", "false");
  });
});
```

- [ ] **Step 2: `keys.ts`** — the keypad layout as data (4 columns, 6 rows)

```ts
import type { BinaryOperator, CalculatorEvent } from "../model/types";

export type KeyVariant = "digit" | "operator" | "function" | "equals";

export interface KeyDef {
  id: string;
  label: string;
  ariaLabel: string;
  event: CalculatorEvent;
  variant: KeyVariant;
  /** Grid column span. */
  span?: 2;
  /** Grid row span. */
  rowSpan?: 2;
  operator?: BinaryOperator;
}

const digit = (d: string): KeyDef => ({ id: d, label: d, ariaLabel: d, event: { type: "digit", digit: d }, variant: "digit" });
const op = (operator: BinaryOperator, label: string): KeyDef => ({
  id: operator,
  label,
  ariaLabel: operator,
  event: { type: "operator", operator },
  variant: "operator",
  operator,
});

export const KEYS: KeyDef[] = [
  { id: "ac", label: "AC", ariaLabel: "all clear", event: { type: "allClear" }, variant: "function" },
  { id: "backspace", label: "⌫", ariaLabel: "backspace", event: { type: "backspace" }, variant: "function" },
  { id: "percent", label: "%", ariaLabel: "percent", event: { type: "unary", operator: "percent" }, variant: "function" },
  op("divide", "÷"),
  { id: "sqrt", label: "√", ariaLabel: "square root", event: { type: "unary", operator: "sqrt" }, variant: "function" },
  op("power", "xʸ"),
  { id: "sign", label: "±", ariaLabel: "toggle sign", event: { type: "toggleSign" }, variant: "function" },
  op("multiply", "×"),
  digit("7"), digit("8"), digit("9"), op("subtract", "−"),
  digit("4"), digit("5"), digit("6"), op("add", "+"),
  digit("1"), digit("2"), digit("3"),
  { id: "equals", label: "=", ariaLabel: "equals", event: { type: "equals" }, variant: "equals", rowSpan: 2 },
  { ...digit("0"), span: 2 },
  { id: "decimal", label: ".", ariaLabel: "decimal point", event: { type: "decimal" }, variant: "digit" },
];
```

- [ ] **Step 3: `Key.tsx` + `Key.module.css`**

```tsx
import { motion } from "motion/react";
import type { KeyDef } from "./keys";
import styles from "./Key.module.css";

interface KeyProps {
  def: KeyDef;
  active?: boolean;
  onPress: (def: KeyDef) => void;
}

export function Key({ def, active = false, onPress }: KeyProps) {
  const isOperator = def.variant === "operator";
  return (
    <motion.button
      type="button"
      className={`${styles.key} ${styles[def.variant]} ${active ? styles.active : ""}`}
      style={{ gridColumn: def.span ? `span ${def.span}` : undefined, gridRow: def.rowSpan ? `span ${def.rowSpan}` : undefined }}
      aria-label={def.ariaLabel}
      aria-pressed={isOperator ? active : undefined}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      onClick={() => onPress(def)}
    >
      {def.label}
    </motion.button>
  );
}
```

```css
.key {
  display: grid;
  place-items: center;
  min-height: 56px;
  border-radius: var(--radius-key);
  font-size: var(--text-key);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  background: var(--color-key);
  color: var(--color-text);
  transition: background var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard);
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.key:hover { background: var(--color-key-pressed); }
.digit { }
.function { background: var(--color-key-function); }
.operator { background: var(--color-accent); color: var(--color-on-accent); }
.operator:hover { background: var(--color-accent-pressed); }
.operator.active { background: var(--color-surface); color: var(--color-accent); box-shadow: inset 0 0 0 2px var(--color-accent); }
.equals { background: var(--color-accent); color: var(--color-on-accent); }
.equals:hover { background: var(--color-accent-pressed); }
```

- [ ] **Step 4: `Keypad.tsx` + `Keypad.module.css`**

```tsx
import type { BinaryOperator, CalculatorEvent } from "../model/types";
import { Key } from "./Key";
import { KEYS } from "./keys";
import styles from "./Keypad.module.css";

interface KeypadProps {
  send: (event: CalculatorEvent) => void;
  activeOperator: BinaryOperator | null;
}

export function Keypad({ send, activeOperator }: KeypadProps) {
  return (
    <div className={styles.grid} role="group" aria-label="calculator keys">
      {KEYS.map((def) => (
        <Key key={def.id} def={def} active={def.operator !== undefined && def.operator === activeOperator} onPress={(d) => send(d.event)} />
      ))}
    </div>
  );
}
```

```css
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: 1fr;
  gap: var(--space-3);
}
```

- [ ] **Step 5: `Display.tsx` + `Display.module.css`**

```tsx
import { AnimatePresence, motion } from "motion/react";
import { displaySize, formatDisplay } from "../model/format";
import type { CalculatorError } from "../model/types";
import styles from "./Display.module.css";

interface DisplayProps {
  value: string;
  expression: string | null;
  pending: boolean;
  error: CalculatorError | null;
}

export function Display({ value, expression, pending, error }: DisplayProps) {
  const formatted = formatDisplay(value);
  const detail = error?.kind === "api" ? (error.problem.detail ?? error.problem.title) : null;
  return (
    <section className={styles.display} aria-label="display">
      <div className={styles.expression} aria-hidden={expression === null && detail === null}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={detail ?? expression ?? "empty"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className={detail ? styles.detail : undefined}
          >
            {detail ?? expression ?? " "}
          </motion.span>
        </AnimatePresence>
      </div>
      <motion.output
        role="status"
        aria-live="polite"
        aria-busy={pending}
        className={`${styles.value} ${styles[displaySize(formatted)]} ${error ? styles.error : ""} ${pending ? styles.pending : ""}`}
        animate={error?.kind === "api" ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.35 }}
      >
        {formatted}
      </motion.output>
    </section>
  );
}
```

```css
.display {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-end;
  gap: var(--space-1);
  min-height: 128px;
  padding: var(--space-4) var(--space-2);
  overflow: hidden;
}
.expression {
  min-height: 1.4em;
  font-size: var(--text-expression);
  color: var(--color-text-muted);
  white-space: nowrap;
}
.detail { color: var(--color-error); }
.value {
  max-width: 100%;
  font-weight: 300;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1.1;
  white-space: nowrap;
  transition: opacity var(--motion-base) var(--ease-standard), font-size var(--motion-base) var(--ease-standard);
}
.lg { font-size: var(--text-display-lg); }
.md { font-size: var(--text-display-md); }
.sm { font-size: var(--text-display-sm); }
.error { color: var(--color-error); }
.pending { animation: pulse 900ms var(--ease-standard) infinite alternate; }
@keyframes pulse { from { opacity: 1; } to { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { .pending { animation: none; opacity: 0.6; } }
```

- [ ] **Step 6: Run tests, lint, commit**

```bash
npx vitest run src/features/calculator/ui/ && npm run lint && npm run typecheck
git add src/features/calculator/ui/
git commit -m "feat(web): display and keypad components"
```

### Task 21: `HistoryPanel`, `StatusBanner`, `Calculator`, `App`

**Files:**
- Create: `web/src/features/calculator/ui/HistoryPanel.tsx`, `HistoryPanel.module.css`, `StatusBanner.tsx`, `StatusBanner.module.css`, `Calculator.tsx`, `Calculator.module.css`, `Calculator.test.tsx`, `HistoryPanel.test.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Failing tests**

`HistoryPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HistoryPanel } from "./HistoryPanel";

const entries = [
  { expression: "1 + 2 =", result: "3", at: 1 },
  { expression: "√16", result: "4", at: 2 },
];

describe("HistoryPanel", () => {
  it("lists entries and recalls a result", async () => {
    const onRecall = vi.fn();
    render(<HistoryPanel open entries={entries} onRecall={onRecall} onClear={vi.fn()} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /1 \+ 2 =.*3/ }));
    expect(onRecall).toHaveBeenCalledWith("3");
  });
  it("asks for confirmation before clearing", async () => {
    const onClear = vi.fn();
    render(<HistoryPanel open entries={entries} onRecall={vi.fn()} onClear={onClear} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "clear history" }));
    expect(onClear).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "confirm clear" }));
    expect(onClear).toHaveBeenCalled();
  });
  it("shows an empty state", () => {
    render(<HistoryPanel open entries={[]} onRecall={vi.fn()} onClear={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/no calculations yet/i)).toBeInTheDocument();
  });
});
```

`Calculator.test.tsx` (integration through msw):

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../test/server";
import { Calculator } from "./Calculator";

const click = async (name: string) => userEvent.click(screen.getByRole("button", { name }));

describe("Calculator", () => {
  it("computes 1 + 2 = 3 through the API", async () => {
    render(<Calculator />);
    await click("1");
    await click("add");
    await click("2");
    await click("equals");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("3"));
    expect(screen.getByText("1 + 2 =")).toBeInTheDocument();
  });
  it("shows Error with the API detail on division by zero", async () => {
    render(<Calculator />);
    await click("1");
    await click("divide");
    await click("0");
    await click("equals");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Error"));
    expect(screen.getByText("divisor must not be zero")).toBeInTheDocument();
  });
  it("shows a banner when the API is unreachable and recovers on retry", async () => {
    server.use(http.post("/api/v1/add", () => HttpResponse.error()));
    render(<Calculator callOptions={{ attempts: 1 }} />);
    await click("1");
    await click("add");
    await click("2");
    await click("equals");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/can't reach/i));
    server.resetHandlers();
    await userEvent.click(screen.getByRole("button", { name: "retry" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("3"));
  });
  it("supports the physical keyboard", async () => {
    render(<Calculator />);
    await userEvent.keyboard("2*3{Enter}");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("6"));
  });
  it("recalls a history entry", async () => {
    render(<Calculator />);
    await userEvent.keyboard("2*3{Enter}");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("6"));
    await click("history");
    await userEvent.click(screen.getByRole("button", { name: /2 × 3 =.*6/ }));
    await click("add");
    await click("1");
    await click("equals");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("7"));
  });
});
```

- [ ] **Step 2: `StatusBanner.tsx`**

```tsx
import { AnimatePresence, motion } from "motion/react";
import styles from "./StatusBanner.module.css";

interface StatusBannerProps {
  message: string | null;
  onRetry: () => void;
}

export function StatusBanner({ message, onRetry }: StatusBannerProps) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          role="alert"
          className={styles.banner}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        >
          <span>{message}</span>
          <button type="button" className={styles.retry} onClick={onRetry} aria-label="retry">
            Retry
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

CSS: full-width pill at the top of the card, `background: var(--color-error)`, white text, `border-radius: var(--radius-key)`, `padding: var(--space-2) var(--space-4)`, flex with space-between; `.retry` is an underlined text button.

- [ ] **Step 3: `HistoryPanel.tsx`**

Props: `open: boolean`, `entries: HistoryEntry[]`, `onRecall(result: string)`, `onClear()`, `onClose()`. Behaviour:
- `AnimatePresence` + `motion.aside` with `aria-label="history"`; desktop slides from the right (`x: 24 → 0`), mobile is a bottom sheet (`y: "100%" → 0`); pick by a `matchMedia("(max-width: 720px)")` check at render time via a tiny `useMediaQuery` inline hook.
- Header row: title "History", a close button (`aria-label="close history"`), and a clear button (`aria-label="clear history"`) that turns into two buttons "Cancel" / "Clear" (`aria-label="confirm clear"`) for 4 seconds or until clicked.
- Entries as `<ul>` of `<li><button>` where the accessible name is `${expression} ${result}` (expression in muted small text, result in bold); click → `onRecall(result)` then `onClose()`.
- Empty state text: "No calculations yet."
- `motion.li` with `layout` and `initial={{opacity:0, y:8}}` so new entries slide in.

CSS: `width: min(320px, 100%)`, surface background, `border-left: 1px solid var(--color-border)` on desktop; on mobile fixed to bottom with `border-radius: var(--radius-card) var(--radius-card) 0 0` and max-height 60vh, scrollable list.

- [ ] **Step 4: `Calculator.tsx`**

```tsx
import { useState } from "react";
import type { CallOptions } from "../api/client";
import { useCalculator } from "../hooks/useCalculator";
import { useKeyboard } from "../hooks/useKeyboard";
import { Display } from "./Display";
import { HistoryPanel } from "./HistoryPanel";
import { Keypad } from "./Keypad";
import { StatusBanner } from "./StatusBanner";
import styles from "./Calculator.module.css";

interface CalculatorProps {
  callOptions?: Pick<CallOptions, "attempts" | "baseDelayMs">;
}

export function Calculator({ callOptions = {} }: CalculatorProps) {
  const { state, send, retry, history } = useCalculator(callOptions);
  const [historyOpen, setHistoryOpen] = useState(false);
  useKeyboard(send);

  const networkMessage = state.error?.kind === "network" ? "Can't reach the calculation service." : null;

  return (
    <div className={styles.layout}>
      <main className={styles.card} aria-label="calculator">
        <StatusBanner message={networkMessage} onRetry={retry} />
        <header className={styles.toolbar}>
          <button type="button" className={styles.toolbarButton} aria-label="history" aria-expanded={historyOpen} onClick={() => setHistoryOpen((o) => !o)}>
            History
          </button>
        </header>
        <Display value={state.display} expression={state.expression} pending={state.phase === "awaitingResult"} error={state.error} />
        <Keypad send={send} activeOperator={state.phase === "operatorChosen" ? state.operator : null} />
      </main>
      <HistoryPanel
        open={historyOpen}
        entries={history.entries}
        onRecall={(value) => send({ type: "recall", value })}
        onClear={history.clear}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}
```

`Calculator.module.css`:

```css
.layout {
  min-height: 100%;
  display: flex;
  align-items: stretch;
  justify-content: center;
}
.card {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--color-surface);
}
.toolbar { display: flex; justify-content: flex-end; }
.toolbarButton {
  padding: var(--space-1) var(--space-3);
  border-radius: 999px;
  color: var(--color-accent);
  font-weight: 500;
}
.toolbarButton[aria-expanded="true"] { background: var(--color-key); }

@media (min-width: 721px) {
  .layout { align-items: center; padding: var(--space-8); }
  .card {
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: var(--space-6);
  }
}
```

- [ ] **Step 5: `App.tsx`**

```tsx
import { Calculator } from "./features/calculator/ui/Calculator";

export default function App() {
  return <Calculator />;
}
```

- [ ] **Step 6: Run everything and look at it**

```bash
npm test && npm run lint && npm run typecheck
# in two terminals: (cd ../api && go run ./cmd/api) and npm run dev
```

Open `http://localhost:5173`. Verify by hand: light/dark follows the OS, keys animate on press, chosen operator inverts, `=` animates the expression line, AC clears, history opens/closes, mobile width (DevTools ≤ 480 px) fills the screen and history is a bottom sheet, keyboard works, `1 ÷ 0` shakes and shows the detail.

- [ ] **Step 7: Commit**

```bash
git add src/
git commit -m "feat(web): calculator screen with history and status"
```

### Task 22: Frontend docs and ADR

**Files:**
- Create: `docs/frontend.md`, `docs/adr/0006-css-modules-over-tailwind.md`

- [ ] **Step 1: `docs/frontend.md`** sections: Layout (tree), State machine (phases, events, the chaining and percent rules from spec §5.2, a short sequence table: keys → phase/display/pending), API client (retry policy), Design system (tokens, themes, reduced motion), Motion (table from spec §5.5), Accessibility (list from spec §5.8), Running locally (`npm run dev`, `npm test`, `npm run test:coverage`, `npm run gen`), Testing approach (what each test file covers).

- [ ] **Step 2: ADR 0006** — same template as Task 13: CSS Modules + custom properties chosen over Tailwind because the app has a handful of components and a bespoke look; the token sheet *is* the design system and reads as one; JSX stays declarative; trade-off: no utility shortcuts, but no build-time scanning either. Revisit if the UI grows past ~15 components.

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs: frontend guide and ADR 6"
```

### ✅ Checkpoint 3 — independent review (frontend UI)

Message the reviewer: "review `web/src/features/calculator/{hooks,ui}` and `web/src/styles` for React correctness (effects, aborts, stale state), accessibility, motion/reduced-motion handling, and test quality". Fix, commit, note findings.

---

## Part F — Delivery: Docker, compose, e2e, CI, docs

### Task 23: Web Dockerfile with nginx, compose, env example

**Files:**
- Create: `web/nginx.conf`, `web/Dockerfile`, `web/.dockerignore`, `docker-compose.yml`, `.env.example`

- [ ] **Step 1: `web/nginx.conf`**

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # API and its docs live in the Go service; same origin for the browser.
    location /api/ {
        proxy_pass http://api:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Request-ID $request_id;
    }
    location = /healthz      { proxy_pass http://api:8080/healthz; }
    location = /docs         { proxy_pass http://api:8080/docs; }
    location = /openapi.yaml { proxy_pass http://api:8080/openapi.yaml; }

    # Hashed assets are immutable; index.html must always be revalidated.
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    location / {
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 2: `web/.dockerignore`**

```
node_modules
dist
coverage
test-results
playwright-report
e2e
Dockerfile
```

- [ ] **Step 3: `web/Dockerfile`**

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build

FROM nginx:1.31-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
```

- [ ] **Step 4: `docker-compose.yml`**

```yaml
services:
  api:
    build:
      context: ./api
      args:
        VERSION: ${VERSION:-dev}
    init: true
    restart: unless-stopped
    environment:
      LOG_LEVEL: ${LOG_LEVEL:-info}
    healthcheck:
      test: ["CMD", "/api", "-healthcheck"]
      interval: 5s
      timeout: 3s
      retries: 5
      start_period: 2s

  web:
    build: ./web
    init: true
    restart: unless-stopped
    depends_on:
      api:
        condition: service_healthy
    ports:
      - "${WEB_PORT:-8080}:80"
```

- [ ] **Step 5: `.env.example`**

```
# Copy to .env to override. All values are optional.
WEB_PORT=8080
LOG_LEVEL=info
VERSION=dev
```

- [ ] **Step 6: Bring it up and verify**

```bash
docker compose up --build -d --wait
curl -s localhost:8080/healthz
curl -s -X POST localhost:8080/api/v1/add -H 'Content-Type: application/json' -d '{"a":"0.1","b":"0.2"}'
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/docs
docker compose ps
docker compose down
```

Expected: `{"status":"ok","version":"dev"}`, the add result, `200`, both services `healthy`. Open `http://localhost:8080` in a browser and do one calculation.

- [ ] **Step 7: Commit**

```bash
git add web/nginx.conf web/Dockerfile web/.dockerignore docker-compose.yml .env.example
git commit -m "build: docker compose with nginx reverse proxy"
```

### Task 24: Playwright end-to-end tests

**Files:**
- Create: `web/playwright.config.ts`, `web/e2e/calculator.spec.ts`

- [ ] **Step 1: `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

const port = process.env.WEB_PORT ?? "8080";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
```

- [ ] **Step 2: `e2e/calculator.spec.ts`**

```ts
import { expect, test } from "@playwright/test";

test.describe("calculator", () => {
  test("adds two decimals exactly", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "0", exact: true }).click();
    await page.getByRole("button", { name: "decimal point" }).click();
    await page.getByRole("button", { name: "1", exact: true }).click();
    await page.getByRole("button", { name: "add" }).click();
    await page.getByRole("button", { name: "0", exact: true }).click();
    await page.getByRole("button", { name: "decimal point" }).click();
    await page.getByRole("button", { name: "2", exact: true }).click();
    await page.getByRole("button", { name: "equals" }).click();
    await expect(page.getByRole("status")).toHaveText("0.3");
  });

  test("reports division by zero from the API", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.type("1/0");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Error");
    await expect(page.getByText("divisor must not be zero")).toBeVisible();
  });
});
```

- [ ] **Step 3: Run against the compose stack**

```bash
cd /var/www/html/sezzle && docker compose up -d --wait
cd web && npx playwright install chromium && npm run e2e
cd .. && docker compose down
```

Expected: 4 passed (2 tests × 2 projects).

- [ ] **Step 4: Commit**

```bash
git add web/playwright.config.ts web/e2e
git commit -m "test(web): end-to-end tests with Playwright"
```

### Task 25: CI workflow and root Makefile

**Files:**
- Create: `.github/workflows/ci.yml`, `Makefile`

- [ ] **Step 1: `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  api:
    name: API (Go)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: api
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: api/go.mod
          cache-dependency-path: api/go.sum
      - run: go vet ./...
      - uses: golangci/golangci-lint-action@v7
        with:
          version: v2.14.0
          working-directory: api
      - run: go test -race -coverprofile=coverage.out ./...
      - run: go tool cover -func=coverage.out | tail -1
      - run: go tool cover -html=coverage.out -o coverage.html
      - run: go test -run='^$' -fuzz=FuzzParse -fuzztime=10s ./internal/calc
      - uses: actions/upload-artifact@v4
        with:
          name: api-coverage
          path: api/coverage.html

  web:
    name: Web (React)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm run typecheck
      - name: OpenAPI lint
        run: npx --yes @redocly/cli@2.62.1 lint ../api/openapi.yaml
      - name: Generated types are up to date
        run: npm run gen && git diff --exit-code -- src/features/calculator/api/schema.gen.ts
      - run: npm run test:coverage
      - uses: actions/upload-artifact@v4
        with:
          name: web-coverage
          path: web/coverage

  docker:
    name: Docker images
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - run: docker compose build

  e2e:
    name: End-to-end
    runs-on: ubuntu-latest
    needs: [api, web, docker]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: docker compose up -d --build --wait
      - run: npm ci
        working-directory: web
      - run: npx playwright install --with-deps chromium
        working-directory: web
      - run: npm run e2e
        working-directory: web
        env:
          CI: "true"
      - if: failure()
        run: docker compose logs
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: web/playwright-report
      - if: always()
        run: docker compose down -v
```

Before committing, confirm the latest major of `golangci/golangci-lint-action` that supports golangci-lint v2 on the GitHub Marketplace and adjust the `@vN` if needed.

- [ ] **Step 2: Root `Makefile`**

```makefile
.PHONY: dev dev-api dev-web test cover lint gen up down e2e

## dev: run API (:8080) and Vite (:5173) natively, in parallel
dev:
	$(MAKE) -j2 dev-api dev-web

dev-api:
	cd api && CORS_ORIGINS=http://localhost:5173 go run ./cmd/api

dev-web:
	cd web && npm run dev

## test: unit tests for both services
test:
	cd api && go test -race ./...
	cd web && npm test

## cover: coverage reports (api/coverage.html, web/coverage/)
cover:
	cd api && $(MAKE) cover
	cd web && npm run test:coverage

## lint: linters and formatters for both services
lint:
	cd api && golangci-lint run
	cd web && npm run lint && npm run format:check && npm run typecheck

## gen: regenerate frontend types from api/openapi.yaml
gen:
	cd web && npm run gen

## up: build and run the whole stack with Docker
up:
	docker compose up --build

down:
	docker compose down

## e2e: run Playwright against the Docker stack
e2e:
	docker compose up -d --build --wait
	cd web && npm run e2e; status=$$?; cd .. && docker compose down; exit $$status
```

- [ ] **Step 3: Verify locally**

```bash
make test && make lint
```

Expected: both clean.

- [ ] **Step 4: Commit and push to trigger CI**

```bash
git add .github Makefile
git commit -m "ci: lint, test, build and e2e on GitHub Actions"
git log --format='%ae' | sort -u      # must print only colombo74744@hotmail.com
git push -u origin main
```

Watch the run on GitHub. Fix anything red with `ci: …` commits. Do not continue until CI is green.

### Task 26: README, docs index, testing and deployment guides, ADR 7

**Files:**
- Create: `README.md`, `docs/README.md`, `docs/testing.md`, `docs/deployment.md`, `docs/adr/0007-monorepo-layout.md`

- [ ] **Step 1: `README.md`** (one screen). Structure, in order:
1. Title + one sentence: "A decimal-exact calculator: React + TypeScript frontend, Go REST API."
2. CI badge: `[![CI](https://github.com/LuizColombo/sezzle-calculator/actions/workflows/ci.yml/badge.svg)](https://github.com/LuizColombo/sezzle-calculator/actions/workflows/ci.yml)`
3. Screenshot or GIF (`docs/assets/calculator.png`, captured from the running app in light and dark; use the browser DevTools device toolbar for the mobile shot). Commit the images under `docs/assets/`.
4. **Quickstart** — `docker compose up` then open `http://localhost:8080`; API docs at `/docs`. Note `WEB_PORT=3000 docker compose up` for a different port.
5. **Run natively** — prerequisites (Go 1.27+, Node 22+), `make dev`, or the two underlying commands.
6. **API in three calls** — curl for `add` (0.1+0.2), `divide` by zero (shows the problem+json), `sqrt`. Link to `docs/api.md`.
7. **Design decisions** — a 6-row table: decision → why → ADR link (decimal, strings, problem+json, stdlib router, layered Go, CSS Modules).
8. **Tests** — one line each for Go and web with commands and current coverage numbers, link to `docs/testing.md`.
9. **How AI was used** — two sentences and a link to `docs/ai/README.md`.
10. **Documentation** — link to `docs/README.md`.
No history, no filler.

- [ ] **Step 2: `docs/README.md`** — index of every file under `docs/` with one line each.

- [ ] **Step 3: `docs/testing.md`** — the pyramid (domain unit → handler/httptest → reducer unit → hooks → components with msw → e2e with Playwright), why each layer exists, the fuzz test, commands, where coverage reports land, and the actual coverage percentages from `make cover` (paste them; update when they change).

- [ ] **Step 4: `docs/deployment.md`** — images (what each stage does, sizes), compose (healthcheck, `depends_on`, ports, `init`, restart policy, why a failed build never kills a running stack), environment variables table, CI jobs table, and "what is intentionally missing" (TLS termination, registry push, orchestration).

- [ ] **Step 5: ADR 0007** — monorepo with each service owning its Dockerfile and compose at the root; alternatives: two repos (harder to review), `infra/` folder (nearly empty here); consequence: build contexts stay minimal, `.dockerignore` per service.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/
git commit -m "docs: README, testing and deployment guides, ADR 7"
```

### Task 27: AI usage documentation

**Files:**
- Create: `docs/ai/README.md`, `docs/ai/prompts.md`, `docs/ai/corrections.md`

- [ ] **Step 1: `docs/ai/README.md`** — sections:
- **Tooling**: Claude Code (CLI) with Anthropic models; which model was used for which phase (design and review with the most capable model, implementation with a faster one).
- **Process**: brainstorming (what the assignment asked → what would make it stand out) → written spec (`docs/specs/`) → written plan (`docs/plans/`) → implementation task by task with TDD → independent review by a separate reviewer agent at four checkpoints → documentation written alongside each part.
- **Division of labour**: the human set goals, constraints and taste (what "senior" means here, which extras to cut, visual direction), approved every design section, read every diff, and made the final call on each reviewer finding; the AI drafted code, tests and docs, and ran the tooling.
- **Verification**: nothing was accepted on the AI's word; every claim was checked by running tests, lint, Docker and the browser. Link to `corrections.md`.

- [ ] **Step 2: `docs/ai/prompts.md`** — curated, not a transcript. For each: the phase, the prompt (quoted, trimmed), what it produced, and what changed afterwards. Include at least: the kick-off brief (goals, "senior not more features"), the request for out-of-the-box ideas, the per-op-first-then-precedence decision, the spec-writing request, the plan-writing request, one implementation task prompt, and one reviewer prompt. Prompts are in Portuguese; keep the original with a one-line English gloss each.

- [ ] **Step 3: `docs/ai/corrections.md`** — table: what the AI proposed → what was decided → why. Seed it with the decisions already made during design:
- Clean/hexagonal architecture for Go → layered packages → single-implementation interfaces add nothing at this size.
- gorilla/mux (used in the company's own test) → stdlib router → Go 1.22+ covers it; swap is one line.
- "All possible tests" → a pyramid with explicit targets → more tests past the pyramid are noise.
- Exponential backoff "everywhere" → only in the browser client → nothing in the API has anything to retry.
- `infra/` folder → Dockerfile per service → `infra/` would hold one file.
- `documentation/` → `docs/` → the convention tools and readers expect.
- `wget` healthcheck in compose → `-healthcheck` flag on the binary → distroless has no wget.
Then append each checkpoint's notable reviewer findings and what was done about them.

- [ ] **Step 4: Commit**

```bash
git add docs/ai
git commit -m "docs: how AI was used, prompts and corrections"
```

### ✅ Checkpoint 4 — independent review (whole repository)

Message the reviewer: "review the repository as the hiring panel would: clone cold, read the README, run `docker compose up`, read the git log, skim `docs/`. Report anything confusing, anything that contradicts the docs, dead code, and the three things you would ask about in an interview." Fix, commit, update `corrections.md`, push.

### Task 28: Final verification and hand-off

- [ ] **Step 1: Cold clone check**

```bash
cd /tmp && rm -rf sezzle-check && git clone git@github-personal:LuizColombo/sezzle-calculator.git sezzle-check
cd sezzle-check && docker compose up --build -d --wait && curl -s localhost:8080/healthz && docker compose down -v
cd /tmp && rm -rf sezzle-check
```

- [ ] **Step 2: Author check** — `git log --format='%an <%ae>' | sort -u` prints exactly one line with the personal e-mail. `git log --grep='Co-Authored' --grep='Claude' -i` prints nothing.

- [ ] **Step 3: CI green on `main`**, badge green in the README.

- [ ] **Step 4: Tag** `git tag -a v1.0.0 -m "Phase 1: per-operation calculator" && git push origin v1.0.0`.

Phase 2 (expression evaluation with operator precedence) starts with its own spec in `docs/specs/`.

---

## Self-review against the spec

- **§2 decisions** → ADRs in Tasks 13, 22, 26. ✔
- **§3 layout** → Tasks 1, 2, 14, 23, 25, 26. ✔
- **§4.2 domain** → Tasks 3–6 (limits, rounding, NaN/Infinity guards, `0^0`, sentinel errors). ✔
- **§4.3 API & errors** → Tasks 7–10 (all routes, status mapping, `DisallowUnknownFields`, trailing data, body limit, content type). ✔
- **§4.4 handler factories** → Task 8 uses one `Operation.handler()` for both arities instead of two factories; same intent, less code. Spec wording is looser than this plan; the plan wins.
- **§4.5 server** → Task 11 (timeouts, slog, graceful shutdown, env config, version), Task 9 (middleware order). ✔
- **§4.6 tests & lint** → Tasks 3–11, golangci config in Task 2. ✔
- **§5.2 state machine** → Task 16; the spec's `=`-no-op, chaining, fresh-digit-after-result, backspace, decimal, 16-digit cap, AC, percent and sqrt rules each have a test. ✔
- **§5.3 client** → Task 18 (retry set, attempts, base/cap, jitter, abort, 4xx not retried). ✔
- **§5.4–5.5 design & motion** → Tasks 14, 20, 21 (tokens, themes, reduced motion via `MotionConfig` and CSS, key press, operator invert, expression transition, pending pulse, history slide/sheet, error shake). AC fade+blur: the `AnimatePresence` on the expression line covers the transition; a blur on the value is omitted as not worth its cost. Documented in `frontend.md`.
- **§5.6 history** → Tasks 19, 21 (50 entries, versioned key, recall, two-step clear). ✔
- **§5.7 errors/offline** → Tasks 16, 19, 21 (Error + detail, banner + retry). ✔
- **§5.8 a11y & keyboard** → Tasks 17, 19, 20, 21. ✔
- **§5.9 responsive** → Task 21 CSS. ✔
- **§5.10 tests** → Tasks 16–21, 24. ✔
- **§6 Docker/compose/CI/Makefile** → Tasks 12, 23, 24, 25. ✔
- **§7 docs** → Tasks 13, 22, 26, 27. ✔
- **§8 git conventions** → every commit step. ✔

Placeholder scan: none. Type consistency: `Response`/`Operation`/`Problem` (Go), `CalculatorState`/`CalculatorEvent`/`PendingCall`/`CalculatorError` (TS), `callOperation`/`ApiError`/`NetworkError`, `useCalculator` returning `{ state, send, retry, history }` are used with the same names throughout.
