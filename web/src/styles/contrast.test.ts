/**
 * WCAG 2.2 contrast check of the design tokens, in both themes.
 *
 * Reads tokens.css, so a colour change that breaks legibility fails CI
 * instead of shipping. Thresholds: 4.5:1 for normal text, 3:1 for large text
 * (the 28 px keys) and for non-text UI such as the focus ring.
 */
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest disables CSS processing, so read the file itself (tests run from web/).
const css = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no "${selector}" block in tokens.css`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const entries = [...body.matchAll(/--(color-[\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(
    (m): [string, string] => [m[1] ?? "", m[2] ?? ""],
  );
  return Object.fromEntries(entries);
}

const light = block(":root");
const dark = { ...light, ...block(':root[data-theme="dark"]') };

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground, background, minimum ratio, where it is used] */
const PAIRS: [string, string, number, string][] = [
  ["color-text", "color-bg", 4.5, "page text"],
  ["color-text", "color-surface", 4.5, "display value"],
  ["color-text-muted", "color-surface", 4.5, "expression line, history expressions"],
  ["color-text", "color-key", 4.5, "digit keys"],
  ["color-text", "color-key-hover", 4.5, "digit keys, hovered"],
  ["color-text", "color-key-function", 4.5, "function keys"],
  ["color-text", "color-key-function-hover", 4.5, "function keys, hovered"],
  ["color-on-accent", "color-accent", 3, "operator keys (large text)"],
  ["color-on-accent", "color-accent-hover", 3, "operator keys, hovered (large text)"],
  ["color-accent", "color-on-accent", 3, "active operator, inverted (large text)"],
  ["color-accent-text", "color-surface", 4.5, "History, Done, Clear (small text)"],
  ["color-accent-text", "color-key", 4.5, "History button, highlighted"],
  ["color-accent-text", "color-key-hover", 4.5, "text buttons, hovered"],
  ["color-text-muted", "color-key", 4.5, "history expression and API docs link, hovered"],
  ["color-error", "color-surface", 4.5, "Error and its detail"],
  ["color-on-error", "color-error", 4.5, "connection banner, Clear all"],
  ["color-accent-text", "color-bg", 3, "focus ring on the page"],
  ["color-accent-text", "color-surface", 3, "focus ring on the card"],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme contrast", (_, theme) => {
  it.each(PAIRS)("%s on %s ≥ %d:1 — %s", (fg, bg, min) => {
    const [f = "", b = ""] = [theme[fg], theme[bg]];
    expect(f, `--${fg} is not a 6-digit hex colour`).toMatch(/^#[0-9a-f]{6}$/i);
    expect(b, `--${bg} is not a 6-digit hex colour`).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrast(f, b)).toBeGreaterThanOrEqual(min);
  });
});
