import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Keypad } from "./Keypad";
import { BASIC_KEYS, SCIENTIFIC_KEYS } from "./keys";

describe("Keypad", () => {
  it("renders every key as an accessible button", () => {
    render(<Keypad keys={BASIC_KEYS} send={vi.fn()} activeOperator={null} />);
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
    render(<Keypad keys={BASIC_KEYS} send={send} activeOperator={null} />);
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
    render(<Keypad keys={BASIC_KEYS} send={vi.fn()} activeOperator="add" />);
    expect(screen.getByRole("button", { name: "add" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "multiply" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "7" })).not.toHaveAttribute("aria-pressed");
  });
});

describe("Keypad, scientific", () => {
  it("has parentheses and backspace, and no sign key", async () => {
    const send = vi.fn();
    render(<Keypad keys={SCIENTIFIC_KEYS} send={send} activeOperator={null} />);
    for (const name of [
      "open parenthesis",
      "close parenthesis",
      "backspace",
      "square root",
      "power",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "toggle sign" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "open parenthesis" }));
    await userEvent.click(screen.getByRole("button", { name: "multiply" }));
    expect(send.mock.calls).toEqual([[{ type: "open" }], [{ type: "operator", op: "×" }]]);
  });
});
