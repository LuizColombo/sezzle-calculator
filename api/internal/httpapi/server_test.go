package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func get(t *testing.T, h http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

func TestHealthz(t *testing.T) {
	rec := get(t, newTestHandler(), "/healthz")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "ok" || body["version"] != "test" {
		t.Fatalf("body = %v", body)
	}
}

func TestNotFoundIsProblem(t *testing.T) {
	rec := get(t, newTestHandler(), "/nope")
	p := decodeProblem(t, rec)
	if rec.Code != http.StatusNotFound || !strings.HasSuffix(p.Type, "#not-found") {
		t.Fatalf("got %d %s", rec.Code, p.Type)
	}
}

func TestUnknownOperationIsNotFound(t *testing.T) {
	rec := post(t, newTestHandler(), "/api/v1/modulo", `{}`)
	p := decodeProblem(t, rec)
	if rec.Code != http.StatusNotFound || !strings.HasSuffix(p.Type, "#not-found") {
		t.Fatalf("got %d %s", rec.Code, p.Type)
	}
}

func TestWrongMethodIsProblem(t *testing.T) {
	rec := get(t, newTestHandler(), "/api/v1/add")
	p := decodeProblem(t, rec)
	if rec.Code != http.StatusMethodNotAllowed || !strings.HasSuffix(p.Type, "#method-not-allowed") {
		t.Fatalf("got %d %s", rec.Code, p.Type)
	}
	if allow := rec.Header().Get("Allow"); allow != "POST" {
		t.Fatalf("Allow = %q", allow)
	}
}

func TestWrongMethodOnOperationsList(t *testing.T) {
	rec := post(t, newTestHandler(), "/api/v1/operations", `{}`)
	if rec.Code != http.StatusMethodNotAllowed || rec.Header().Get("Allow") != "GET" {
		t.Fatalf("got %d Allow=%q", rec.Code, rec.Header().Get("Allow"))
	}
}

func TestRequestIDIsGeneratedAndEchoed(t *testing.T) {
	rec := post(t, newTestHandler(), "/api/v1/add", `{"a":"1","b":"2"}`)
	if len(rec.Header().Get("X-Request-ID")) != 16 {
		t.Fatalf("X-Request-ID = %q", rec.Header().Get("X-Request-ID"))
	}
	rec = post(t, newTestHandler(), "/api/v1/add", `{"a":"1","b":"2"}`, "X-Request-ID", "client-42")
	if got := rec.Header().Get("X-Request-ID"); got != "client-42" {
		t.Fatalf("X-Request-ID = %q", got)
	}
}

func TestRequestIDRejectsUnsafeClientValues(t *testing.T) {
	for _, bad := range []string{strings.Repeat("a", 129), "has space", "line\x7fbreak"} {
		rec := post(t, newTestHandler(), "/api/v1/add", `{"a":"1","b":"2"}`, "X-Request-ID", bad)
		if got := rec.Header().Get("X-Request-ID"); got == bad || len(got) != 16 {
			t.Errorf("unsafe id %q was echoed as %q", bad, got)
		}
	}
}

func TestRequestIDAppearsInProblem(t *testing.T) {
	rec := post(t, newTestHandler(), "/api/v1/divide", `{"a":"1","b":"0"}`, "X-Request-ID", "client-42")
	if p := decodeProblem(t, rec); p.RequestID != "client-42" {
		t.Fatalf("requestId = %q", p.RequestID)
	}
}

func TestRecoverTurnsPanicInto500(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))
	h := chain(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") }), recoverPanics(logger))
	rec := get(t, h, "/x")
	p := decodeProblem(t, rec)
	if rec.Code != http.StatusInternalServerError || p.Detail != "" {
		t.Fatalf("got %d detail=%q", rec.Code, p.Detail)
	}
	if !strings.Contains(buf.String(), "boom") {
		t.Fatal("panic should be logged")
	}
}

func TestRequestLogging(t *testing.T) {
	var buf bytes.Buffer
	h := NewHandler(slog.New(slog.NewJSONHandler(&buf, nil)), "test", nil)
	post(t, h, "/api/v1/add", `{"a":"1","b":"2"}`)
	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("log is not one JSON line: %s", buf.String())
	}
	if entry["method"] != "POST" || entry["path"] != "/api/v1/add" || entry["status"] != float64(200) {
		t.Fatalf("entry = %v", entry)
	}
	if entry["requestId"] == "" || entry["durationMs"] == nil {
		t.Fatalf("entry = %v", entry)
	}
}

func TestCORSDisabledByDefault(t *testing.T) {
	rec := post(t, newTestHandler(), "/api/v1/add", `{"a":"1","b":"2"}`, "Origin", "http://localhost:5173")
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("CORS headers must be absent when no origins are configured")
	}
}

func TestCORSPreflightAndAllowedOrigin(t *testing.T) {
	h := NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)), "test", []string{"http://localhost:5173"})

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/add", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", "POST")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Fatalf("allow-origin = %q", rec.Header().Get("Access-Control-Allow-Origin"))
	}
	if !strings.Contains(rec.Header().Get("Access-Control-Allow-Headers"), "Content-Type") {
		t.Fatal("preflight must allow Content-Type")
	}

	rec = post(t, h, "/api/v1/add", `{"a":"1","b":"2"}`, "Origin", "http://localhost:5173")
	if rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Fatal("allowed origin must get the header on the actual request")
	}

	rec = post(t, h, "/api/v1/add", `{"a":"1","b":"2"}`, "Origin", "http://evil.example")
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("unknown origin must not be allowed")
	}
}

func TestOpenAPIIsServed(t *testing.T) {
	rec := get(t, newTestHandler(), "/openapi.yaml")
	if rec.Code != http.StatusOK || !strings.HasPrefix(rec.Header().Get("Content-Type"), "application/yaml") {
		t.Fatalf("got %d %s", rec.Code, rec.Header().Get("Content-Type"))
	}
	body := rec.Body.String()
	for _, op := range operations {
		if !strings.Contains(body, op.Path+":") {
			t.Errorf("openapi.yaml does not document %s", op.Path)
		}
		for _, param := range op.Params {
			if !strings.Contains(body, param+":") {
				t.Errorf("openapi.yaml does not mention parameter %q of %s", param, op.Name)
			}
		}
	}
	for slug := range titles {
		if !strings.Contains(body, slug) {
			t.Errorf("openapi.yaml does not mention problem type %q", slug)
		}
	}
}

func TestDocsPageIsServed(t *testing.T) {
	rec := get(t, newTestHandler(), "/docs")
	if rec.Code != http.StatusOK || !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/html") {
		t.Fatalf("got %d %s", rec.Code, rec.Header().Get("Content-Type"))
	}
	if !strings.Contains(rec.Body.String(), "/openapi.yaml") {
		t.Fatal("docs page must reference the spec")
	}
}

func TestRecoverRepanicsAbortHandler(t *testing.T) {
	h := chain(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic(http.ErrAbortHandler) }),
		recoverPanics(slog.New(slog.NewTextHandler(io.Discard, nil))))
	defer func() {
		if rec := recover(); rec != http.ErrAbortHandler {
			t.Fatalf("recovered %v, want http.ErrAbortHandler to propagate", rec)
		}
	}()
	get(t, h, "/x")
	t.Fatal("expected a panic")
}

func TestRecoverDoesNotOverwriteAStartedResponse(t *testing.T) {
	var buf bytes.Buffer
	h := chain(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("partial"))
		panic("late failure")
	}), recoverPanics(slog.New(slog.NewJSONHandler(&buf, nil))))
	rec := get(t, h, "/x")
	if rec.Code != http.StatusOK || rec.Body.String() != "partial" {
		t.Fatalf("got %d %q, want the original 200 response untouched", rec.Code, rec.Body.String())
	}
	if !strings.Contains(buf.String(), "late failure") {
		t.Fatal("panic should still be logged")
	}
}
