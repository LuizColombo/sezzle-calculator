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
