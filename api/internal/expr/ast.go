package expr

import "github.com/LuizColombo/sezzle-calculator/api/internal/calc"

// Node is an expression tree node. String returns the canonical form:
// single spaces around binary operators, typographic symbols, parentheses
// kept where the user wrote them. Parse(n.String()) yields the same tree.
type Node interface {
	String() string
}

// opSymbol is the canonical spelling of each operator.
var opSymbol = map[Kind]string{
	Plus:    "+",
	Minus:   "−",
	Times:   "×",
	Divide:  "÷",
	Power:   "^",
	Percent: "%",
	Sqrt:    "√",
}

// Num is a number literal.
type Num struct{ Value calc.Number }

// Group is a parenthesised expression, kept so the canonical form matches
// what was typed.
type Group struct{ X Node }

// Unary is prefix minus, plus or square root.
type Unary struct {
	Op Kind
	X  Node
}

// Binary is an infix operation.
type Binary struct {
	Op   Kind
	L, R Node
}

// Pct is x% on its own: x ÷ 100.
type Pct struct{ X Node }

// PctOf is "base ± rate%": base ± rate percent of base.
type PctOf struct {
	Op         Kind // Plus or Minus
	Base, Rate Node
}

func (n *Num) String() string    { return n.Value.String() }
func (n *Group) String() string  { return "(" + n.X.String() + ")" }
func (n *Unary) String() string  { return opSymbol[n.Op] + n.X.String() }
func (n *Binary) String() string { return n.L.String() + " " + opSymbol[n.Op] + " " + n.R.String() }
func (n *Pct) String() string    { return n.X.String() + "%" }
func (n *PctOf) String() string {
	return n.Base.String() + " " + opSymbol[n.Op] + " " + n.Rate.String() + "%"
}
