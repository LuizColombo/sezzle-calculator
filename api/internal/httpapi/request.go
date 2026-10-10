package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"slices"
	"strings"
)

// maxBodyBytes bounds request bodies; two 34-digit numbers fit many times over.
const maxBodyBytes = 1024

// errInvalidRequest is wrapped by every decoding failure.
var errInvalidRequest = errors.New("invalid request")

func invalid(format string, args ...any) error {
	return fmt.Errorf("%w: "+format, append([]any{errInvalidRequest}, args...)...)
}

// decodeInputs reads a JSON object whose keys are exactly fields, each once,
// and whose values are all JSON strings. Any deviation is errInvalidRequest.
//
// The object is walked token by token rather than decoded into a map so that
// a repeated key is rejected instead of silently overwriting the first one.
func decodeInputs(w http.ResponseWriter, r *http.Request, fields []string) (map[string]string, error) {
	ct, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || ct != "application/json" {
		return nil, invalid("Content-Type must be application/json")
	}

	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	malformed := func(err error) error {
		if maxErr := (*http.MaxBytesError)(nil); errors.As(err, &maxErr) {
			return invalid("body exceeds %d bytes", maxBodyBytes)
		}
		return invalid("body must be a JSON object")
	}

	if tok, err := dec.Token(); err != nil || tok != json.Delim('{') {
		return nil, malformed(err)
	}
	inputs := make(map[string]string, len(fields))
	for dec.More() {
		tok, err := dec.Token()
		if err != nil {
			return nil, malformed(err)
		}
		key, _ := tok.(string) // object keys are always strings
		if !slices.Contains(fields, key) {
			return nil, invalid("unexpected field %q; allowed: %s", key, strings.Join(fields, ", "))
		}
		if _, seen := inputs[key]; seen {
			return nil, invalid("duplicate field %q", key)
		}
		var value json.RawMessage
		if err := dec.Decode(&value); err != nil {
			return nil, malformed(err)
		}
		var s string
		if value[0] != '"' || json.Unmarshal(value, &s) != nil {
			return nil, invalid("field %q must be a string, e.g. \"1.5\"", key)
		}
		inputs[key] = s
	}
	if _, err := dec.Token(); err != nil { // the closing brace
		return nil, malformed(err)
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return nil, invalid("unexpected data after the JSON object")
	}

	for _, f := range fields {
		if _, ok := inputs[f]; !ok {
			return nil, invalid("missing field %q", f)
		}
	}
	return inputs, nil
}

// writeJSON writes v as application/json with the given status.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
