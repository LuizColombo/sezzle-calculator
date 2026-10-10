package httpapi

import (
	"net/http"

	api "github.com/LuizColombo/sezzle-calculator/api"
)

// registerDocs serves the embedded OpenAPI spec and the Scalar reference UI.
func registerDocs(mux *http.ServeMux) {
	route(mux, http.MethodGet, "/openapi.yaml", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
		_, _ = w.Write(api.OpenAPISpec)
	}))
	route(mux, http.MethodGet, "/docs", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(api.DocsPage)
	}))
}
