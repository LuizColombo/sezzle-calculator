package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newTestHandler() http.Handler {
	return NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), "test", nil)
}

func post(t *testing.T, h http.Handler, path, body string, headers ...string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func decodeProblem(t *testing.T, rec *httptest.ResponseRecorder) Problem {
	t.Helper()
	if ct := rec.Header().Get("Content-Type"); ct != problemContentType {
		t.Fatalf("content-type = %q, body = %s", ct, rec.Body.String())
	}
	var p Problem
	if err := json.Unmarshal(rec.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestOperationsHappyPath(t *testing.T) {
	h := newTestHandler()
	cases := []struct {
		path, body, want string
	}{
		{"/api/v1/add", `{"a":"0.1","b":"0.2"}`, "0.3"},
		{"/api/v1/subtract", `{"a":"5","b":"7"}`, "-2"},
		{"/api/v1/multiply", `{"a":"1.5","b":"2"}`, "3"},
		{"/api/v1/divide", `{"a":"1","b":"8"}`, "0.125"},
		{"/api/v1/power", `{"base":"2","exponent":"10"}`, "1024"},
		{"/api/v1/sqrt", `{"value":"16"}`, "4"},
		{"/api/v1/percent", `{"value":"200","percent":"15"}`, "30"},
	}
	for _, c := range cases {
		t.Run(c.path, func(t *testing.T) {
			rec := post(t, h, c.path, c.body)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Fatalf("content-type = %q", ct)
			}
			var resp Response
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatal(err)
			}
			if resp.Result != c.want {
				t.Fatalf("result = %q, want %q", resp.Result, c.want)
			}
			if resp.Operation != strings.TrimPrefix(c.path, "/api/v1/") {
				t.Fatalf("operation = %q", resp.Operation)
			}
		})
	}
}

func TestOperationsEchoInputs(t *testing.T) {
	rec := post(t, newTestHandler(), "/api/v1/add", `{"a":"1","b":"2"}`)
	var resp Response
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Inputs["a"] != "1" || resp.Inputs["b"] != "2" {
		t.Fatalf("inputs = %v", resp.Inputs)
	}
}

func TestOperationsDomainErrors(t *testing.T) {
	h := newTestHandler()
	cases := []struct {
		path, body string
		status     int
		slug       string
	}{
		{"/api/v1/divide", `{"a":"1","b":"0"}`, 422, "division-by-zero"},
		{"/api/v1/sqrt", `{"value":"-1"}`, 422, "negative-square-root"},
		{"/api/v1/power", `{"base":"0","exponent":"-1"}`, 422, "invalid-power"},
		{"/api/v1/multiply", `{"a":"1e600","b":"1e600"}`, 422, "result-too-large"},
		{"/api/v1/add", `{"a":"1e1001","b":"1"}`, 422, "number-too-large"},
		{"/api/v1/add", `{"a":"abc","b":"1"}`, 400, "invalid-number"},
		{"/api/v1/add", `{"a":"NaN","b":"1"}`, 400, "invalid-number"},
	}
	for _, c := range cases {
		t.Run(c.slug+c.path, func(t *testing.T) {
			rec := post(t, h, c.path, c.body)
			p := decodeProblem(t, rec)
			if rec.Code != c.status || !strings.HasSuffix(p.Type, "#"+c.slug) {
				t.Fatalf("got %d %s, want %d %s", rec.Code, p.Type, c.status, c.slug)
			}
			if p.Instance != c.path {
				t.Fatalf("instance = %q", p.Instance)
			}
		})
	}
}

func TestOperationsInvalidRequests(t *testing.T) {
	h := newTestHandler()
	cases := []struct {
		name, body string
		headers    []string
	}{
		{name: "malformed json", body: `{"a":"1",`},
		{name: "missing field", body: `{"a":"1"}`},
		{name: "unknown field", body: `{"a":"1","b":"2","c":"3"}`},
		{name: "number instead of string", body: `{"a":1,"b":2}`},
		{name: "null value", body: `{"a":null,"b":"2"}`},
		{name: "empty body", body: ``},
		{name: "trailing data", body: `{"a":"1","b":"2"} {}`},
		{name: "array body", body: `["1","2"]`},
		{name: "duplicate key", body: `{"a":"1","a":"5","b":"2"}`},
		{name: "unterminated object", body: `{"a":"1","b":"2"`},
		{name: "nested object value", body: `{"a":{"x":"1"},"b":"2"}`},
		{name: "oversized body", body: `{"a":"` + strings.Repeat("1", 2000) + `","b":"1"}`},
		{name: "wrong content type", body: `{"a":"1","b":"2"}`, headers: []string{"Content-Type", "text/plain"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := post(t, h, "/api/v1/add", c.body, c.headers...)
			p := decodeProblem(t, rec)
			if rec.Code != http.StatusBadRequest || !strings.HasSuffix(p.Type, "#invalid-request") {
				t.Fatalf("got %d %s", rec.Code, p.Type)
			}
		})
	}
}

func TestInvalidRequestDetailNamesTheProblem(t *testing.T) {
	h := newTestHandler()
	cases := []struct{ body, want string }{
		{`{"a":"1"}`, `missing field "b"`},
		{`{"a":"1","b":"2","c":"3"}`, `unexpected field "c"; allowed: a, b`},
		{`{"a":"1","a":"5","b":"2"}`, `duplicate field "a"`},
		{`{"a":1,"b":"2"}`, `field "a" must be a string`},
	}
	for _, c := range cases {
		p := decodeProblem(t, post(t, h, "/api/v1/add", c.body))
		if !strings.Contains(p.Detail, c.want) {
			t.Errorf("body %s: detail = %q, want it to contain %q", c.body, p.Detail, c.want)
		}
	}
}

func TestOperationsAcceptCharsetInContentType(t *testing.T) {
	rec := post(t, newTestHandler(), "/api/v1/add", `{"a":"1","b":"2"}`, "Content-Type", "application/json; charset=utf-8")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestListOperations(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/operations", nil)
	rec := httptest.NewRecorder()
	newTestHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var ops []Operation
	if err := json.Unmarshal(rec.Body.Bytes(), &ops); err != nil {
		t.Fatal(err)
	}
	if len(ops) != 7 {
		t.Fatalf("got %d operations, want 7", len(ops))
	}
	if ops[0].Name != "add" || ops[0].Path != "/api/v1/add" || ops[0].Arity != 2 {
		t.Fatalf("first op = %+v", ops[0])
	}
	if ops[5].Name != "sqrt" || ops[5].Arity != 1 {
		t.Fatalf("sqrt op = %+v", ops[5])
	}
}
