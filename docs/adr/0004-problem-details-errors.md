# ADR 0004: RFC 9457 Problem Details for errors

**Status:** Accepted · **Date:** 2026-10-10

## Context

The assignment asks the API to handle invalid input and edge cases such as division by zero. Clients need to tell error kinds apart programmatically and show a useful message. An ad-hoc `{"error": "..."}` body works but every consumer has to learn it.

## Decision

All error responses use `application/problem+json` (RFC 9457) with `type`, `title`, `status`, `detail`, `instance`, plus a `requestId` extension. `type` is a URI whose fragment is a stable slug (`division-by-zero`) and which links to the explanation in `docs/api.md`.

Status codes:
- `400` — the request is malformed: bad JSON, missing or extra fields, non-string values, wrong content type, body too large, or a value that is not a decimal.
- `422` — the request is valid but the maths is not: division by zero, square root of a negative, invalid power, out-of-range numbers or results.
- `404` / `405` / `500` — same shape; a 500 never includes internal details.

## Consequences

- One error shape across every route, including unknown routes and wrong methods.
- The frontend switches on the slug, not on message text, and shows `detail` to the user.
- The request id ties a user-visible error to the server log line.
