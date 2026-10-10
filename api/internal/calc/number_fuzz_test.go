package calc

import "testing"

// FuzzParse checks two properties for any input: Parse never panics, and a
// value that parses successfully formats to something that parses back to
// the same value.
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
	})
}
