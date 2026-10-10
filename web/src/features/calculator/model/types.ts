import type { components } from "../api/schema.gen";

export type Problem = components["schemas"]["Problem"];

/** Maximum significant digits the user can type into one number. */
export const MAX_INPUT_DIGITS = 16;

export type CalculatorError =
  { kind: "api"; problem: Problem } | { kind: "network"; message: string };
