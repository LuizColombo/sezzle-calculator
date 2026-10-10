import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

type Inputs = Record<string, string>;

/**
 * A float-based stand-in for the Go API. UI tests check wiring and rendering,
 * not arithmetic (the Go tests own that), so float precision is enough here.
 */
const compute: Record<string, (i: Inputs) => number> = {
  add: (i) => Number(i.a) + Number(i.b),
  subtract: (i) => Number(i.a) - Number(i.b),
  multiply: (i) => Number(i.a) * Number(i.b),
  divide: (i) => Number(i.a) / Number(i.b),
  power: (i) => Number(i.base) ** Number(i.exponent),
  sqrt: (i) => Math.sqrt(Number(i.value)),
  percent: (i) => (Number(i.value) * Number(i.percent)) / 100,
};

const problem = (status: number, slug: string, title: string, detail: string, instance: string) =>
  HttpResponse.json(
    { type: `https://example.test/errors#${slug}`, title, status, detail, instance },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );

export const handlers = [
  http.post("/api/v1/:operation", async ({ params, request }) => {
    const operation = String(params.operation);
    const inputs = (await request.json()) as Inputs;
    const path = `/api/v1/${operation}`;
    if (operation === "divide" && Number(inputs.b) === 0) {
      return problem(422, "division-by-zero", "Division by zero", "division by zero", path);
    }
    const fn = compute[operation];
    if (!fn) return problem(404, "not-found", "Not found", `no route for POST ${path}`, path);
    return HttpResponse.json({ operation, inputs, result: String(fn(inputs)) });
  }),
];

export const server = setupServer(...handlers);
