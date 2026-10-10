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
