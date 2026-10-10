package calc

import (
	"fmt"
	"regexp"

	"github.com/cockroachdb/apd/v3"
)

const (
	// MaxInputDigits is the maximum number of significant digits accepted in
	// input. It equals the working precision, so every accepted input is
	// represented exactly and only results are rounded.
	MaxInputDigits = precision
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

// decimalCtx is the decimal context shared by all operations.
var decimalCtx = newContext()

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
	if _, _, err := n.d.SetString(s); err != nil || n.d.Form != apd.Finite {
		return Number{}, fmt.Errorf("%w: %q", ErrInvalidNumber, s)
	}
	// Count significant digits on the reduced form: trailing zeros are not
	// significant, so "1e70" and its 71-character plain rendering agree.
	var reduced apd.Decimal
	reduced.Reduce(&n.d)
	if reduced.NumDigits() > MaxInputDigits {
		return Number{}, fmt.Errorf("%w: more than %d significant digits", ErrNumberTooLarge, MaxInputDigits)
	}
	if exp := adjustedExponent(&reduced); exp > MaxExponent || exp < -MaxExponent {
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
// A non-zero value that the rounding would turn into 0 is rendered in
// exponent notation with 16 significant digits instead ("1E-17"), so a result
// is never reported as 0 when it is not. Both forms are accepted by Parse.
func (n Number) String() string {
	var d apd.Decimal
	d.Reduce(&n.d)
	if d.IsZero() {
		return "0"
	}
	if d.Exponent < -maxScale {
		// Size the context to the rounded result so Quantize never runs out
		// of precision: integer digits + 16 places + 1 for a rounding carry
		// (9.7E-16 → 0.000000000000001). Values are bounded by MaxExponent,
		// so this always fits in uint32.
		digits := min(max(adjustedExponent(&d)+2+maxScale, 1), MaxExponent+2+maxScale)
		rounding := apd.BaseContext.WithPrecision(uint32(digits)) //nolint:gosec // bounded on the line above
		rounding.Rounding = apd.RoundHalfEven
		var q apd.Decimal
		if _, err := rounding.Quantize(&q, &d, -maxScale); err != nil {
			panic(fmt.Sprintf("calc: quantize %s: %v", d.String(), err)) // unreachable: precision is sized above
		}
		if q.IsZero() {
			// Too small for 16 places: keep 16 significant digits instead.
			significant := apd.BaseContext.WithPrecision(maxScale)
			significant.Rounding = apd.RoundHalfEven
			if _, err := significant.Round(&d, &d); err != nil {
				panic(fmt.Sprintf("calc: round %s: %v", d.String(), err)) // unreachable: exponent is in range
			}
			d.Reduce(&d)
			return d.Text('E')
		}
		d.Reduce(&q)
	}
	return d.Text('f')
}
