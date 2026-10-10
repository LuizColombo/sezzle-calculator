# ADR 0003: Numbers travel as JSON strings

**Status:** Accepted · **Date:** 2026-10-10

## Context

Choosing decimal arithmetic on the server (ADR 0002) is pointless if the number is already corrupted on the wire. A JSON number such as `0.1` is parsed into an IEEE double by JavaScript's `JSON.parse`, and by Go's `encoding/json` unless the code opts into `json.Number`. Large integers beyond 2^53 lose digits the same way.

## Decision

Every numeric input and output in the API is a JSON string matching a documented decimal grammar (`"0.1"`, `"-42"`, `"1.5e3"`). JSON numbers are rejected with `400 invalid-request`.

## Consequences

- Precision is preserved end to end, in both directions, for any client language.
- Clients must quote numbers; the OpenAPI schema (`DecimalString`) documents the pattern and the error explains it.
- This is the convention used by many payment APIs for monetary amounts, so it will look familiar to integrators.
