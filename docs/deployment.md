# Deployment

The whole stack runs with Docker Compose. Nothing needs to be installed on the host besides Docker.

```bash
docker compose up --build        # http://localhost:8080
WEB_PORT=3000 docker compose up --build   # if 8080 is taken
docker compose down
```

```
browser ──► web (nginx :80, published on $WEB_PORT)
              ├── /             built React app
              ├── /api/*        ──► api (Go :8080, internal network only)
              └── /docs, /openapi.yaml, /healthz ──► api
```

The browser only ever talks to nginx, so in Docker there is a single origin and no CORS.

## Images

| Image | Build | Runtime | Size |
|---|---|---|---|
| `api` | `golang:1.27-alpine`, `CGO_ENABLED=0`, `-trimpath -ldflags "-s -w"`, module and build caches mounted | `gcr.io/distroless/static-debian12:nonroot`: no shell, no package manager, non-root user | ≈ 17 MB |
| `web` | `node:24-alpine`, `npm ci` with a cached npm directory, `vite build` | `nginx:1.31-alpine` serving `dist/` | ≈ 94 MB (almost all nginx; the app is ≈ 0.4 MB) |

Base images are pinned to a minor version so a rebuild in three months produces the same stack. Both services have a `.dockerignore`, so build contexts never include `node_modules`, coverage output or the other service.

## Compose

- **Health checks.** The API image has no shell or curl, so the binary checks itself: `/api -healthcheck` requests `/healthz` and exits 0 or 1. nginx is checked with `wget`.
- **Start order.** `web` waits for `api` to be healthy (`depends_on: condition: service_healthy`), so the first request never hits a proxy with nothing behind it. `docker compose up --wait` returns only when both are healthy.
- **Failed builds are harmless.** Compose builds every image before replacing any container. If a build fails, the stack that was running keeps running.
- **Restarts and signals.** `restart: unless-stopped`; `init: true` forwards `SIGTERM`, so the API drains in-flight requests for up to 10 s on `docker compose down`.
- **Hardening.** Only `web` publishes a port. The API container is read-only and both run with `no-new-privileges`. nginx resolves `api` through Docker's DNS on each request, so a restarted API container with a new IP keeps working.
- **Line endings.** `.gitattributes` forces LF, so a clone on Windows does not turn `nginx.conf` or the Dockerfiles into CRLF.

## nginx

- Hashed assets under `/assets/` are cached for a year (`immutable`); `index.html` is always revalidated, so a deploy is picked up on the next load. A missing asset is a `404`, not the app shell.
- gzip for text, JSON, Problem Details and YAML.
- Security headers on every response: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, and a Content Security Policy on the app (`default-src 'self'`, inline styles allowed for animation, no framing).
- `/api/` is proxied with `X-Request-ID` set to nginx's request id, so a browser request, the nginx log and the API log line share one id.

## Configuration

| Variable | Default | Used by | Meaning |
|---|---|---|---|
| `WEB_PORT` | `8080` | compose | Host port for the app. |
| `LOG_LEVEL` | `info` | api | `debug`, `info`, `warn` or `error`. |
| `VERSION` | `dev` | api build | Reported by `/healthz`. |

All are optional; `.env.example` documents them.

## Intentionally out of scope

- **TLS.** Terminate it at a load balancer or ingress in front of nginx.
- **Image registry and tags.** CI builds the images to prove they build; publishing them is a deployment decision.
- **Orchestration.** The services are stateless and configured through the environment, so they move to Kubernetes or ECS without code changes.
