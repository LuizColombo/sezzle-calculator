package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"mime"
	"net/http"
	"slices"
)

// maxBodyBytes bounds request bodies; two 64-digit numbers fit comfortably.
const maxBodyBytes = 1024

// errInvalidRequest is wrapped by every decoding failure.
var errInvalidRequest = errors.New("invalid request")

// decodeInputs reads a JSON object whose keys are exactly fields and whose
// values are all JSON strings. Any deviation is reported as errInvalidRequest.
func decodeInputs(w http.ResponseWriter, r *http.Request, fields []string) (map[string]string, error) {
	ct, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || ct != "application/json" {
		return nil, fmt.Errorf("%w: Content-Type must be application/json", errInvalidRequest)
	}

	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	var raw map[string]json.RawMessage
	if err := dec.Decode(&raw); err != nil {
		if maxErr := (*http.MaxBytesError)(nil); errors.As(err, &maxErr) {
			return nil, fmt.Errorf("%w: body exceeds %d bytes", errInvalidRequest, maxBodyBytes)
		}
		return nil, fmt.Errorf("%w: body must be a JSON object", errInvalidRequest)
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("%w: unexpected data after the JSON object", errInvalidRequest)
	}
	for _, key := range slices.Sorted(maps.Keys(raw)) {
		if !slices.Contains(fields, key) {
			return nil, fmt.Errorf("%w: unexpected field %q; allowed: %q", errInvalidRequest, key, fields)
		}
	}

	inputs := make(map[string]string, len(fields))
	for _, f := range fields {
		value, ok := raw[f]
		if !ok {
			return nil, fmt.Errorf("%w: missing field %q", errInvalidRequest, f)
		}
		var s string
		if value[0] != '"' || json.Unmarshal(value, &s) != nil {
			return nil, fmt.Errorf("%w: field %q must be a string, e.g. \"1.5\"", errInvalidRequest, f)
		}
		inputs[f] = s
	}
	return inputs, nil
}

// writeJSON writes v as application/json with the given status.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
