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
		// √2 = 1.41421356237309504880…; 16 places round to …0950, trimmed.
		// (float64 would print …0951.)
		{in: "2", want: "1.414213562373095"},
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
