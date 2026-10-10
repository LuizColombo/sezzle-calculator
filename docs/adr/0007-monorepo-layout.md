# ADR 0007: One repository, each service owns its build

**Status:** Accepted · **Date:** 2026-10-10

## Context

The deliverable is a single repository with a frontend and a backend that run together. Options: two repositories (each independently deployable, but reviewers would have to clone and wire two things); one repository with a shared `infra/` folder holding all Dockerfiles and compose files; or one repository where each service is self-contained.

## Decision

```
api/   Go module, its Dockerfile, Makefile and lint config
web/   Node project, its Dockerfile and nginx config
docker-compose.yml, Makefile, .github/  at the root, orchestrating both
docs/  everything a reader needs that is not code
```

Each service builds with its own directory as the Docker context. The root only composes them.

## Consequences

- A service can be built, tested or extracted into its own repository without touching the other.
- Build contexts stay small: neither image ever sees the other service's files.
- The one shared artefact, `api/openapi.yaml`, lives with its owner; the frontend generates types from it and CI fails if they drift.
- An `infra/` folder would have held one compose file; it is not worth the indirection until there is more infrastructure (Terraform, Helm charts).
