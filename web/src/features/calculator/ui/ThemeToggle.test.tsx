import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  it("names the theme it switches to and calls onToggle", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<ThemeToggle theme="light" onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<ThemeToggle theme="dark" onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });
});
