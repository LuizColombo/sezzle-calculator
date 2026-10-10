# ADR 0005: Layered packages, not clean/hexagonal architecture

**Status:** Accepted · **Date:** 2026-10-10

## Context

The assignment rewards "testable architecture". A common answer is clean or hexagonal architecture: entities, use-case interfaces, ports, adapters, dependency-injection containers. For a stateless calculator with one transport and no storage, each of those interfaces would have exactly one implementation.

## Decision

Two packages with the dependency pointing inward:

- `internal/calc` — the domain. Pure functions over a `Number` type and sentinel errors. Imports nothing from HTTP, JSON or logging.
- `internal/httpapi` — the transport. Decodes requests, calls `calc`, maps errors to Problem Details.

`cmd/api` wires configuration and the server lifecycle.

## Consequences

- The domain is tested without HTTP; the transport is tested with `httptest` end to end. Coverage is above 90 % in both without mocks.
- Adding a gRPC or CLI front end means a new sibling of `httpapi`; `calc` does not change.
- No interfaces exist only to be mocked. Revisit when there is a second implementation of something — a persistence layer for history, or an external rate source — and introduce the interface at that point.
