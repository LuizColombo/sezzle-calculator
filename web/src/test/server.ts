import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const problem = (status: number, slug: string, title: string, detail: string) =>
  HttpResponse.json(
    {
      type: `https://example.test/errors#${slug}`,
      title,
      status,
      detail,
      instance: "/api/v1/evaluate",
    },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );

/**
 * Expressions the UI tests evaluate, with the API's answers. A lookup table
 * rather than a second expression evaluator: the Go tests own parsing,
 * precedence and arithmetic; these tests own wiring and rendering.
 */
export const EXPRESSIONS: Record<string, string> = {
  "1 + 2": "3",
  "2 + 3": "5",
  "2 + 3 × 4": "14",
  "(2 + 3) × 4": "20",
  "(2 + 3)": "5",
  "√16 + 9": "13",
  "2 × 3": "6",
  "6 + 1": "7",
  "2 × 40": "80",
  "1 ÷ 3": "0.3333333333333333",
  "12 × 3": "36",
};

export const handlers = [
  http.post("/api/v1/evaluate", async ({ request }) => {
    const { expression } = (await request.json()) as { expression: string };
    if (/÷ 0(?!\.)/.test(expression)) {
      return problem(422, "division-by-zero", "Division by zero", "division by zero");
    }
    const result = EXPRESSIONS[expression];
    if (result === undefined) {
      return problem(
        400,
        "invalid-expression",
        "Invalid expression",
        `no fixture for ${expression}`,
      );
    }
    return HttpResponse.json({ expression, result });
  }),
];

export const server = setupServer(...handlers);
