# Convenience targets. Nothing here is required: `docker compose up --build`
# runs the whole app, and each service has its own npm/go commands.

.PHONY: help dev dev-api dev-web install test cover lint gen up down e2e

help: ## List targets
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

install: ## Install frontend dependencies
	cd web && npm ci

dev: ## Run the API (:8080) and Vite (:5173) natively, in parallel
	$(MAKE) -j2 dev-api dev-web

dev-api:
	cd api && go run ./cmd/api

dev-web:
	cd web && npm run dev

test: ## Unit and integration tests for both services
	cd api && go test -race ./...
	cd web && npm test

cover: ## Coverage reports: api/coverage.html and web/coverage/
	cd api && $(MAKE) cover
	cd web && npm run test:coverage

lint: ## Linters, formatters and type checks for both services
	cd api && golangci-lint run
	cd web && npm run lint && npm run format:check && npm run typecheck

gen: ## Regenerate frontend API types from api/openapi.yaml
	cd web && npm run gen

up: ## Build and run the stack with Docker on http://localhost:8080
	docker compose up --build

down: ## Stop the Docker stack
	docker compose down

e2e: ## Playwright against the Docker stack (starts and stops it)
	docker compose up --build --detach --wait
	cd web && npm run e2e; status=$$?; cd .. && docker compose down; exit $$status
