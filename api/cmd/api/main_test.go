package main

import (
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

func TestLoadConfigDefaults(t *testing.T) {
	cfg, err := loadConfig(func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "8080" || cfg.LogLevel != slog.LevelInfo || len(cfg.CORSOrigins) != 0 {
		t.Fatalf("cfg = %+v", cfg)
	}
}

func TestLoadConfigFromEnv(t *testing.T) {
	env := map[string]string{"PORT": "9000", "LOG_LEVEL": "debug", "CORS_ORIGINS": "http://a.test, http://b.test,"}
	cfg, err := loadConfig(func(k string) string { return env[k] })
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "9000" || cfg.LogLevel != slog.LevelDebug {
		t.Fatalf("cfg = %+v", cfg)
	}
	if len(cfg.CORSOrigins) != 2 || cfg.CORSOrigins[1] != "http://b.test" {
		t.Fatalf("origins = %v", cfg.CORSOrigins)
	}
}

func TestLoadConfigRejectsBadValues(t *testing.T) {
	for _, env := range []map[string]string{
		{"PORT": "abc"},
		{"PORT": "0"},
		{"PORT": "70000"},
		{"LOG_LEVEL": "loud"},
	} {
		if _, err := loadConfig(func(k string) string { return env[k] }); err == nil {
			t.Errorf("expected error for %v", env)
		}
	}
}

func TestServeAnswersAndShutsDownOnCancel(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- serve(ctx, ln, config{}, slog.New(slog.NewTextHandler(io.Discard, nil))) }()

	resp, err := http.Get("http://" + ln.Addr().String() + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("serve returned %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("server did not shut down")
	}
}

func TestProbe(t *testing.T) {
	healthy := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer healthy.Close()
	if code := probe(portOf(t, healthy.URL)); code != 0 {
		t.Fatalf("healthy probe exit = %d", code)
	}

	failing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer failing.Close()
	if code := probe(portOf(t, failing.URL)); code != 1 {
		t.Fatalf("failing probe exit = %d", code)
	}

	failing.Close()
	if code := probe(portOf(t, failing.URL)); code != 1 {
		t.Fatalf("unreachable probe exit = %d", code)
	}
}

func portOf(t *testing.T, rawURL string) string {
	t.Helper()
	u, err := url.Parse(rawURL)
	if err != nil {
		t.Fatal(err)
	}
	return u.Port()
}
