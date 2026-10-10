# ADR 0008: A Pratt parser, evaluated on the server

**Status:** Accepted · **Date:** 2026-10-10

## Context

Phase 2 adds operator precedence and parentheses (`2 + 3 × 4 = 14`). Two questions: where to evaluate, and how to parse.

Evaluating in the browser would be quick to build, but JavaScript has no decimal type; it would either reintroduce binary floats or duplicate the server's decimal arithmetic. Evaluating on the server keeps one implementation of every operation.

For parsing, the usual options are the shunting-yard algorithm, a hand-written recursive-descent parser with one function per precedence level, or a Pratt parser. Shunting-yard is compact but needs special cases for unary minus and right-associative `^`, and produces postfix output rather than a tree we can print back. Recursive descent with a function per level is readable but grows a function for every level. Parser generators are overkill for six levels of arithmetic.

## Decision

Evaluate on the server with a new endpoint, `POST /api/v1/evaluate`, implemented by a new package `internal/expr`: a lexer, a **Pratt parser** producing an AST, and an evaluator that calls the existing `calc` functions. Precedence and associativity live in one table of binding powers. The AST prints a canonical form that the API echoes.

## Consequences

- One arithmetic implementation: Basic and Scientific modes agree on every result and every error.
- Adding an operator is one table row and, if it has new semantics, one AST node.
- The parser is recursive, so input is bounded (length, tokens, nesting depth) before recursion goes deeper; the fuzz test checks it never panics and that the canonical form round-trips.
- Every evaluation is a network request. The Scientific mode's live preview is therefore debounced and cancellable; offline, only the result of `=` is affected, with the same retry as phase 1.
