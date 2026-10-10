import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Keypad } from "./Keypad";

describe("Keypad", () => {
  it("renders every key as an accessible button", () => {
    render(<Keypad send={vi.fn()} activeOperator={null} />);
    for (const name of [
      "all clear",
      "backspace",
      "percent",
      "divide",
      "square root",
      "power",
      "toggle sign",
      "multiply",
      "subtract",
      "add",
      "equals",
      "decimal point",
      ...Array.from({ length: 10 }, (_, i) => String(i)),
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("sends the key's event on click", async () => {
    const send = vi.fn();
    render(<Keypad send={send} activeOperator={null} />);
    await userEvent.click(screen.getByRole("button", { name: "7" }));
    await userEvent.click(screen.getByRole("button", { name: "multiply" }));
    await userEvent.click(screen.getByRole("button", { name: "square root" }));
    await userEvent.click(screen.getByRole("button", { name: "equals" }));
    expect(send.mock.calls).toEqual([
      [{ type: "digit", digit: "7" }],
      [{ type: "operator", operator: "multiply" }],
      [{ type: "unary", operator: "sqrt" }],
      [{ type: "equals" }],
    ]);
  });

  it("marks only the active operator as pressed", () => {
    render(<Keypad send={vi.fn()} activeOperator="add" />);
    expect(screen.getByRole("button", { name: "add" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "multiply" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "7" })).not.toHaveAttribute("aria-pressed");
  });
});
