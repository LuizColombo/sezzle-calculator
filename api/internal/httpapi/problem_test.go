package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/LuizColombo/sezzle-calculator/api/internal/calc"
)

func TestWriteProblem(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/divide", nil)
	req = req.WithContext(withRequestID(req.Context(), "req-123"))

	writeProblem(rec, req, http.StatusUnprocessableEntity, "division-by-zero", "Division by zero", "divisor must not be zero")

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != problemContentType {
		t.Fatalf("content-type = %q", ct)
	}
	var p Problem
	if err := json.Unmarshal(rec.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	want := Problem{
		Type:      typeBase + "division-by-zero",
		Title:     "Division by zero",
		Status:    422,
		Detail:    "divisor must not be zero",
		Instance:  "/api/v1/divide",
		RequestID: "req-123",
	}
	if p != want {
		t.Fatalf("got %+v, want %+v", p, want)
	}
}

func TestProblemFromError(t *testing.T) {
	cases := []struct {
		err    error
		status int
		slug   string
	}{
		{calc.ErrInvalidNumber, 400, "invalid-number"},
		{calc.ErrNumberTooLarge, 422, "number-too-large"},
		{calc.ErrDivisionByZero, 422, "division-by-zero"},
		{calc.ErrNegativeSqrt, 422, "negative-square-root"},
		{calc.ErrInvalidPower, 422, "invalid-power"},
		{calc.ErrResultTooLarge, 422, "result-too-large"},
		{calc.ErrInvalidOperation, 422, "invalid-operation"},
		{errors.New("something else"), 500, "internal-error"},
	}
	for _, c := range cases {
		t.Run(c.slug, func(t *testing.T) {
			status, slug, _ := problemFromError(c.err)
			if status != c.status || slug != c.slug {
				t.Fatalf("got (%d, %q), want (%d, %q)", status, slug, c.status, c.slug)
			}
		})
	}
}

func TestProblemFromErrorHidesInternalDetail(t *testing.T) {
	_, _, detail := problemFromError(errors.New("secret stack info"))
	if detail != "" {
		t.Fatalf("internal detail must not leak, got %q", detail)
	}
}

func TestProblemFromErrorKeepsDomainDetail(t *testing.T) {
	err := fmt.Errorf("%w: zero to a negative power", calc.ErrInvalidPower)
	_, _, detail := problemFromError(err)
	if detail != "invalid power: zero to a negative power" {
		t.Fatalf("detail = %q", detail)
	}
}
