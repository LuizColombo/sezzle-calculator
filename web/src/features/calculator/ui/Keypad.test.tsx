import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Keypad } from "./Keypad";

describe("Keypad", () => {
  it("renders every key as an accessible button", () => {
    render(<Keypad send={vi.fn()} />);
    for (const name of [
      "all clear",
      "open parenthesis",
      "close parenthesis",
      "divide",
      "square root",
      "power",
      "percent",
      "multiply",
      "subtract",
      "add",
      "equals",
      "backspace",
      "decimal point",
      ...Array.from({ length: 10 }, (_, i) => String(i)),
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("sends the key's event on click", async () => {
    const send = vi.fn();
    render(<Keypad send={send} />);
    await userEvent.click(screen.getByRole("button", { name: "open parenthesis" }));
    await userEvent.click(screen.getByRole("button", { name: "7" }));
    await userEvent.click(screen.getByRole("button", { name: "multiply" }));
    await userEvent.click(screen.getByRole("button", { name: "square root" }));
    await userEvent.click(screen.getByRole("button", { name: "equals" }));
    expect(send.mock.calls).toEqual([
      [{ type: "open" }],
      [{ type: "digit", digit: "7" }],
      [{ type: "operator", op: "×" }],
      [{ type: "sqrt" }],
      [{ type: "equals" }],
    ]);
  });
});
