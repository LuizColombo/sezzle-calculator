package httpapi

import (
	"net/http"
	"slices"

	"github.com/LuizColombo/sezzle-calculator/api/internal/calc"
)

const basePath = "/api/v1/"

// Operation describes one calculator endpoint. The same table drives the
// routes and GET /api/v1/operations; openapi.yaml documents it.
type Operation struct {
	Name   string   `json:"name"`
	Path   string   `json:"path"`
	Arity  int      `json:"arity"`
	Params []string `json:"params"`

	// Exactly one of binary or unary is set.
	binary func(a, b calc.Number) (calc.Number, error)
	unary  func(v calc.Number) (calc.Number, error)
}

// Response is the body of every successful operation.
type Response struct {
	Operation string            `json:"operation"`
	Inputs    map[string]string `json:"inputs"`
	Result    string            `json:"result"`
}

func binaryOp(name string, params [2]string, fn func(a, b calc.Number) (calc.Number, error)) Operation {
	return Operation{Name: name, Path: basePath + name, Arity: 2, Params: params[:], binary: fn}
}

func unaryOp(name, param string, fn func(v calc.Number) (calc.Number, error)) Operation {
	return Operation{Name: name, Path: basePath + name, Arity: 1, Params: []string{param}, unary: fn}
}

var operations = []Operation{
	binaryOp("add", [2]string{"a", "b"}, calc.Add),
	binaryOp("subtract", [2]string{"a", "b"}, calc.Subtract),
	binaryOp("multiply", [2]string{"a", "b"}, calc.Multiply),
	binaryOp("divide", [2]string{"a", "b"}, calc.Divide),
	binaryOp("power", [2]string{"base", "exponent"}, calc.Power),
	unaryOp("sqrt", "value", calc.Sqrt),
	binaryOp("percent", [2]string{"value", "percent"}, calc.Percent),
}

// handler decodes the inputs, runs the operation and writes the result.
func (op Operation) handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		inputs, err := decodeInputs(w, r, op.Params)
		if err != nil {
			writeProblem(w, r, http.StatusBadRequest, "invalid-request", titles["invalid-request"], err.Error())
			return
		}

		args := make([]calc.Number, len(op.Params))
		for i, field := range op.Params {
			if args[i], err = calc.Parse(inputs[field]); err != nil {
				writeError(w, r, err)
				return
			}
		}

		var result calc.Number
		if op.unary != nil {
			result, err = op.unary(args[0])
		} else {
			result, err = op.binary(args[0], args[1])
		}
		if err != nil {
			writeError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, Response{Operation: op.Name, Inputs: inputs, Result: result.String()})
	}
}

// evaluateOperation describes POST /api/v1/evaluate in the operations list.
// It is listed only: it is routed separately in server.go and has no
// binary/unary function, so it must never join the operations table.
var evaluateOperation = Operation{
	Name: "evaluate", Path: basePath + "evaluate", Arity: 1, Params: []string{"expression"},
}

// listOperations serves GET /api/v1/operations.
func listOperations(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, append(slices.Clone(operations), evaluateOperation))
}
