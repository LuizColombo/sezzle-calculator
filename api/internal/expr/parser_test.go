package expr

import (
	"errors"
	"strings"
	"testing"

	"github.com/LuizColombo/sezzle-calculator/api/internal/calc"
)

// tree renders the AST as an S-expression, so tests check structure, not
// just the printed form: 2^3^2 is (^ 2 (^ 3 2)).
func tree(n Node) string {
	switch n := n.(type) {
	case *Num:
		return n.Value.String()
	case *Group:
		return "(group " + tree(n.X) + ")"
	case *Unary:
		return "(" + opSymbol[n.Op] + " " + tree(n.X) + ")"
	case *Binary:
		return "(" + opSymbol[n.Op] + " " + tree(n.L) + " " + tree(n.R) + ")"
	case *Pct:
		return "(% " + tree(n.X) + ")"
	case *PctOf:
		return "(" + opSymbol[n.Op] + "% " + tree(n.Base) + " " + tree(n.Rate) + ")"
	}
	return "?"
}

func mustParse(t *testing.T, s string) Node {
	t.Helper()
	n, err := Parse(s)
	if err != nil {
		t.Fatalf("Parse(%q): %v", s, err)
	}
	return n
}

func TestParseStructure(t *testing.T) {
	cases := []struct{ in, want string }{
		{"2+3*4", "(+ 2 (× 3 4))"},
		{"2*3+4", "(+ (× 2 3) 4)"},
		{"1-2-3", "(− (− 1 2) 3)"},
		{"8/4/2", "(÷ (÷ 8 4) 2)"},
		{"(2+3)*4", "(× (group (+ 2 3)) 4)"},
		{"2^3^2", "(^ 2 (^ 3 2))"},
		{"-2^2", "(− (^ 2 2))"},
		{"2^-1", "(^ 2 (− 1))"},
		{"-2*3", "(× (− 2) 3)"},
		{"--2", "(− (− 2))"},
		{"+2", "(+ 2)"},
		{"√16+9", "(+ (√ 16) 9)"},
		{"√(16+9)", "(√ (group (+ 16 9)))"},
		{"√16^2", "(^ (√ 16) 2)"},
		{"√16%", "(% (√ 16))"},
		{"√-4", "(√ (− 4))"},
		{"50%*8", "(× (% 50) 8)"},
		{"2*15%", "(× 2 (% 15))"},
		{"200+15%", "(+% 200 15)"},
		{"200-15%", "(−% 200 15)"},
		{"200+15%*2", "(+ 200 (× (% 15) 2))"},
		{"200+(15%)", "(+ 200 (group (% 15)))"},
		{"2^3%", "(^ 2 (% 3))"},
		{"50%%", "(% (% 50))"},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			if got := tree(mustParse(t, c.in)); got != c.want {
				t.Fatalf("tree = %s, want %s", got, c.want)
			}
		})
	}
}

func TestParseCanonicalForm(t *testing.T) {
	cases := []struct{ in, want string }{
		{"2+3*4", "2 + 3 × 4"},
		{"(2+3)*4", "(2 + 3) × 4"},
		{"-2^2", "−2 ^ 2"},
		{"2 ^ - 1", "2 ^ −1"},
		{"√ ( 16 + 9 )", "√(16 + 9)"},
		{"200 + 15 %", "200 + 15%"},
		{"1.50 × 2", "1.5 × 2"},
		{"8 / 2", "8 ÷ 2"},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			if got := mustParse(t, c.in).String(); got != c.want {
				t.Fatalf("String() = %q, want %q", got, c.want)
			}
		})
	}
}

func TestParseSyntaxErrors(t *testing.T) {
	cases := []struct {
		in     string
		column int
		msg    string
	}{
		{"", 1, "empty expression"},
		{"   ", 4, "empty expression"},
		{"2 +", 4, "unexpected end of expression"},
		{"(2 + 3", 7, "expected ')'"},
		{"2 + 3)", 6, "unexpected ')'"},
		{"2 3", 3, "unexpected number"},
		{"* 2", 1, "unexpected '×'"},
		{"2 + * 3", 5, "unexpected '×'"},
		{"()", 2, "unexpected ')'"},
		{"%5", 1, "unexpected '%'"},
		{strings.Repeat("(", MaxDepth) + "1" + strings.Repeat(")", MaxDepth), 32, "nested deeper than 32"},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			_, err := Parse(c.in)
			var se *SyntaxError
			if !errors.As(err, &se) {
				t.Fatalf("err = %v, want *SyntaxError", err)
			}
			if se.Column != c.column || !strings.Contains(se.Msg, c.msg) {
				t.Fatalf("got %q at column %d, want %q at column %d", se.Msg, se.Column, c.msg, c.column)
			}
		})
	}
}

func TestParseAcceptsMaximumDepth(t *testing.T) {
	in := strings.Repeat("(", MaxDepth-1) + "1" + strings.Repeat(")", MaxDepth-1)
	if _, err := Parse(in); err != nil {
		t.Fatalf("%d levels should be accepted: %v", MaxDepth-1, err)
	}
}

func TestParseNumberErrorsKeepTheirDomainError(t *testing.T) {
	_, err := Parse("1 + " + strings.Repeat("9", 35))
	if !errors.Is(err, calc.ErrNumberTooLarge) || !strings.Contains(err.Error(), "column 5") {
		t.Fatalf("err = %v, want ErrNumberTooLarge with its column", err)
	}
	if errors.Is(err, ErrSyntax) {
		t.Fatal("a number error is not a syntax error")
	}
}
