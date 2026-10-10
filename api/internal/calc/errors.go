// Package calc implements arbitrary-precision decimal calculator operations.
// It has no dependency on HTTP, JSON or logging.
package calc

import "errors"

// Sentinel errors. Callers match them with errors.Is.
var (
	ErrInvalidNumber    = errors.New("invalid number")
	ErrNumberTooLarge   = errors.New("number too large")
	ErrDivisionByZero   = errors.New("division by zero")
	ErrNegativeSqrt     = errors.New("square root of a negative number")
	ErrInvalidPower     = errors.New("invalid power")
	ErrResultTooLarge   = errors.New("result out of range")
	ErrInvalidOperation = errors.New("invalid operation")
)
