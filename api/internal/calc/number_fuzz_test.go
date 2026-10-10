package calc

import (
	"strings"
	"testing"
)

// FuzzParse checks, for any input: Parse never panics; a value that parses
// formats to a string that parses back and formats identically; and when
// formatting did not round, the parsed-back value equals the original.
func FuzzParse(f *testing.F) {
	for _, seed := range []string{"0", "-1.5", "1e3", ".5", "1.", "NaN", "Inf", "", "1e99999", "0x10", "1..2"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, s string) {
		n, err := Parse(s)
		if err != nil {
			return
		}
		formatted := n.String()
		back, err := Parse(formatted)
		if err != nil {
			t.Fatalf("Parse(%q) ok but Parse(String()=%q) failed: %v", s, formatted, err)
		}
		if back.String() != formatted {
			t.Fatalf("round-trip mismatch: %q -> %q -> %q", s, formatted, back.String())
		}
		// When formatting did not round, the value itself must survive: a
		// String() that lost digits (or always said "0") would fail here.
		if n.d.Exponent >= -maxScale || (strings.ContainsRune(formatted, 'E') && n.d.NumDigits() <= maxScale) {
			if back.d.Cmp(&n.d) != 0 {
				t.Fatalf("value changed: %q -> %q (%s != %s)", s, formatted, back.d.String(), n.d.String())
			}
		}
	})
}
