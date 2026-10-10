# API usage

The machine-readable contract is [`api/openapi.yaml`](../api/openapi.yaml). A running service renders it with Scalar at **`/docs`**, where every endpoint can be tried from the browser. This page is the hands-on guide.

- **Base URL:** `http://localhost:8080`, both with Docker Compose (nginx proxies `/api` to the service) and when running the API alone with `go run ./cmd/api`.
- **Requests:** `POST`, `Content-Type: application/json`, a JSON object whose values are **strings**.
- **Responses:** `application/json` on success, `application/problem+json` on error.
- **Request ids:** every response carries `X-Request-ID`. Send your own (letters, digits, `.`, `_`, `-`, up to 128 characters) to correlate with server logs.

## Numbers

Numbers are decimal strings: `"0.1"`, `"-42"`, `"1.5e3"`. JSON numbers are rejected, because most decoders turn them into binary floats before the server sees them ([ADR 0003](adr/0003-numbers-as-json-strings.md)).

| Limit | Value |
|---|---|
| Significant digits per input | 34 (inputs are exact; results round to 34 significant digits) |
| Magnitude of inputs and results | 10^−1000 to 10^1000 |
| Working precision | 34 digits, round half to even |
| Decimal places in results | at most 16, trailing zeros removed |
| Results below 10^−16 | exponent notation with 16 significant digits, e.g. `"1E-17"`, so a non-zero result is never shown as `"0"` |

## Operations

```bash
curl -s -X POST localhost:8080/api/v1/add -H 'Content-Type: application/json' -d '{"a":"0.1","b":"0.2"}'
# {"operation":"add","inputs":{"a":"0.1","b":"0.2"},"result":"0.3"}

curl -s -X POST localhost:8080/api/v1/subtract -H 'Content-Type: application/json' -d '{"a":"5","b":"7"}'
# {"operation":"subtract","inputs":{"a":"5","b":"7"},"result":"-2"}

curl -s -X POST localhost:8080/api/v1/multiply -H 'Content-Type: application/json' -d '{"a":"1.5","b":"2"}'
# {"operation":"multiply","inputs":{"a":"1.5","b":"2"},"result":"3"}

curl -s -X POST localhost:8080/api/v1/divide -H 'Content-Type: application/json' -d '{"a":"1","b":"3"}'
# {"operation":"divide","inputs":{"a":"1","b":"3"},"result":"0.3333333333333333"}

curl -s -X POST localhost:8080/api/v1/power -H 'Content-Type: application/json' -d '{"base":"2","exponent":"10"}'
# {"operation":"power","inputs":{"base":"2","exponent":"10"},"result":"1024"}

curl -s -X POST localhost:8080/api/v1/sqrt -H 'Content-Type: application/json' -d '{"value":"2"}'
# {"operation":"sqrt","inputs":{"value":"2"},"result":"1.414213562373095"}

curl -s -X POST localhost:8080/api/v1/percent -H 'Content-Type: application/json' -d '{"value":"200","percent":"15"}'
# {"operation":"percent","inputs":{"percent":"15","value":"200"},"result":"30"}
```

| Endpoint | Fields | Result |
|---|---|---|
| `POST /api/v1/add` | `a`, `b` | `a + b` |
| `POST /api/v1/subtract` | `a`, `b` | `a − b` |
| `POST /api/v1/multiply` | `a`, `b` | `a × b` |
| `POST /api/v1/divide` | `a`, `b` | `a ÷ b` |
| `POST /api/v1/power` | `base`, `exponent` | `base ^ exponent`; `0 ^ 0 = 1` |
| `POST /api/v1/sqrt` | `value` | `√value` |
| `POST /api/v1/percent` | `value`, `percent` | `value × percent ÷ 100` |

## Expressions

`POST /api/v1/evaluate` takes a whole expression and applies operator precedence. It is what the Scientific mode uses; the endpoints above are what the Basic mode uses.

```bash
curl -s -X POST localhost:8080/api/v1/evaluate -H 'Content-Type: application/json' -d '{"expression":"2+3*4"}'
# {"expression":"2 + 3 × 4","result":"14"}

curl -s -X POST localhost:8080/api/v1/evaluate -H 'Content-Type: application/json' -d '{"expression":"2 + (3 − 1) × 4^2 / √16"}'
# {"expression":"2 + (3 − 1) × 4 ^ 2 ÷ √16","result":"10"}

curl -s -X POST localhost:8080/api/v1/evaluate -H 'Content-Type: application/json' -d '{"expression":"(2+3"}'
# {"type":"…#invalid-expression","title":"Invalid expression","status":400,"detail":"expected ')' at column 5","position":5,…}
```

The response echoes the **canonical form**: single spaces around binary operators and typographic symbols (`× ÷ −`), with numbers and parentheses exactly as typed. It always parses back to the same expression.

| Precedence (lowest first) | Operators | Associativity | Example |
|---|---|---|---|
| 1 | `+` `−` (or `-`) | left | `10 − 2 − 3 = 5` |
| 2 | `×` `÷` (or `*` `/`) | left | `16 ÷ 4 ÷ 2 = 2` |
| 3 | unary `−` `+` | prefix | `−2 ^ 2 = −4` |
| 4 | `^` | right | `2 ^ 3 ^ 2 = 512`, `2 ^ −1 = 0.5` |
| 5 | `%` | postfix | `50% × 8 = 4` |
| 6 | `√` | prefix | `√16 + 9 = 13`, `√(16 + 9) = 5` |

**Percent** behaves like a calculator's: when the right operand of `+` or `−` is exactly `x%`, it means x percent of the left operand (`200 + 15% = 230`). Anywhere else `x%` is `x ÷ 100` (`200 + 15% × 2 = 200.3`).

**Limits:** 256 characters (spaces not counted), 128 tokens, 32 levels of nested parentheses or prefix operators; each number has the limits above. There is no implicit multiplication: write `2 × (3)`, not `2(3)`.

### Discovery and health

```bash
curl -s localhost:8080/api/v1/operations
# [{"name":"add","path":"/api/v1/add","arity":2,"params":["a","b"]}, …]

curl -s localhost:8080/healthz
# {"status":"ok","version":"dev"}
```

## Errors

Every error, including unknown routes and wrong methods, is an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem:

```bash
curl -s -X POST localhost:8080/api/v1/divide -H 'Content-Type: application/json' -d '{"a":"1","b":"0"}'
```

```json
{
  "type": "https://github.com/LuizColombo/sezzle-calculator/blob/main/docs/api.md#division-by-zero",
  "title": "Division by zero",
  "status": 422,
  "detail": "division by zero",
  "instance": "/api/v1/divide",
  "requestId": "c8fd159e922f4069"
}
```

Branch on the fragment of `type`; show `detail` to people. **400** means the request itself is wrong; **422** means it is well-formed but the maths is impossible or out of range.

## Error types

### invalid-request

**400.** The body is not a JSON object of strings with exactly the expected fields, the `Content-Type` is not `application/json`, the body exceeds 1 KiB, or there is data after the object. `detail` names the problem, e.g. `missing field "b"`, `unexpected field "c"`, `field "a" must be a string, e.g. "1.5"`.

### invalid-number

**400.** A field is a string but not a decimal, e.g. `"abc"`, `"1,5"`, `" 1"`, `"NaN"`, `"Infinity"`, `"0x10"`.

### number-too-large

**422.** An input has more than 34 significant digits or a magnitude outside 10^±1000, e.g. `"1e1001"`.

### division-by-zero

**422.** `divide` with `b` equal to zero (including `"0.0"` and `"-0"`).

### negative-square-root

**422.** `sqrt` of a negative value. Results are real numbers only.

### invalid-power

**422.** `power` with zero to a negative exponent (`0 ^ -1`), or a negative base with a fractional exponent (`-8 ^ 0.5`), whose result is not real.

### result-too-large

**422.** The result overflows or underflows 10^±1000, e.g. `1e600 × 1e600`. For `percent`, the intermediate `percent ÷ 100` must also be in range, so `percent` of `1e-1000` is rejected even when the final value would fit.

### invalid-expression

**400.** `POST /api/v1/evaluate` received something that is not a valid expression: an unknown character, a missing or extra parenthesis, two numbers in a row, a dangling operator, or a limit exceeded. `position` is the 1-based column of the mistake (omitted when the error has no single location, such as an expression that is too long); `detail` repeats it in words, e.g. `unexpected ')' at column 6`.

### invalid-operation

**422.** A defensive catch-all for an arithmetic condition the decimal library reports that none of the rules above anticipated. Not expected in practice.

### not-found

**404.** No route matches the path, e.g. `POST /api/v1/modulo`.

### method-not-allowed

**405.** The path exists but not for this method, e.g. `GET /api/v1/add`. The `Allow` header lists the right method.

### internal-error

**500.** An unexpected server failure. The response never includes internal details; the server log line with the same `requestId` does.
