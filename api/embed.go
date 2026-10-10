// Package api holds the files that document the service, embedded so the
// binary is self-contained.
package api

import _ "embed"

// OpenAPISpec is the OpenAPI 3.1 description of the HTTP API.
//
//go:embed openapi.yaml
var OpenAPISpec []byte

// DocsPage is the Scalar API reference bootstrap page.
//
//go:embed docs.html
var DocsPage []byte
