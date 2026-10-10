# Documentation

| Document | What it covers |
|---|---|
| [api.md](api.md) | Using the API: every endpoint with curl, limits, the error format and each error type |
| [backend.md](backend.md) | Go service layout, request lifecycle, domain rules, configuration |
| [frontend.md](frontend.md) | React app layout, the state machine, design system, motion, accessibility |
| [testing.md](testing.md) | The test pyramid, coverage, fuzzing, CI |
| [deployment.md](deployment.md) | Docker images, compose, nginx, configuration |
| [adr/](adr/) | Architecture decision records, one per significant choice |
| [specs/](specs/) | Design specs, written and approved before any code: [phase 1](specs/2026-10-10-calculator-design.md), [phase 2](specs/2026-10-10-expression-evaluation-design.md) |
| [plans/](plans/) | Task-by-task implementation plans: [phase 1](plans/2026-10-10-calculator-plan.md), [phase 2](plans/2026-10-10-expression-evaluation-plan.md) |
| [ai/](ai/README.md) | How AI was used: process, prompts, corrections |

## Architecture decision records

1. [Standard library router](adr/0001-stdlib-router.md)
2. [Decimal arithmetic](adr/0002-decimal-arithmetic.md)
3. [Numbers travel as JSON strings](adr/0003-numbers-as-json-strings.md)
4. [RFC 9457 Problem Details for errors](adr/0004-problem-details-errors.md)
5. [Layered packages, not clean architecture](adr/0005-layered-not-clean-architecture.md)
6. [CSS Modules and design tokens, not Tailwind](adr/0006-css-modules-over-tailwind.md)
7. [One repository, each service owns its build](adr/0007-monorepo-layout.md)
8. [A Pratt parser, evaluated on the server](adr/0008-pratt-parser.md)
