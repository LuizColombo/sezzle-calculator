.PHONY: run test cover lint fuzz build

run:
	go run ./cmd/api

test:
	go test -race ./...

cover:
	go test -coverprofile=coverage.out ./... && go tool cover -html=coverage.out -o coverage.html
	go tool cover -func=coverage.out | tail -1

lint:
	golangci-lint run

fuzz:
	go test -run='^$$' -fuzz=FuzzParse -fuzztime=20s ./internal/calc

build:
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o api ./cmd/api
