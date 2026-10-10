// Command api runs the calculator HTTP service.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/LuizColombo/sezzle-calculator/api/internal/httpapi"
)

// version is injected at build time with -ldflags "-X main.version=…".
var version = "dev"

func main() {
	healthcheck := flag.Bool("healthcheck", false, "probe the running server's /healthz and exit 0 if healthy")
	flag.Parse()

	cfg, err := loadConfig(os.Getenv)
	if err != nil {
		fmt.Fprintln(os.Stderr, "config:", err)
		os.Exit(2)
	}
	if *healthcheck {
		os.Exit(probe(cfg.Port))
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	ln, err := net.Listen("tcp", ":"+cfg.Port)
	if err != nil {
		logger.Error("listen", "error", err)
		os.Exit(1)
	}
	if err := serve(ctx, ln, cfg, logger); err != nil {
		logger.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

// serve handles requests on ln until ctx is cancelled, then drains
// in-flight requests for up to 10 seconds.
func serve(ctx context.Context, ln net.Listener, cfg config, logger *slog.Logger) error {
	srv := &http.Server{
		Handler: httpapi.NewHandler(logger, version, cfg.CORSOrigins),
		// Errors from net/http itself (bad requests, TLS, accept) go to the same JSON log.
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelError),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("listening", "addr", ln.Addr().String(), "version", version)
		errCh <- srv.Serve(ln)
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	if err := <-errCh; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// probe is the container health check: distroless images ship no curl or
// wget, so the binary checks itself. It returns the process exit code.
func probe(port string) int {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/healthz")
	if err != nil {
		return 1
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
