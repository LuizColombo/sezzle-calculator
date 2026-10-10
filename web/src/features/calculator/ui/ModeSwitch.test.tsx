import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModeSwitch } from "./ModeSwitch";

describe("ModeSwitch", () => {
  it("is a radio group showing the current mode", () => {
    render(<ModeSwitch mode="basic" onChange={vi.fn()} />);
    expect(screen.getByRole("radiogroup", { name: "Mode" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Basic" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Scientific" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("changes mode on click", async () => {
    const onChange = vi.fn();
    render(<ModeSwitch mode="basic" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Scientific" }));
    expect(onChange).toHaveBeenCalledWith("scientific");
  });

  it("moves with the arrow keys and keeps one tab stop", async () => {
    const onChange = vi.fn();
    render(<ModeSwitch mode="basic" onChange={onChange} />);
    const basic = screen.getByRole("radio", { name: "Basic" });
    expect(basic).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Scientific" })).toHaveAttribute("tabindex", "-1");
    basic.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("scientific");
  });
});
