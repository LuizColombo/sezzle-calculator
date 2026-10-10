package expr

import (
	"fmt"

	"github.com/LuizColombo/sezzle-calculator/api/internal/calc"
)

// one is the rate for a plain x%, which is x × 1 ÷ 100.
var one = mustNumber("1")

func mustNumber(s string) calc.Number {
	n, err := calc.Parse(s)
	if err != nil {
		panic(err)
	}
	return n
}

var binaryOps = map[Kind]func(a, b calc.Number) (calc.Number, error){
	Plus:   calc.Add,
	Minus:  calc.Subtract,
	Times:  calc.Multiply,
	Divide: calc.Divide,
	Power:  calc.Power,
}

// Eval computes the value of n with the calc package, so results and errors
// are exactly those of the per-operation endpoints. The first error in
// evaluation order (left before right) is returned. Recursion depth is
// bounded by the parser's MaxDepth.
func Eval(n Node) (calc.Number, error) {
	switch n := n.(type) {
	case *Num:
		return n.Value, nil
	case *Group:
		return Eval(n.X)
	case *Unary:
		x, err := Eval(n.X)
		if err != nil {
			return calc.Number{}, err
		}
		switch n.Op {
		case Minus:
			return calc.Subtract(calc.Number{}, x) // the zero Number is 0
		case Sqrt:
			return calc.Sqrt(x)
		default: // Plus
			return x, nil
		}
	case *Binary:
		l, err := Eval(n.L)
		if err != nil {
			return calc.Number{}, err
		}
		r, err := Eval(n.R)
		if err != nil {
			return calc.Number{}, err
		}
		return binaryOps[n.Op](l, r)
	case *Pct:
		x, err := Eval(n.X)
		if err != nil {
			return calc.Number{}, err
		}
		return calc.Percent(x, one)
	case *PctOf:
		base, err := Eval(n.Base)
		if err != nil {
			return calc.Number{}, err
		}
		rate, err := Eval(n.Rate)
		if err != nil {
			return calc.Number{}, err
		}
		part, err := calc.Percent(base, rate)
		if err != nil {
			return calc.Number{}, err
		}
		return binaryOps[n.Op](base, part)
	}
	panic(fmt.Sprintf("expr: unknown node %T", n))
}
