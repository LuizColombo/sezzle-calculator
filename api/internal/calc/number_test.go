package calc

import (
	"errors"
	"strings"
	"testing"
)

func TestParseValid(t *testing.T) {
	cases := []struct{ in, want string }{
		{"0", "0"},
		{"-0", "0"},
		{"42", "42"},
		{"+42", "42"},
		{"0.1", "0.1"},
		{".5", "0.5"},
		{"1.", "1"},
		{"1.50", "1.5"},
		{"-3.25", "-3.25"},
		{"1e3", "1000"},
		{"1E-3", "0.001"},
		{"1234567890123456789012345678901234567890", "1234567890123456789012345678901234567890"},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			n, err := Parse(c.in)
			if err != nil {
				t.Fatalf("Parse(%q) error: %v", c.in, err)
			}
			if got := n.String(); got != c.want {
				t.Fatalf("Parse(%q).String() = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestParseInvalid(t *testing.T) {
	cases := []struct {
		in   string
		want error
	}{
		{"", ErrInvalidNumber},
		{" 1", ErrInvalidNumber},
		{"1 ", ErrInvalidNumber},
		{"abc", ErrInvalidNumber},
		{"1..2", ErrInvalidNumber},
		{"1,5", ErrInvalidNumber},
		{"1_000", ErrInvalidNumber},
		{"0x10", ErrInvalidNumber},
		{"NaN", ErrInvalidNumber},
		{"Inf", ErrInvalidNumber},
		{"-Infinity", ErrInvalidNumber},
		{"1e", ErrInvalidNumber},
		{"e5", ErrInvalidNumber},
		{"--1", ErrInvalidNumber},
		{"١", ErrInvalidNumber},
		{strings.Repeat("9", 65), ErrNumberTooLarge},
		{"1e1001", ErrNumberTooLarge},
		{"1e-1001", ErrNumberTooLarge},
		{"1e9999", ErrNumberTooLarge},
		{"1e99999", ErrInvalidNumber}, // exponent longer than 4 digits is rejected by the grammar
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			_, err := Parse(c.in)
			if !errors.Is(err, c.want) {
				t.Fatalf("Parse(%q) error = %v, want %v", c.in, err, c.want)
			}
		})
	}
}

func TestParseAcceptsExactly64Digits(t *testing.T) {
	if _, err := Parse(strings.Repeat("9", 64)); err != nil {
		t.Fatalf("64 digits should be accepted: %v", err)
	}
}

// Trailing zeros are not significant: 1e70 renders as 71 characters but has
// one significant digit, so its formatted form must parse back. Found by FuzzParse.
func TestParseTrailingZerosAreNotSignificant(t *testing.T) {
	n, err := Parse("1e70")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Parse(n.String()); err != nil {
		t.Fatalf("formatted 1e70 should parse back: %v", err)
	}
}

func TestStringRoundsTo16DecimalPlaces(t *testing.T) {
	n, err := Parse("0.12345678901234567890")
	if err != nil {
		t.Fatal(err)
	}
	if got, want := n.String(), "0.1234567890123457"; got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestIsZero(t *testing.T) {
	for _, s := range []string{"0", "0.0", "-0", "0e5"} {
		n, _ := Parse(s)
		if !n.IsZero() {
			t.Errorf("%q should be zero", s)
		}
	}
	n, _ := Parse("0.0001")
	if n.IsZero() {
		t.Error("0.0001 should not be zero")
	}
}
