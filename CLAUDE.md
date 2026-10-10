# Sezzle Calculator — conventions for AI tooling

- Language: English everywhere (code, comments, commits, docs).
- Design: `docs/specs/`. Plan: `docs/plans/`. Decisions: `docs/adr/`. Read the spec before changing behaviour.
- Backend (`api/`): Go, stdlib `net/http`, `log/slog`, `cockroachdb/apd` for decimals. Domain in `internal/calc` never imports HTTP or JSON. Handlers in `internal/httpapi` are thin.
- Frontend (`web/`): React 19 + TypeScript strict + Vite. Calculator logic lives in `src/features/calculator/model/reducer.ts` (pure). Components only render. Styling: CSS Modules + tokens in `src/styles/tokens.css`. Animations: `motion`.
- Numbers cross the API as JSON strings. Errors are `application/problem+json`.
- Tests first. `cd api && go test ./...` and `cd web && npm test` must pass before every commit.
- Commits: Conventional Commits, subject ≤ 50 chars, one logical change per commit, no attribution trailers.
- Run everything: `docker compose up`. Dev: `make dev`.
