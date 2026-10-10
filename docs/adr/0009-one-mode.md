# ADR 0009: One mode, with operator precedence

**Status:** Accepted · **Date:** 2026-10-10 · **Supersedes:** the two-mode decision in the [phase 2 spec](../specs/2026-10-10-expression-evaluation-design.md) §2.1

## Context

Phase 1 shipped an immediate-execution calculator (`2 + 3 × 4 = 20`). Phase 2 added a Scientific mode with operator precedence and parentheses (`2 + 3 × 4 = 14`) beside it, behind a Basic/Scientific switch.

Using both, the difference turned out to be smaller than the cost. The Scientific mode was the Basic mode plus parentheses and precedence; nothing a user does in Basic is impossible in Scientific. Two modes that give different answers to the same keys are confusing, and modern phone calculators apply precedence in their default mode. The assignment also asks to favour correctness and clarity over extra features, and a second mode doubles the UI, the state machines and their tests.

## Decision

Keep one calculator: the expression engine (precedence, parentheses, live preview, `POST /api/v1/evaluate`) with one keypad. Remove the Basic state machine, its hook, its keypad and the mode switch. `±` is not needed: `−` typed where an operand is expected is a sign.

The per-operation endpoints (`/api/v1/add` … `/api/v1/percent`) stay. They are the assignment's "endpoints for calculator operations", they are documented and tested, and the expression evaluator is built on the same `calc` functions. The UI simply calls `/evaluate`.

## Consequences

- One state machine (`model/expression.ts`) and one hook to read, test and defend.
- The git history keeps both earlier versions (`v1.0.0` immediate execution, `v2.0.0` two modes); this record explains why v3 has one.
- The UI no longer exercises the per-operation endpoints; their coverage comes from the Go tests and the API docs.
