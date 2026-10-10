package expr

import (
	"fmt"

	"github.com/LuizColombo/sezzle-calculator/api/internal/calc"
)

// Binding powers (Pratt). Higher binds tighter. An infix operator continues
// the current expression while its left binding power exceeds the caller's
// right binding power; giving ^ a right power one below its left power makes
// it right-associative. Lowest to highest:
//
//	additive (+ −)        infix    10 / 10
//	multiplicative (× ÷)  infix    20 / 20
//	sign (− +)            prefix   30
//	power (^)             infix    40 / 39
//	percent (%)           postfix  50
//	square root (√)       prefix   60
const (
	bpAdditive       = 10
	bpMultiplicative = 20
	bpPrefixSign     = 30
	bpPower          = 40
	bpPercent        = 50
	bpSqrt           = 60
)

type infix struct{ left, right int }

var infixOps = map[Kind]infix{
	Plus:   {bpAdditive, bpAdditive},
	Minus:  {bpAdditive, bpAdditive},
	Times:  {bpMultiplicative, bpMultiplicative},
	Divide: {bpMultiplicative, bpMultiplicative},
	Power:  {bpPower, bpPower - 1},
}

// Parse turns s into an expression tree, or returns a *SyntaxError (wrapping
// ErrSyntax) or a calc error for an invalid number.
func Parse(s string) (Node, error) {
	toks, err := Lex(s)
	if err != nil {
		return nil, err
	}
	p := &parser{toks: toks}
	if p.peek().Kind == EOF {
		return nil, syntaxError(p.peek().Column, "empty expression")
	}
	n, err := p.expr(0)
	if err != nil {
		return nil, err
	}
	if t := p.peek(); t.Kind != EOF {
		return nil, syntaxError(t.Column, "unexpected %s", describe(t))
	}
	return n, nil
}

type parser struct {
	toks  []Token
	pos   int
	depth int
}

func (p *parser) peek() Token { return p.toks[p.pos] }

func (p *parser) next() Token {
	t := p.toks[p.pos]
	if t.Kind != EOF {
		p.pos++
	}
	return t
}

// expr parses an expression whose operators bind tighter than rbp.
func (p *parser) expr(rbp int) (Node, error) {
	left, err := p.prefix()
	if err != nil {
		return nil, err
	}
	for {
		t := p.peek()
		if t.Kind == Percent {
			if bpPercent <= rbp {
				return left, nil
			}
			p.next()
			left = &Pct{X: left}
			continue
		}
		op, ok := infixOps[t.Kind]
		if !ok || op.left <= rbp {
			return left, nil
		}
		p.next()
		right, err := p.nested(t, op.right)
		if err != nil {
			return nil, err
		}
		// "200 + 15%" means 15% of 200, as on a calculator; so does a signed
		// "5 + −15%", which /percent computes as percent(5, −15).
		if rate, ok := percentRate(right); ok && (t.Kind == Plus || t.Kind == Minus) {
			left = &PctOf{Op: t.Kind, Base: left, Rate: rate}
		} else {
			left = &Binary{Op: t.Kind, L: left, R: right}
		}
	}
}

func (p *parser) prefix() (Node, error) {
	t := p.next()
	switch t.Kind {
	case Number:
		v, err := calc.Parse(t.Text)
		if err != nil {
			return nil, &NumberError{Column: t.Column, Err: err}
		}
		return &Num{Value: v, Text: t.Text}, nil
	case LParen:
		x, err := p.nested(t, 0)
		if err != nil {
			return nil, err
		}
		if c := p.peek(); c.Kind != RParen {
			return nil, syntaxError(c.Column, "expected ')'")
		}
		p.next()
		return &Group{X: x}, nil
	case Minus, Plus:
		x, err := p.nested(t, bpPrefixSign)
		if err != nil {
			return nil, err
		}
		return &Unary{Op: t.Kind, X: x}, nil
	case Sqrt:
		x, err := p.nested(t, bpSqrt)
		if err != nil {
			return nil, err
		}
		return &Unary{Op: Sqrt, X: x}, nil
	}
	return nil, syntaxError(t.Column, "unexpected %s", describe(t))
}

// nested parses a sub-expression one level deeper, enforcing MaxDepth at
// the token that opened the level.
func (p *parser) nested(opener Token, rbp int) (Node, error) {
	if p.depth >= MaxDepth {
		return nil, syntaxError(opener.Column,
			"more than %d levels of nesting (parentheses, prefix operators or chained ^)", MaxDepth)
	}
	p.depth++
	defer func() { p.depth-- }()
	return p.expr(rbp)
}

// percentRate reports whether n is "x%" or "±x%", returning the rate (x or ±x).
func percentRate(n Node) (Node, bool) {
	switch n := n.(type) {
	case *Pct:
		return n.X, true
	case *Unary:
		if pct, ok := n.X.(*Pct); ok && (n.Op == Minus || n.Op == Plus) {
			return &Unary{Op: n.Op, X: pct.X}, true
		}
	}
	return nil, false
}

func describe(t Token) string {
	switch t.Kind {
	case EOF:
		return "end of expression"
	case Number:
		return fmt.Sprintf("number %q", t.Text)
	case LParen:
		return "'('"
	case RParen:
		return "')'"
	}
	return "'" + t.Text + "'" // as typed: '*' for someone who typed '*'
}
