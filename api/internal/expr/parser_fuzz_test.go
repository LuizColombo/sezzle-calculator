package expr

import "testing"

// FuzzParse checks, for any input: Parse never panics, and when it accepts
// the input, its canonical form parses again and prints identically — the
// property that lets the API echo a normalised expression the UI can resend.
func FuzzParse(f *testing.F) {
	for _, seed := range []string{
		"2+3*4", "(2+3)*4", "2^3^2", "-2^2", "2^-1", "√16+9", "√(16+9)",
		"200+15%", "200-15%*2", "50%%", "1e3/.5", "((1))", "2 3", ")(", "√√√2", "--+-1",
	} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, s string) {
		n, err := Parse(s)
		if err != nil {
			return
		}
		_, _ = Eval(n) // evaluation must not panic either, whatever the result
		canonical := n.String()
		again, err := Parse(canonical)
		if err != nil {
			t.Fatalf("Parse(%q) ok, but its canonical form %q failed: %v", s, canonical, err)
		}
		if again.String() != canonical {
			t.Fatalf("canonical form not stable: %q -> %q -> %q", s, canonical, again.String())
		}
	})
}
