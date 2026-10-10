// Package expr parses and evaluates arithmetic expressions with operator
// precedence, using the calc package for every operation.
package expr

import (
	"errors"
	"fmt"
)

// Limits on what Parse accepts. They bound the parser's recursion and the
// work a single request can ask for.
const (
	MaxLength = 256 // code points, not counting whitespace
	MaxTokens = 128 // excluding the end marker
	MaxDepth  = 32  // nested parentheses and prefix operators

	// maxRawLength bounds the input including whitespace. MaxLength ignores
	// spaces so that the canonical form, which adds them, is always accepted.
	maxRawLength = 4 * MaxLength
)

// ErrSyntax is wrapped by every SyntaxError; callers match it with errors.Is.
var ErrSyntax = errors.New("invalid expression")

// SyntaxError describes malformed input. Column is 1-based, counted in code
// points, and 0 when the problem has no single location (e.g. too long).
type SyntaxError struct {
	Column int
	Msg    string
}

func (e *SyntaxError) Error() string {
	if e.Column > 0 {
		return fmt.Sprintf("%s at column %d", e.Msg, e.Column)
	}
	return e.Msg
}

// Unwrap makes errors.Is(err, ErrSyntax) true.
func (e *SyntaxError) Unwrap() error { return ErrSyntax }

func syntaxError(column int, format string, args ...any) error {
	return &SyntaxError{Column: column, Msg: fmt.Sprintf(format, args...)}
}
