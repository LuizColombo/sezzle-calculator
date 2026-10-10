import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../../test/server";
import type { ScientificEvent } from "../model/expression";
import { useScientific } from "./useScientific";

const KEYS: Record<string, ScientificEvent> = {
  "+": { type: "operator", op: "+" },
  "*": { type: "operator", op: "×" },
  "/": { type: "operator", op: "÷" },
  "(": { type: "open" },
  ")": { type: "close" },
  r: { type: "sqrt" },
  "<": { type: "backspace" },
  "=": { type: "equals" },
};

function type(send: (e: ScientificEvent) => void, script: string) {
  act(() => {
    for (const ch of script.match(/./g) ?? []) send(KEYS[ch] ?? { type: "digit", digit: ch });
  });
}

function setup(tuning = {}) {
  const record = vi.fn();
  const hook = renderHook(() => useScientific(tuning, record));
  return { ...hook, record };
}

describe("useScientific", () => {
  it("evaluates with precedence on = and records the canonical expression", async () => {
    const { result, record } = setup();
    type(result.current.send, "2+3*4=");
    await waitFor(() => {
      expect(result.current.state.phase).toBe("result");
    });
    expect(result.current.state.result).toEqual({ expression: "2 + 3 × 4", value: "14" });
    expect(record).toHaveBeenCalledWith({ expression: "2 + 3 × 4 =", result: "14" });
  });

  it("closes open parentheses before evaluating", async () => {
    const { result } = setup();
    type(result.current.send, "(2+3=");
    expect(result.current.state.pending).toEqual({ expression: "(2 + 3)" });
    await waitFor(() => {
      expect(result.current.state.result?.value).toBe("5");
    });
  });

  it("shows a live preview of a complete expression after a short pause", async () => {
    const { result, record } = setup();
    type(result.current.send, "2+3*4");
    expect(result.current.preview).toBeNull();
    await waitFor(() => {
      expect(result.current.preview).toBe("14");
    });
    expect(record).not.toHaveBeenCalled();
  });

  it("drops a preview that no longer matches the expression", async () => {
    const { result } = setup();
    type(result.current.send, "2+3");
    await waitFor(() => {
      expect(result.current.preview).toBe("5");
    });
    type(result.current.send, "*");
    expect(result.current.preview).toBeNull();
  });

  it("does not preview a lone number or an unfinished expression", async () => {
    const calls = vi.fn();
    server.use(
      http.post("/api/v1/evaluate", () => {
        calls();
        return HttpResponse.json({ expression: "x", result: "0" });
      }),
    );
    const { result } = setup();
    type(result.current.send, "23");
    type(result.current.send, "+");
    await new Promise((r) => setTimeout(r, 400));
    expect(calls).not.toHaveBeenCalled();
  });

  it("debounces: rapid edits make one preview request", async () => {
    const calls = vi.fn();
    server.use(
      http.post("/api/v1/evaluate", async ({ request }) => {
        const { expression } = (await request.json()) as { expression: string };
        calls(expression);
        return HttpResponse.json({ expression, result: "1" });
      }),
    );
    const { result } = setup();
    type(result.current.send, "2+3");
    type(result.current.send, "3");
    type(result.current.send, "3");
    await waitFor(() => {
      expect(result.current.preview).toBe("1");
    });
    expect(calls.mock.calls).toEqual([["2 + 333"]]);
  });

  it("reports a syntax error with its position", async () => {
    server.use(
      http.post("/api/v1/evaluate", () =>
        HttpResponse.json(
          {
            type: "x#invalid-expression",
            title: "Invalid expression",
            status: 400,
            detail: "unexpected ')' at column 6",
            position: 6,
          },
          { status: 400, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    const { result, record } = setup();
    type(result.current.send, "2+3=");
    await waitFor(() => {
      expect(result.current.state.phase).toBe("error");
    });
    expect(result.current.state.errorPosition).toBe(6);
    expect(record).not.toHaveBeenCalled();
  });

  it("retries after a network failure", async () => {
    server.use(http.post("/api/v1/evaluate", () => HttpResponse.error()));
    const { result } = setup({ attempts: 1 });
    type(result.current.send, "2+3=");
    await waitFor(() => {
      expect(result.current.state.error?.kind).toBe("network");
    });
    server.resetHandlers();
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.state.result?.value).toBe("5");
    });
  });
});
