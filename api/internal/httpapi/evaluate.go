package httpapi

import (
	"net/http"

	"github.com/LuizColombo/sezzle-calculator/api/internal/expr"
)

// EvaluateResponse is the body of a successful POST /api/v1/evaluate.
type EvaluateResponse struct {
	// Expression is the canonical form: normalised spacing and operator
	// symbols, numbers and parentheses as typed.
	Expression string `json:"expression"`
	Result     string `json:"result"`
}

// evaluate parses and evaluates an expression with operator precedence.
func evaluate(w http.ResponseWriter, r *http.Request) {
	inputs, err := decodeInputs(w, r, evaluateOperation.Params)
	if err != nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid-request", titles["invalid-request"], err.Error())
		return
	}
	tree, err := expr.Parse(inputs["expression"])
	if err != nil {
		writeError(w, r, err)
		return
	}
	result, err := expr.Eval(tree)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, EvaluateResponse{Expression: tree.String(), Result: result.String()})
}
