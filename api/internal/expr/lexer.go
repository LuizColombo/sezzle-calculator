package expr

import "unicode"

// Kind identifies a token.
type Kind int

// Token kinds.
const (
	Number Kind = iota
	Plus
	Minus
	Times
	Divide
	Power
	Percent
	Sqrt
	LParen
	RParen
	EOF
)

// Token is a lexeme and its 1-based column.
type Token struct {
	Kind   Kind
	Text   string
	Column int
}

// symbols maps every accepted operator spelling, ASCII and typographic.
var symbols = map[rune]Kind{
	'+': Plus,
	'-': Minus, '−': Minus,
	'*': Times, '×': Times,
	'/': Divide, '÷': Divide,
	'^': Power,
	'%': Percent,
	'√': Sqrt,
	'(': LParen,
	')': RParen,
}

// Lex splits s into tokens, ending with an EOF token. Numbers are only
// scanned here; their value is checked by calc.Parse in the parser.
func Lex(s string) ([]Token, error) {
	runes := []rune(s)
	if len(runes) > MaxLength {
		return nil, syntaxError(0, "expression longer than %d characters", MaxLength)
	}

	var toks []Token
	for i := 0; i < len(runes); {
		r, column := runes[i], i+1
		switch {
		case unicode.IsSpace(r):
			i++
			continue
		case isDigit(r) || r == '.':
			end := scanNumber(runes, i)
			toks = append(toks, Token{Kind: Number, Text: string(runes[i:end]), Column: column})
			i = end
		default:
			kind, ok := symbols[r]
			if !ok {
				return nil, syntaxError(column, "unexpected %q", r)
			}
			toks = append(toks, Token{Kind: kind, Text: string(r), Column: column})
			i++
		}
		if len(toks) > MaxTokens {
			return nil, syntaxError(0, "expression has more than %d tokens", MaxTokens)
		}
	}
	return append(toks, Token{Kind: EOF, Column: len(runes) + 1}), nil
}

func isDigit(r rune) bool { return r >= '0' && r <= '9' }

// scanNumber returns the end of the number starting at i: digits, an
// optional point and digits, and an exponent only if a digit follows it.
func scanNumber(runes []rune, i int) int {
	digits := func(j int) int {
		for j < len(runes) && isDigit(runes[j]) {
			j++
		}
		return j
	}
	i = digits(i)
	if i < len(runes) && runes[i] == '.' {
		i = digits(i + 1)
	}
	if i < len(runes) && (runes[i] == 'e' || runes[i] == 'E') {
		j := i + 1
		if j < len(runes) && (runes[j] == '+' || runes[j] == '-') {
			j++
		}
		if j < len(runes) && isDigit(runes[j]) {
			i = digits(j)
		}
	}
	return i
}
