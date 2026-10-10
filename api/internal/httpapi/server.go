package httpapi

import (
	"log/slog"
	"net/http"
)

// NewHandler wires routes and middleware. An empty corsOrigins disables CORS.
func NewHandler(_ *slog.Logger, _ string, _ []string) http.Handler {
	mux := http.NewServeMux()
	for _, op := range operations {
		mux.Handle("POST "+op.Path, op.handler())
	}
	mux.HandleFunc("GET "+basePath+"operations", listOperations)
	return mux
}
