package calc

import (
	"fmt"

	"github.com/cockroachdb/apd/v3"
)

// Add returns a + b.
func Add(a, b Number) (Number, error) { return apply(decimalCtx.Add, a, b) }

// Subtract returns a - b.
func Subtract(a, b Number) (Number, error) { return apply(decimalCtx.Sub, a, b) }

// Multiply returns a × b.
func Multiply(a, b Number) (Number, error) { return apply(decimalCtx.Mul, a, b) }

// Divide returns a ÷ b. Dividing by zero is an error.
func Divide(a, b Number) (Number, error) {
	if b.IsZero() {
		return Number{}, ErrDivisionByZero
	}
	return apply(decimalCtx.Quo, a, b)
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
	return apply(decimalCtx.Pow, base, exponent)
}

// Sqrt returns the square root of v. Negative input is an error.
func Sqrt(v Number) (Number, error) {
	if v.IsNegative() {
		return Number{}, ErrNegativeSqrt
	}
	var r Number
	cond, err := decimalCtx.Sqrt(&r.d, &v.d)
	return finish(r, cond, err)
}

// Percent returns value × percent ÷ 100. Dividing first is exact (it only
// shifts the exponent) and avoids overflowing on an in-range result such as
// 100 % of 1e1000.
func Percent(value, percent Number) (Number, error) {
	fraction, err := apply(decimalCtx.Quo, percent, hundred)
	if err != nil {
		return Number{}, err
	}
	return Multiply(value, fraction)
}

// isInteger reports whether n has no fractional part (2.0 counts as integer).
func isInteger(n Number) bool {
	var d apd.Decimal
	d.Reduce(&n.d)
	return d.Exponent >= 0
}
