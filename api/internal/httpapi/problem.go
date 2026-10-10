// Package httpapi exposes the calculator over HTTP/JSON.
package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/LuizColombo/sezzle-calculator/api/internal/calc"
)

const (
	problemContentType = "application/problem+json"
	// typeBase prefixes every problem "type" URI; the anchors exist in docs/api.md.
	typeBase = "https://github.com/LuizColombo/sezzle-calculator/blob/main/docs/api.md#"
)

// Problem is an RFC 9457 Problem Details body.
type Problem struct {
	Type      string `json:"type"`
	Title     string `json:"title"`
	Status    int    `json:"status"`
	Detail    string `json:"detail,omitempty"`
	Instance  string `json:"instance,omitempty"`
	RequestID string `json:"requestId,omitempty"`
}

// domainErrors maps calc sentinel errors to their HTTP representation.
var domainErrors = []struct {
	target error
	status int
	slug   string
}{
	{calc.ErrInvalidNumber, http.StatusBadRequest, "invalid-number"},
	{calc.ErrNumberTooLarge, http.StatusUnprocessableEntity, "number-too-large"},
	{calc.ErrDivisionByZero, http.StatusUnprocessableEntity, "division-by-zero"},
	{calc.ErrNegativeSqrt, http.StatusUnprocessableEntity, "negative-square-root"},
	{calc.ErrInvalidPower, http.StatusUnprocessableEntity, "invalid-power"},
	{calc.ErrResultTooLarge, http.StatusUnprocessableEntity, "result-too-large"},
	{calc.ErrInvalidOperation, http.StatusUnprocessableEntity, "invalid-operation"},
}

// writeProblem writes a problem+json response.
func writeProblem(w http.ResponseWriter, r *http.Request, status int, slug, title, detail string) {
	w.Header().Set("Content-Type", problemContentType)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Problem{
		Type:      typeBase + slug,
		Title:     title,
		Status:    status,
		Detail:    detail,
		Instance:  r.URL.Path,
		RequestID: requestIDFrom(r.Context()),
	})
}

// problemFromError maps an error to an HTTP status, a type slug and a safe
// detail message. Unknown errors become a 500 with no detail.
func problemFromError(err error) (status int, slug, detail string) {
	for _, m := range domainErrors {
		if errors.Is(err, m.target) {
			return m.status, m.slug, err.Error()
		}
	}
	return http.StatusInternalServerError, "internal-error", ""
}

// titles maps problem slugs to human-readable titles.
var titles = map[string]string{
	"invalid-request":      "Invalid request",
	"invalid-number":       "Invalid number",
	"number-too-large":     "Number too large",
	"division-by-zero":     "Division by zero",
	"negative-square-root": "Square root of a negative number",
	"invalid-power":        "Invalid power",
	"result-too-large":     "Result out of range",
	"invalid-operation":    "Invalid operation",
	"not-found":            "Not found",
	"method-not-allowed":   "Method not allowed",
	"internal-error":       "Internal server error",
}

// writeError writes the problem for a domain error.
func writeError(w http.ResponseWriter, r *http.Request, err error) {
	status, slug, detail := problemFromError(err)
	writeProblem(w, r, status, slug, titles[slug], detail)
}
