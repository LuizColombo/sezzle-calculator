# Prompts

The prompts I used with Claude Code, in order. The working session was in Portuguese; these are English versions, consolidated so that each one carries the instructions and decisions of one step.

## 1. Brief and requirements analysis

> I'm applying for a junior software engineer role and I'll paste the take-home assignment below. Treat it as a senior-level deliverable: the brief says correctness, clarity and maintainability matter more than extra features, so "senior" should show in judgement, not in volume.
>
> Before proposing anything, read the brief and give me: (1) every explicit requirement and deliverable, mandatory and optional; (2) the implicit criteria a reviewer will use — code quality, test strategy, error handling, documentation, git history, and how AI was used; (3) the constraints (React + TypeScript, Go, a 2–4 hour target). I'll then give you my ideas, and I want yours too, including ones outside the tools we use day to day.
>
> [assignment text]

## 2. Architecture and quality bar

> My starting ideas — challenge any of them that don't fit a project this size:
>
> - **Layout:** a monorepo with the frontend and the Go API as independent projects, and the Docker and compose files at the root so one command runs everything. Propose a better structure if this one mixes concerns.
> - **Backend:** idiomatic Go, small packages with clear responsibilities, the domain logic isolated from HTTP so it can be tested without a server. I was considering clean architecture and gorilla/mux; tell me if they earn their place here.
> - **Resilience:** retries with exponential backoff where they make sense.
> - **Tests:** unit tests per layer, HTTP-level tests and end-to-end tests — whatever a reviewer would expect from production code.
> - **Frontend:** an Apple-like calculator: restrained palette, consistent design tokens, fluid motion with purpose (key presses, clearing, results), a calculation history, and every optional operation in the brief.
>
> What is missing? Rank your suggestions by value to the reviewer and flag anything that would be over-engineering.

## 3. Scope, tooling and history

> Decisions from your review: use the Go standard library router (Go 1.22+ patterns) instead of gorilla/mux, and keep the architecture proportional rather than layered for its own sake. Explain why Vite over the alternatives for a React + TypeScript SPA.
>
> Build in two phases so the history reads as a progression: phase 1 implements every operation as its own endpoint, with immediate execution in the UI; phase 2, in separate commits, adds operator precedence. Publish an interactive API reference generated from an OpenAPI contract, which is the single source of truth for both the server and the generated frontend types. Besides a concise README, keep a documentation folder covering the API, backend, frontend, testing and deployment, plus architecture decision records.
>
> Commits: one logical change each, Conventional Commits, small enough that the history explains the work.

## 4. Delivery and runtime robustness

> The reviewers will run this on a machine I know nothing about, so the Docker setup must be robust:
>
> - multi-stage builds, pinned base images, minimal non-root runtime images;
> - health checks, with the web container starting only after the API is healthy;
> - a host port that can be overridden without editing files;
> - LF line endings so a Windows clone still builds;
> - a failed rebuild must not take down a running stack.
>
> Add a Makefile for the common development commands, and document what each command does. For implementation, work task by task in this session instead of spreading the work across many sub-agents.

## 5. Review strategy

> Use a single, independent code-review agent, running on a different model from the one that implements. Call it at the end of each major milestone — backend, frontend model and client, UI, the whole repository — and keep the same agent across rounds so it can verify that its earlier findings were fixed. Every finding must be reproduced before it is acted on; judgement calls are reported as such, not as defects.

## 6. Specification and plan

> The design spec is approved: commit it on its own, before any code. Then write the implementation plan: bite-sized tasks, each with exact file paths, the failing test to write first, the implementation, the commands to run and their expected output, and the commit message. Verify any third-party API you rely on (for example the decimal library's edge cases) with a throwaway program instead of assuming its behaviour, and fold what you learn back into the spec.

## 7. Implementation

> Execute the plan task by task with TDD: write the test, watch it fail, implement, watch it pass, lint, commit. Run the full test suite before every commit. When the plan turns out to be wrong, deviate deliberately and explain the reason in the commit message. Stop and ask before running anything that could touch data or services outside this repository.

## 8. Usability review

> I tested the app in the browser [screenshot]: the history panel looks cramped, especially when clearing the whole history. Review the layout at desktop and phone widths, fix spacing and overflow, and make clearing the history feel deliberate — an animation and a confirmation that cannot be triggered by accident.

## 9. Light and dark themes

> Add a light theme and a toggle beside the existing dark one; not everyone prefers dark mode. Default to the operating system's preference, remember the user's choice, and avoid a flash of the wrong theme on load. Don't judge contrast by eye: add a test that checks every text and background pair in both themes against WCAG 2.2 AA.

## 10. Phase 2: operator precedence

> Start phase 2. Write a spec and a plan for evaluating whole expressions with operator precedence and parentheses, evaluated on the server through a new endpoint built on the same arithmetic as the phase 1 endpoints, so both paths always agree. Keep phase 1 working. Follow best practices throughout: parser limits against abusive input, precise error positions, fuzz testing, and errors in the same Problem Details format.

## 11. One mode

> Using the app, the scientific mode only adds parentheses and precedence on top of the basic one, and two modes that give different answers to the same keys are confusing. Fold them into a single calculator with precedence and parentheses, record the decision in an ADR, and keep the per-operation endpoints. Then review the documentation end to end — README, guides, screenshots — so nothing still describes two modes.
