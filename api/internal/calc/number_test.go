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
		{"1234567890123456789012345678901234", "1234567890123456789012345678901234"},
		{"1" + strings.Repeat("0", 70), "1" + strings.Repeat("0", 70)},
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
		{strings.Repeat("9", 35), ErrNumberTooLarge},
		{"0." + strings.Repeat("1", 35), ErrNumberTooLarge},
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

func TestParseAcceptsExactly34Digits(t *testing.T) {
	if _, err := Parse(strings.Repeat("9", 34)); err != nil {
		t.Fatalf("34 digits should be accepted: %v", err)
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

// A non-zero value that 16-place rounding would turn into 0 is shown in
// exponent notation instead, so the API never reports a non-zero result as 0.
func TestStringKeepsTinyValuesNonZero(t *testing.T) {
	cases := []struct{ in, want string }{
		{"1e-17", "1E-17"},
		{"-1.5e-20", "-1.5E-20"},
		{"1.23456789e-900", "1.23456789E-900"},
		{"4e-17", "4E-17"},
		{"6e-17", "0.0000000000000001"},  // rounds up to a visible digit
		{"9.7e-16", "0.000000000000001"}, // rounding carries into a new digit (found by FuzzParse)
	}
	for _, c := range cases {
		n, err := Parse(c.in)
		if err != nil {
			t.Fatal(err)
		}
		if got := n.String(); got != c.want {
			t.Errorf("Parse(%q).String() = %q, want %q", c.in, got, c.want)
		}
		if back, err := Parse(n.String()); err != nil || back.IsZero() {
			t.Errorf("String() of %q does not parse back to a non-zero value: %v", c.in, err)
		}
	}
}

// String must round even when rounding needs more digits than the working
// precision (here 50). Parse limits inputs, so build the value directly.
func TestStringRoundsLongValues(t *testing.T) {
	var n Number
	if _, _, err := n.d.SetString(strings.Repeat("9", 20) + "." + strings.Repeat("1", 30)); err != nil {
		t.Fatal(err)
	}
	if got, want := n.String(), strings.Repeat("9", 20)+"."+strings.Repeat("1", 16); got != want {
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
