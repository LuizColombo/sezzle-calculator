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
