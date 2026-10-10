package httpapi

import (
	"log/slog"
	"net/http"
)

// NewHandler wires routes and middleware. An empty corsOrigins disables CORS.
func NewHandler(logger *slog.Logger, version string, corsOrigins []string) http.Handler {
	mux := http.NewServeMux()

	for _, op := range operations {
		route(mux, http.MethodPost, op.Path, op.handler())
	}
	route(mux, http.MethodPost, evaluateOperation.Path, http.HandlerFunc(evaluate))
	route(mux, http.MethodGet, basePath+"operations", http.HandlerFunc(listOperations))
	route(mux, http.MethodGet, "/healthz", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": version})
	}))
	registerDocs(mux)
	mux.HandleFunc("/", notFound)

	return chain(mux,
		recoverPanics(logger),
		requestID(),
		logRequests(logger),
		cors(corsOrigins),
	)
}

// route registers h for method+path and answers every other method on the
// same path with a problem+json 405. The stdlib mux would otherwise reply
// with a plain-text 405.
func route(mux *http.ServeMux, method, path string, h http.Handler) {
	mux.Handle(method+" "+path, h)
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Allow", method)
		writeProblem(w, r, http.StatusMethodNotAllowed, "method-not-allowed", titles["method-not-allowed"],
			"use "+method+" "+path)
	})
}

func notFound(w http.ResponseWriter, r *http.Request) {
	writeProblem(w, r, http.StatusNotFound, "not-found", titles["not-found"], "no route for "+r.Method+" "+r.URL.Path)
}
