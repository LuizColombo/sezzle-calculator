package expr

import (
	"errors"
	"strings"
	"testing"
)

func kinds(toks []Token) []Kind {
	out := make([]Kind, len(toks))
	for i, t := range toks {
		out[i] = t.Kind
	}
	return out
}

func equalKinds(a, b []Kind) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestLexKinds(t *testing.T) {
	cases := []struct {
		in   string
		want []Kind
	}{
		{"1+2", []Kind{Number, Plus, Number, EOF}},
		{"1 - 2 − 3", []Kind{Number, Minus, Number, Minus, Number, EOF}},
		{"2*3×4", []Kind{Number, Times, Number, Times, Number, EOF}},
		{"8/2÷2", []Kind{Number, Divide, Number, Divide, Number, EOF}},
		{"2^3%", []Kind{Number, Power, Number, Percent, EOF}},
		{"√(16)", []Kind{Sqrt, LParen, Number, RParen, EOF}},
		{"  \t7 ", []Kind{Number, EOF}},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			toks, err := Lex(c.in)
			if err != nil {
				t.Fatal(err)
			}
			if got := kinds(toks); !equalKinds(got, c.want) {
				t.Fatalf("kinds = %v, want %v", got, c.want)
			}
		})
	}
}

func TestLexNumbers(t *testing.T) {
	for _, in := range []string{"0", "42", "0.1", ".5", "1.", "1e3", "1E-3", "2.5e+10"} {
		toks, err := Lex(in)
		if err != nil {
			t.Fatalf("Lex(%q): %v", in, err)
		}
		if toks[0].Kind != Number || toks[0].Text != in || toks[1].Kind != EOF {
			t.Fatalf("Lex(%q) = %+v", in, toks)
		}
	}
}

func TestLexExponentNeedsDigits(t *testing.T) {
	_, err := Lex("1e")
	var se *SyntaxError
	if !errors.As(err, &se) || se.Column != 2 {
		t.Fatalf("err = %v, want unexpected 'e' at column 2", err)
	}
}

func TestLexColumnsCountCodePoints(t *testing.T) {
	toks, err := Lex("√16 × 2")
	if err != nil {
		t.Fatal(err)
	}
	want := []int{1, 2, 5, 7, 8}
	for i, tok := range toks {
		if tok.Column != want[i] {
			t.Fatalf("token %d (%q) column = %d, want %d", i, tok.Text, tok.Column, want[i])
		}
	}
}

func TestLexErrors(t *testing.T) {
	cases := []struct {
		in       string
		column   int
		contains string
	}{
		{"2 $ 3", 3, "unexpected '$' at column 3"},
		{"2 + x", 5, "unexpected 'x'"},
		{strings.Repeat("1", MaxLength+1), 0, "longer than 256"},
		{"1" + strings.Repeat(" ", maxRawLength), 0, "longer than"},
		{strings.Repeat("1+", MaxTokens/2) + "1", 0, "more than 128 tokens"},
	}
	for _, c := range cases {
		t.Run(c.contains, func(t *testing.T) {
			_, err := Lex(c.in)
			var se *SyntaxError
			if !errors.As(err, &se) {
				t.Fatalf("err = %v, want *SyntaxError", err)
			}
			if !errors.Is(err, ErrSyntax) {
				t.Fatal("SyntaxError must wrap ErrSyntax")
			}
			if se.Column != c.column || !strings.Contains(err.Error(), c.contains) {
				t.Fatalf("err = %q (column %d), want %q at column %d", err, se.Column, c.contains, c.column)
			}
		})
	}
}

// The length limit counts non-space characters, so the canonical form (which
// adds spaces around operators) of an accepted expression is accepted too.
func TestLexLengthIgnoresSpaces(t *testing.T) {
	if _, err := Lex(strings.Repeat("1", MaxLength) + strings.Repeat(" ", 100)); err != nil {
		t.Fatalf("%d characters plus spaces should be accepted: %v", MaxLength, err)
	}
}

func TestLexAcceptsTheLimits(t *testing.T) {
	if _, err := Lex(strings.Repeat("1", MaxLength)); err != nil {
		t.Fatalf("%d characters should be accepted: %v", MaxLength, err)
	}
	if _, err := Lex(strings.Repeat("1+", (MaxTokens-1)/2) + "1"); err != nil {
		t.Fatalf("%d tokens should be accepted: %v", MaxTokens-1, err)
	}
}
