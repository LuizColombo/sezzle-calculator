package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestEvaluate(t *testing.T) {
	cases := []struct{ body, expression, result string }{
		{`{"expression":"2+3*4"}`, "2 + 3 × 4", "14"},
		{`{"expression":"(2 + 3) × 4"}`, "(2 + 3) × 4", "20"},
		{`{"expression":"200 + 15%"}`, "200 + 15%", "230"},
		{`{"expression":"0.1 + 0.2"}`, "0.1 + 0.2", "0.3"},
		{`{"expression":"2 ^ −1"}`, "2 ^ −1", "0.5"},
	}
	for _, c := range cases {
		t.Run(c.body, func(t *testing.T) {
			rec := post(t, newTestHandler(), "/api/v1/evaluate", c.body)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
			}
			var resp EvaluateResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatal(err)
			}
			if resp.Expression != c.expression || resp.Result != c.result {
				t.Fatalf("got %+v, want %q = %q", resp, c.expression, c.result)
			}
		})
	}
}

func TestEvaluateSyntaxErrorHasPosition(t *testing.T) {
	rec := post(t, newTestHandler(), "/api/v1/evaluate", `{"expression":"2 + 3)"}`)
	p := decodeProblem(t, rec)
	if rec.Code != http.StatusBadRequest || !strings.HasSuffix(p.Type, "#invalid-expression") {
		t.Fatalf("got %d %s", rec.Code, p.Type)
	}
	if p.Position != 6 || p.Detail != "unexpected ')' at column 6" || p.Title != "Invalid expression" {
		t.Fatalf("problem = %+v", p)
	}
}

func TestEvaluateErrorsWithoutPositionOmitIt(t *testing.T) {
	rec := post(t, newTestHandler(), "/api/v1/evaluate", `{"expression":"`+strings.Repeat("1", 257)+`"}`)
	if strings.Contains(rec.Body.String(), "position") {
		t.Fatalf("position must be omitted when there is no location: %s", rec.Body.String())
	}
	if p := decodeProblem(t, rec); !strings.HasSuffix(p.Type, "#invalid-expression") {
		t.Fatalf("type = %s", p.Type)
	}
}

func TestEvaluateDomainErrors(t *testing.T) {
	cases := []struct {
		expression string
		status     int
		slug       string
	}{
		{"1 ÷ (2 − 2)", 422, "division-by-zero"},
		{"√(0 − 4)", 422, "negative-square-root"},
		{"1 + " + strings.Repeat("9", 35), 422, "number-too-large"},
	}
	for _, c := range cases {
		t.Run(c.slug, func(t *testing.T) {
			body, _ := json.Marshal(map[string]string{"expression": c.expression})
			rec := post(t, newTestHandler(), "/api/v1/evaluate", string(body))
			p := decodeProblem(t, rec)
			if rec.Code != c.status || !strings.HasSuffix(p.Type, "#"+c.slug) || p.Position != 0 {
				t.Fatalf("got %d %s position=%d", rec.Code, p.Type, p.Position)
			}
		})
	}
}

func TestEvaluateInvalidRequests(t *testing.T) {
	for _, body := range []string{`{}`, `{"expression":2}`, `{"expression":"1","x":"2"}`, `not json`} {
		rec := post(t, newTestHandler(), "/api/v1/evaluate", body)
		if p := decodeProblem(t, rec); rec.Code != 400 || !strings.HasSuffix(p.Type, "#invalid-request") {
			t.Errorf("body %s: got %d %s", body, rec.Code, p.Type)
		}
	}
}

func TestEvaluateRejectsOtherMethods(t *testing.T) {
	if rec := get(t, newTestHandler(), "/api/v1/evaluate"); rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d", rec.Code)
	}
}
