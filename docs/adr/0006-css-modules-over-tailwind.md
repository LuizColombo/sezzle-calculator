# ADR 0006: CSS Modules and design tokens, not Tailwind

**Status:** Accepted · **Date:** 2026-10-10

## Context

The UI is one screen with six components and a bespoke look: a neutral palette with a single accent, light and dark themes, large radii, motion. Tailwind is the common default for React projects and is excellent for building quickly across many screens. A component library (shadcn/ui, Radix) would bring primitives we do not need.

## Decision

Style with CSS Modules (`Component.module.css`, bundled by Vite with no extra dependency) on top of a single token sheet, `src/styles/tokens.css`, that defines every colour, radius, space, type size and motion duration as a custom property. Themes switch by redefining the tokens under `prefers-color-scheme: dark`.

## Consequences

- The token sheet *is* the design system: a reviewer reads one file to see all of it, and a theme change touches only that file.
- JSX stays declarative; class names say what an element is (`styles.operator`), not how it looks.
- Reduced motion is handled once, in the tokens (durations collapse to 0) and in `MotionConfig`.
- No utility shortcuts and no build-time class scanning. Revisit if the UI grows past a dozen or so components or several people style it in parallel, where Tailwind's constraints pay off.
