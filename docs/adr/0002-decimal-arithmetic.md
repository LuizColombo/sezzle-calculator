# ADR 0002: Decimal arithmetic

**Status:** Accepted · **Date:** 2026-10-10

## Context

`float64` is binary floating point: it cannot represent `0.1`, so `0.1 + 0.2` prints `0.30000000000000004`. For a payments company that is not a cosmetic issue; it is the class of bug that misstates money. Options considered:

- `math/big.Float` — arbitrary precision, but still binary.
- `shopspring/decimal` — popular, but no square root, and precision is controlled per call.
- `cockroachdb/apd` — General Decimal Arithmetic implementation used by CockroachDB; context-based precision and rounding, with `Sqrt`, `Pow`, overflow/underflow conditions.

## Decision

Use `github.com/cockroachdb/apd/v3` with a single context: 34 digits of precision (IEEE decimal128), round-half-even, exponent bounded to ±1000. Results are rounded to at most 16 decimal places when formatted.

## Consequences

- `0.1 + 0.2 = 0.3`, and `√2` is `1.414213562373095` (correctly rounded) instead of float's `…0951`.
- Inputs are bounded (64 significant digits, magnitude 10^±1000) so a request cannot ask for unbounded work.
- The library accepts `NaN` and `Infinity` as input and returns non-finite values for `0^0` and `0^-1` without an error. The domain guards all of these: a strict input grammar, explicit rules for `0^0` (= 1) and `0^-1` (error), and a finiteness check after every operation.
- Fractional powers are computed to working precision, not exactly; the 16-place rounding hides the last digits.
