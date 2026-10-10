package expr

import (
	"errors"
	"testing"

	"github.com/LuizColombo/sezzle-calculator/api/internal/calc"
)

func TestEval(t *testing.T) {
	cases := []struct{ in, want string }{
		{"2 + 3 × 4", "14"},
		{"(2 + 3) × 4", "20"},
		{"2 ^ 3 ^ 2", "512"},
		{"−2 ^ 2", "-4"},
		{"(−2) ^ 2", "4"},
		{"2 ^ −1", "0.5"},
		{"√16 + 9", "13"},
		{"√(16 + 9)", "5"},
		{"200 + 15%", "230"},
		{"200 − 15%", "170"},
		{"50% × 8", "4"},
		{"2 × 15%", "0.3"},
		{"200 + 15% × 2", "200.3"},
		{"0.1 + 0.2 × 10", "2.1"},
		{"0.1 + 0.2", "0.3"},
		{"10 − 2 − 3", "5"},
		{"16 ÷ 4 ÷ 2", "2"},
		{"−−3", "3"},
		{"+3", "3"},
		{"1 ÷ 3 × 3", "1"},
		// a signed percentage is still a percentage of the left operand, as in Basic mode
		{"5 + −15%", "4.25"},
		{"200 − −15%", "230"},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			got, err := Eval(mustParse(t, c.in))
			if err != nil {
				t.Fatalf("Eval(%q): %v", c.in, err)
			}
			if got.String() != c.want {
				t.Fatalf("Eval(%q) = %s, want %s", c.in, got.String(), c.want)
			}
		})
	}
}

func TestEvalDomainErrors(t *testing.T) {
	cases := []struct {
		in   string
		want error
	}{
		{"1 ÷ (2 − 2)", calc.ErrDivisionByZero},
		{"√(0 − 4)", calc.ErrNegativeSqrt},
		{"0 ^ −1", calc.ErrInvalidPower},
		{"(−8) ^ 0.5", calc.ErrInvalidPower},
		{"10 ^ 600 × 10 ^ 600", calc.ErrResultTooLarge},
		// errors propagate out of every node type
		{"−(1 ÷ 0)", calc.ErrDivisionByZero},
		{"√(1 ÷ 0)", calc.ErrDivisionByZero},
		{"(1 ÷ 0)%", calc.ErrDivisionByZero},
		{"(1 ÷ 0) + 5%", calc.ErrDivisionByZero},
		{"5 + (1 ÷ 0)%", calc.ErrDivisionByZero},
		{"(1 ÷ 0) × 2", calc.ErrDivisionByZero},
		{"2 × (1 ÷ 0)", calc.ErrDivisionByZero},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			if _, err := Eval(mustParse(t, c.in)); !errors.Is(err, c.want) {
				t.Fatalf("Eval(%q) error = %v, want %v", c.in, err, c.want)
			}
		})
	}
}
