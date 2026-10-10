# ADR 0001: Standard library router

**Status:** Accepted · **Date:** 2026-10-10

## Context

The API needs method-aware routing for a handful of fixed paths. Go 1.22 added method and wildcard patterns to `net/http.ServeMux` (`"POST /api/v1/add"`). gorilla/mux is a well-known alternative and appears in Sezzle's own coding exercises; it was archived in December 2022 and revived in 2023. chi and similar routers add middleware helpers we do not need.

## Decision

Use `net/http.ServeMux` with method patterns. Handlers stay plain `http.Handler` values so the router can be swapped without touching them.

## Consequences

- No routing dependency; the only runtime dependency of the API is the decimal library.
- Switching to gorilla/mux is a change in one function (`NewHandler` in `internal/httpapi/server.go`).
- The stdlib mux answers a wrong method with a plain-text 405. A small `route` helper registers a method-less fallback per path so every 405 is `application/problem+json` with a correct `Allow` header.
- Revisit if routes need regex constraints, subrouters per version, or host matching.
