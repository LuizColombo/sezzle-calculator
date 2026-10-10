import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Display } from "./Display";

const base = { expression: null, pending: false, error: null, animationKey: "input" };

describe("Display", () => {
  it("shows the formatted value in a polite live region", () => {
    render(<Display {...base} value="1234.5" />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("1,234.5");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("shows the expression line above the value", () => {
    render(<Display {...base} value="3" expression="1 + 2 =" />);
    expect(screen.getByText("1 + 2 =")).toBeInTheDocument();
  });

  it("marks a pending calculation as busy", () => {
    render(<Display {...base} value="3" pending />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("shows the API problem detail instead of the expression on error", () => {
    render(
      <Display
        {...base}
        value="Error"
        expression="1 ÷ 0"
        error={{
          kind: "api",
          problem: {
            type: "x",
            title: "Division by zero",
            status: 422,
            detail: "division by zero",
          },
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Error");
    expect(screen.getByText("division by zero")).toBeInTheDocument();
    expect(screen.queryByText("1 ÷ 0")).not.toBeInTheDocument();
  });

  it("uses a smaller size for long values", () => {
    render(<Display {...base} value="1234567890123456" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-size", "sm");
  });
});
