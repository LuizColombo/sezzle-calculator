import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  initialScientific,
  reduceExpression,
  type ScientificEvent,
  type ScientificState,
} from "../model/expression";
import { ExpressionDisplay } from "./ExpressionDisplay";

const KEYS: Record<string, ScientificEvent> = {
  "+": { type: "operator", op: "+" },
  "*": { type: "operator", op: "×" },
  "(": { type: "open" },
  ")": { type: "close" },
  "=": { type: "equals" },
};
const typed = (script: string, from = initialScientific): ScientificState =>
  (script.match(/./g) ?? []).reduce<ScientificState>(
    (s, ch) => reduceExpression(s, KEYS[ch] ?? { type: "digit", digit: ch }),
    from,
  );

describe("ExpressionDisplay", () => {
  it("shows 0 before anything is typed", () => {
    render(<ExpressionDisplay state={initialScientific} preview={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("0");
  });

  it("shows the expression with grouped numbers and the live preview below it", () => {
    render(<ExpressionDisplay state={typed("1234+5*2")} preview="1244" />);
    expect(screen.getByRole("status")).toHaveTextContent("1,234 + 5 × 2");
    expect(screen.getByTestId("preview")).toHaveTextContent("1,244");
  });

  it("shows the result large and the canonical expression above it", () => {
    const state = reduceExpression(typed("2+3*4="), {
      type: "resultReceived",
      expression: "2 + 3 × 4",
      value: "14",
    });
    render(<ExpressionDisplay state={state} preview={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("14");
    expect(screen.getByText("2 + 3 × 4 =")).toBeInTheDocument();
  });

  it("underlines the token the API points at and shows the detail", () => {
    const state = reduceExpression(typed("2+3="), {
      type: "apiFailed",
      error: {
        kind: "api",
        problem: {
          type: "x",
          title: "Invalid expression",
          status: 400,
          detail: "unexpected '3' at column 5",
        },
      },
      position: 5,
    });
    render(<ExpressionDisplay state={state} preview={null} />);
    const marked = screen.getByText("3");
    expect(marked).toHaveAttribute("data-error", "true");
    expect(screen.getByText("unexpected '3' at column 5")).toBeInTheDocument();
  });

  it("marks a calculation in flight as busy", () => {
    render(<ExpressionDisplay state={typed("2+3=")} preview={null} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
});
